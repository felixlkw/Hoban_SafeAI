"""동적 위험 provider 추상화 — Mock(기본) / KMA·VWorld(실 API) / 팩토리.

설계(frontend dynamicRiskProvider.ts 와 동형):
  - WeatherProvider/GeoHazardProvider 추상 인터페이스. 출력 스키마(WeatherContext/
    GeoHazardContext)가 계약 → 룰엔진·라우트·UI 무수정으로 impl 만 교체.
  - MockWeatherProvider/MockGeoHazardProvider: 결정적 시나리오(PoC·테스트).
  - KmaWeatherProvider: 기상청 단기예보(getUltraSrtNcst) + 기상특보(getWthrWrnList)
    실 호출·정규화·TTL 캐시. 키/네트워크 실패 시 mock 폴백(+경고) — 데모 안전.
  - VworldGeoHazardProvider: V-World Geocoder 실 호출(주소→좌표). 지형 주제도는
    아직 mock(2차 과제, runbook §5).
  - 팩토리: config.WEATHER_PROVIDER/GEO_PROVIDER 로 분기.

실측 한계(정직 표기): 초단기실황엔 순간풍속·낙뢰·적설·체감온도 카테고리가 없어
gust(평균×1.5 근사)·lightning(False)·snow(PTY 기반)·apparent_temp(여름 heat index
근사)로 보정. 정밀값은 생활기상지수·초단기예보 API 추가 연동 시 교체(runbook §6).

⚠️ API 키는 백엔드 전용. 신청·연동 절차는
   .claude/skills/jha-dynamic-risk/references/api_onboarding_runbook.md 참조.
"""
from __future__ import annotations

import datetime
import logging
from abc import ABC, abstractmethod
from typing import Any, Optional

import httpx

from app import config
from app.services.dynamic_risk.grid import lat_lon_to_grid
from app.services.dynamic_risk.schemas import (
    GeoHazardContext,
    WeatherContext,
    WeatherWarning,
)

logger = logging.getLogger("jha.dynamic_risk")

# ── 단순 TTL 캐시(프로세스 인메모리). 운영은 Redis 권장(runbook §6) ──────────
_CACHE: dict[str, tuple[float, Any]] = {}


def _cache_get(key: str) -> Optional[Any]:
    hit = _CACHE.get(key)
    if not hit:
        return None
    expiry, val = hit
    # time.monotonic 미사용(테스트 결정성 무관·실 운영 충분). datetime epoch 사용.
    if _now_epoch() >= expiry:
        _CACHE.pop(key, None)
        return None
    return val


def _cache_put(key: str, val: Any, ttl_s: float) -> None:
    _CACHE[key] = (_now_epoch() + ttl_s, val)


def _now_epoch() -> float:
    return datetime.datetime.now().timestamp()


# ── 추상 인터페이스 ──────────────────────────────────────────────────────────
class WeatherProvider(ABC):
    @abstractmethod
    def get_weather(self, lat: float, lon: float, *, scenario: Optional[str] = None) -> WeatherContext:
        ...


class GeoHazardProvider(ABC):
    @abstractmethod
    def geocode(self, address: str) -> tuple[float, float]:
        """주소 → (lat, lon). 실패 시 ValueError."""
        ...

    @abstractmethod
    def get_geo_hazard(self, lat: float, lon: float, address: str) -> GeoHazardContext:
        ...


# ── Mock (결정적 시나리오) ───────────────────────────────────────────────────
_SCENARIOS = {
    "calm":     dict(temp=18.0, app=18.0, wind=2.0, gust=3.5, rain=0.0, snow=0.0, pty="없음", light=False, warns=[]),
    "windy":    dict(temp=12.0, app=10.0, wind=9.0, gust=13.2, rain=0.0, snow=0.0, pty="없음", light=False,
                     warns=[("WIND_ADVISORY", "강풍주의보", "주의보")]),
    "rainy":    dict(temp=16.0, app=16.0, wind=5.0, gust=8.0, rain=12.0, snow=0.0, pty="비", light=True,
                     warns=[("HEAVY_RAIN_ADVISORY", "호우주의보", "주의보")]),
    "heatwave": dict(temp=35.0, app=37.5, wind=1.5, gust=2.5, rain=0.0, snow=0.0, pty="없음", light=False,
                     warns=[("HEAT_WAVE_WARNING", "폭염경보", "경보")]),
    "storm":    dict(temp=14.0, app=11.0, wind=14.0, gust=22.0, rain=28.0, snow=0.0, pty="소나기", light=True,
                     warns=[("HEAVY_RAIN_WARNING", "호우경보", "경보"), ("WIND_WARNING", "강풍경보", "경보")]),
}


class MockWeatherProvider(WeatherProvider):
    def get_weather(self, lat: float, lon: float, *, scenario: Optional[str] = None) -> WeatherContext:
        s = _SCENARIOS.get(scenario or "calm", _SCENARIOS["calm"])
        nx, ny = lat_lon_to_grid(lat, lon)
        return WeatherContext(
            observed_at="2026-06-14T09:00:00+09:00",  # 결정적(테스트 안정)
            grid_nx=nx, grid_ny=ny, region_name="데모 현장",
            temp_c=s["temp"], apparent_temp_c=s["app"], humidity_pct=60.0,
            wind_ms=s["wind"], gust_ms=s["gust"], rain_mm_1h=s["rain"], snow_cm_1h=s["snow"],
            pty=s["pty"], lightning=s["light"], pm10=45.0,
            warnings=[WeatherWarning(code=c, label=l, level=lv, region="데모 현장")
                      for (c, l, lv) in s["warns"]],
            source="mock",
        )


class MockGeoHazardProvider(GeoHazardProvider):
    def geocode(self, address: str) -> tuple[float, float]:
        return (37.5665, 126.9780)  # 서울시청(결정적)

    def get_geo_hazard(self, lat: float, lon: float, address: str) -> GeoHazardContext:
        return GeoHazardContext(
            lat=lat, lon=lon, address=address or "데모 현장",
            landslide_grade=2, flood_risk="관심",
            underground_utilities=["가스관", "전력선"],
            soft_ground=False, slope_deg=8.0, near_high_voltage=False,
            source="mock",
        )


# ── KMA 정규화 헬퍼 ──────────────────────────────────────────────────────────
# 초단기실황 PTY: 0없음 1비 2비/눈 3눈 5빗방울 6진눈깨비 7눈날림
_PTY_MAP = {"0": "없음", "1": "비", "2": "비/눈", "3": "눈", "5": "비", "6": "비/눈", "7": "눈"}

# 기상특보 12종 — 라벨→(code, level). 경보를 주의보보다 먼저(부분일치 안전).
_WARN_DEFS: list[tuple[str, str, str]] = [
    ("호우경보", "HEAVY_RAIN_WARNING", "경보"), ("호우주의보", "HEAVY_RAIN_ADVISORY", "주의보"),
    ("강풍경보", "WIND_WARNING", "경보"), ("강풍주의보", "WIND_ADVISORY", "주의보"),
    ("풍랑경보", "WAVE_WARNING", "경보"), ("풍랑주의보", "WAVE_ADVISORY", "주의보"),
    ("대설경보", "HEAVY_SNOW_WARNING", "경보"), ("대설주의보", "HEAVY_SNOW_ADVISORY", "주의보"),
    ("폭염경보", "HEAT_WAVE_WARNING", "경보"), ("폭염주의보", "HEAT_WAVE_ADVISORY", "주의보"),
    ("한파경보", "COLD_WAVE_WARNING", "경보"), ("한파주의보", "COLD_WAVE_ADVISORY", "주의보"),
    ("건조경보", "DRY_WARNING", "경보"), ("건조주의보", "DRY_ADVISORY", "주의보"),
    ("태풍경보", "TYPHOON_WARNING", "경보"), ("태풍주의보", "TYPHOON_ADVISORY", "주의보"),
    ("폭풍해일경보", "STORM_SURGE_WARNING", "경보"), ("폭풍해일주의보", "STORM_SURGE_ADVISORY", "주의보"),
    ("황사경보", "DUST_WARNING", "경보"),
]

# 기상특보 지점(stnId) — 주요 관서. lat/lon 최근접 선택. 미스매치 시 108(서울).
_STN_TABLE: list[tuple[int, float, float, str]] = [
    (108, 37.5714, 126.9658, "서울"), (159, 35.1047, 129.0320, "부산"),
    (143, 35.8780, 128.6530, "대구"), (112, 37.4776, 126.6244, "인천"),
    (156, 35.1729, 126.8916, "광주"), (133, 36.3724, 127.3720, "대전"),
    (152, 35.5394, 129.3114, "울산"), (119, 37.2576, 126.9760, "수원"),
    (105, 37.7515, 128.8910, "강릉"), (131, 36.6393, 127.4407, "청주"),
    (146, 35.8214, 127.1542, "전주"), (184, 33.5141, 126.5297, "제주"),
]


def _nearest_stn(lat: float, lon: float) -> int:
    best, best_d = 108, float("inf")
    for stn, slat, slon, _ in _STN_TABLE:
        d = (lat - slat) ** 2 + (lon - slon) ** 2
        if d < best_d:
            best, best_d = stn, d
    return best


def _apparent_temp(t: float, rh: float) -> float:
    """체감온도 근사. 여름(≥25℃)은 NWS heat index(℃ 변환), 그 외 기온 동일.
    정밀값은 기상청 생활기상지수 API 별도 연동(runbook §6)."""
    if t < 25:
        return round(t, 1)
    tf = t * 9 / 5 + 32
    hi = (-42.379 + 2.04901523 * tf + 10.14333127 * rh - 0.22475541 * tf * rh
          - 0.00683783 * tf * tf - 0.05481717 * rh * rh + 0.00122874 * tf * tf * rh
          + 0.00085282 * tf * rh * rh - 0.00000199 * tf * tf * rh * rh)
    return round((hi - 32) * 5 / 9, 1)


def _ncst_base(now: datetime.datetime) -> tuple[str, str]:
    """초단기실황 base_date/base_time — 매시 정시 생성, 약 40분 후 제공.
    분<40 이면 직전 정시로 보정."""
    base = now if now.minute >= 40 else now - datetime.timedelta(hours=1)
    return base.strftime("%Y%m%d"), base.strftime("%H") + "00"


def _parse_warnings(items: list[dict], region: str) -> list[WeatherWarning]:
    """getWthrWrnList title 파싱 → 현재 발효 특보 집합(근사).
    title 예: "[특보] 제06-53호 : .../ 강풍주의보해제,호우주의보 발효 (*)".
    오래된→최신 순으로 발효/해제 누적(반환 10~50건 윈도우 내 근사)."""
    active: dict[str, tuple[str, str]] = {}  # label -> (code, level)
    # tmSeq 오름차순(오래된 것 먼저)으로 상태 누적
    for it in sorted(items, key=lambda x: x.get("tmSeq", 0)):
        title = str(it.get("title", ""))
        seg = title.split("/", 1)[1] if "/" in title else title
        for token in seg.replace("(*)", "").split(","):
            for label, code, level in _WARN_DEFS:
                if label in token:
                    if "해제" in token:
                        active.pop(label, None)
                    elif "발효" in token or "발표" in token:
                        active[label] = (code, level)
    return [WeatherWarning(code=c, label=lbl, level=lv, region=region)
            for lbl, (c, lv) in active.items()]


# ── 실 API provider ──────────────────────────────────────────────────────────
class KmaWeatherProvider(WeatherProvider):
    """기상청 단기예보(초단기실황) + 기상특보. config.DATA_GO_KR_SERVICE_KEY."""

    _NCST = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst"
    _WARN = "http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList"

    def get_weather(self, lat: float, lon: float, *, scenario: Optional[str] = None) -> WeatherContext:
        if not config.DATA_GO_KR_SERVICE_KEY:
            logger.warning("DATA_GO_KR_SERVICE_KEY 부재 → mock 기상 폴백")
            return MockWeatherProvider().get_weather(lat, lon, scenario=scenario)
        nx, ny = lat_lon_to_grid(lat, lon)
        cache_key = f"kma:{nx}:{ny}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached
        try:
            ctx = self._fetch(lat, lon, nx, ny)
        except Exception as exc:  # noqa: BLE001 — 외부 API 실패는 mock 폴백
            logger.warning("KMA 실 호출 실패(%s) → mock 폴백", type(exc).__name__)
            return MockWeatherProvider().get_weather(lat, lon, scenario=scenario)
        _cache_put(cache_key, ctx, config.WEATHER_CACHE_TTL_S)
        return ctx

    def _fetch(self, lat: float, lon: float, nx: int, ny: int) -> WeatherContext:
        now = datetime.datetime.now()
        bd, bt = _ncst_base(now)
        key = config.DATA_GO_KR_SERVICE_KEY
        with httpx.Client(timeout=config.EXTERNAL_API_TIMEOUT_S) as client:
            r = client.get(self._NCST, params={
                "serviceKey": key, "dataType": "JSON", "base_date": bd, "base_time": bt,
                "nx": nx, "ny": ny, "numOfRows": 100, "pageNo": 1})
            cats = _extract_cats(r.json())
            warns: list[WeatherWarning] = []
            stn = _nearest_stn(lat, lon)
            region = next((n for s, _, _, n in _STN_TABLE if s == stn), "현장")
            try:
                rw = client.get(self._WARN, params={
                    "serviceKey": key, "dataType": "JSON", "numOfRows": 50,
                    "pageNo": 1, "stnId": stn})
                witems = _extract_items(rw.json())
                warns = _parse_warnings(witems, region)
            except Exception as exc:  # noqa: BLE001 — 특보 실패는 무경보로 계속
                logger.warning("KMA 특보 조회 실패(%s) → 특보 생략", type(exc).__name__)

        temp = float(cats.get("T1H", 0.0))
        rh = float(cats.get("REH", 0.0))
        wind = float(cats.get("WSD", 0.0))
        rn1 = cats.get("RN1", "0")
        rain = 0.0 if rn1 in ("강수없음", "-", "", None) else _to_float(rn1)
        pty_code = str(cats.get("PTY", "0")).split(".")[0]
        pty = _PTY_MAP.get(pty_code, "없음")
        snow = rain if pty in ("눈", "비/눈") else 0.0  # 실황 적설 카테고리 부재 → 근사
        return WeatherContext(
            observed_at=now.replace(microsecond=0).isoformat(),
            grid_nx=nx, grid_ny=ny, region_name=f"{region}(격자 {nx},{ny})",
            temp_c=temp, apparent_temp_c=_apparent_temp(temp, rh), humidity_pct=rh,
            wind_ms=wind, gust_ms=round(wind * 1.5, 1),  # 순간풍속 근사(실황 미제공)
            rain_mm_1h=rain, snow_cm_1h=snow, pty=pty,
            lightning=False,  # 낙뢰는 초단기예보(getUltraSrtFcst LGT) 추가 연동 시 교체
            pm10=None, warnings=warns, source="kma",
        )


class VworldGeoHazardProvider(GeoHazardProvider):
    """V-World Geocoder(주소→좌표) 실 호출. 지형 주제도는 2차(mock)."""

    _GEOCODE = "https://api.vworld.kr/req/address"

    def geocode(self, address: str) -> tuple[float, float]:
        if not config.VWORLD_API_KEY:
            logger.warning("VWORLD_API_KEY 부재 → mock 지오코딩 폴백")
            return MockGeoHazardProvider().geocode(address)
        cache_key = f"vw:{address}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached
        try:
            coord = self._geocode(address)
        except Exception as exc:  # noqa: BLE001
            logger.warning("V-World 지오코딩 실패(%s) → mock 폴백", type(exc).__name__)
            return MockGeoHazardProvider().geocode(address)
        _cache_put(cache_key, coord, config.WEATHER_CACHE_TTL_S)
        return coord

    def _geocode(self, address: str) -> tuple[float, float]:
        # 도로명(ROAD) 우선, 실패 시 지번(PARCEL) 재시도.
        with httpx.Client(timeout=config.EXTERNAL_API_TIMEOUT_S) as client:
            for addr_type in ("ROAD", "PARCEL"):
                r = client.get(self._GEOCODE, params={
                    "service": "address", "request": "getCoord", "version": "2.0",
                    "crs": "EPSG:4326", "type": addr_type, "address": address,
                    "format": "json", "key": config.VWORLD_API_KEY})
                resp = r.json().get("response", {})
                if resp.get("status") == "OK":
                    pt = resp["result"]["point"]
                    return (float(pt["y"]), float(pt["x"]))  # (lat, lon)
        raise ValueError(f"V-World 지오코딩 결과 없음: {address}")

    def get_geo_hazard(self, lat: float, lon: float, address: str) -> GeoHazardContext:
        # 지형 주제도(산사태·지반·홍수)는 WMS/WFS 2차 연동 과제 — 현재 mock 레이어.
        # 좌표·주소는 실 지오코딩 결과를 반영하되 재해 레이어만 mock 표기.
        geo = MockGeoHazardProvider().get_geo_hazard(lat, lon, address)
        return geo


# ── 팩토리 (env 분기) ────────────────────────────────────────────────────────
def get_weather_provider() -> WeatherProvider:
    if config.WEATHER_PROVIDER == "kma":
        return KmaWeatherProvider()
    return MockWeatherProvider()


def get_geo_hazard_provider() -> GeoHazardProvider:
    if config.GEO_PROVIDER == "vworld":
        return VworldGeoHazardProvider()
    return MockGeoHazardProvider()


def is_mock_active() -> bool:
    """둘 중 하나라도 mock 이면 True(UI '데모 데이터' 배지용).
    vworld 지형 레이어가 아직 mock 이므로 vworld 라도 부분 mock 임에 유의."""
    return config.WEATHER_PROVIDER != "kma" or config.GEO_PROVIDER != "vworld"


# ── 파싱 유틸 ────────────────────────────────────────────────────────────────
def _to_float(v: Any) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _extract_cats(payload: dict) -> dict[str, str]:
    """초단기실황 응답 → {category: obsrValue}. resultCode 비정상 시 예외."""
    resp = payload.get("response", {})
    header = resp.get("header", {})
    if header.get("resultCode") not in ("00", None):
        raise ValueError(f"KMA resultCode={header.get('resultCode')} {header.get('resultMsg')}")
    items = resp.get("body", {}).get("items", {}).get("item", [])
    return {it["category"]: it["obsrValue"] for it in items}


def _extract_items(payload: dict) -> list[dict]:
    """getWthrWrnList 응답 → item 리스트(없으면 빈 리스트)."""
    resp = payload.get("response", {})
    body = resp.get("body", {})
    items = body.get("items", {})
    if isinstance(items, dict):
        item = items.get("item", [])
        return item if isinstance(item, list) else [item]
    return []
