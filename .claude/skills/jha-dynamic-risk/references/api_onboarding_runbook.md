# 동적 위험 외부 API 신청·연동 런북 (기상청 · V-World · 에어코리아)

> 목적: 동적 위험성평가 패널을 **목업 → 실데이터**로 전환하기 위한 API 신청·키 발급·백엔드 연동 실행 절차. `api_catalog.md`(카탈로그)의 실행판.
> 코드 정합: `backend/app/services/dynamic_risk/`(provider 추상화), `backend/app/routes/dynamic_risk.py`(proxy 엔드포인트), `frontend/lib/weatherGrid.ts`(격자변환).

---

## 0. 한눈에 — 무엇을 신청하나 (provider → 실 API 매핑)

| 코드 provider / 필드 | 신청 API | 포털 | 데이터셋 ID |
|---|---|---|---|
| `WeatherProvider.get_weather` → temp/wind/rain/pty/lightning | 기상청 **단기예보 조회서비스** (VilageFcstInfoService_2.0) | data.go.kr | 15084084 |
| `WeatherContext.warnings` | 기상청 **기상특보 조회서비스** (WthrWrnInfoService) | data.go.kr | 15000415 |
| `WeatherContext.pm10` (옵션) | 한국환경공단 **에어코리아 대기오염정보** | data.go.kr | 15073861 |
| `GeoHazardProvider.geocode` (주소→좌표) | **V-World Geocoder API 2.0** | vworld.kr | — |
| `GeoHazardContext` 지형 레이어 (옵션) | **V-World WMS/WFS 주제도** + 국가공간정보 | vworld.kr / LX | — |

**PoC 최소 3종**: 단기예보 · 기상특보 · V-World Geocoder. 에어코리아·지형 주제도는 2차.

---

## 1. 공공데이터포털 신청 (기상청 2종 + 에어코리아) — data.go.kr

- **계정당 serviceKey 1개 공통**. API마다 키가 따로 나오지 않고, 활용신청한 API 목록에 사용권한이 붙음.
- **자동승인**이나 **신청 후 1~2시간 뒤부터 호출 가능**(개발계정 즉시 발급, 트래픽 반영 지연).

절차:
1. `data.go.kr` 회원가입(개인/기업, 공동인증서 불필요).
2. 검색 → **"기상청 단기예보 조회서비스"** → 상세 → **[활용신청]**.
3. 활용목적(예: 웹사이트 개발) 선택, 라이선스 동의 → 제출 → **개발계정 자동승인**(1만 건/일).
4. 마이페이지 → **데이터활용 > 오픈API > 인증키 발급** → **일반 인증키(Encoding/Decoding)** 확인.
   - 백엔드에는 **Decoding 키** 사용(httpx 가 쿼리 인코딩 수행). URL 직접 조립 시 Encoding 키.
5. 동일하게 **"기상청 기상특보 조회서비스"**, **"한국환경공단 에어코리아 대기오염정보"** 추가 활용신청.

운영 전환: 개발계정(1만/일) → **운영계정**(활용사례 등록 후 신청, 일 10만+).

---

## 2. V-World 신청 (지오코딩 + 주제도) — vworld.kr

- 공공데이터포털과 **별도 포털·별도 키**. **키가 도메인(Referer)에 묶임**.
- **일 4만 건** 제한. **지오코딩 결과 영구 저장 금지**(약관) → 캐시는 짧은 TTL.

절차:
1. `vworld.kr` 회원가입.
2. 상단 **오픈API > 인증키 발급**.
3. 신청서 작성 — **사이트 URL(도메인) 등록 필수**. 등록 도메인에서 온 요청만 허용.
   - PoC 개발: 백엔드 서버 도메인(또는 `http://localhost:8000`). **프론트 도메인 아님**(백엔드 proxy 호출).
4. 가입 이메일의 **인증 메일 → [인증키 사용] 클릭**해야 **활성화**(미클릭 시 401 빈발).
5. **인증키 관리**에서 상태 **사용중** 확인.

---

## 3. ⚠️ 아키텍처 원칙 — 반드시 백엔드 proxy

| 이유 | 결과 |
|---|---|
| serviceKey/인증키가 `NEXT_PUBLIC_*` 이면 브라우저 번들에 노출 | **키 유출** |
| V-World 키는 도메인 Referer 고정 | 서버 호출이 안정적 |
| data.go.kr·에어코리아 **CORS 미지원** | 브라우저 직접 호출 차단 |

→ 실 API는 **`POST /v1/jha/dynamic-risk`**(backend proxy)로만. frontend 는 이 엔드포인트만 호출.
키는 `backend/.env` 에만 둔다.

```bash
# backend/.env (실 연동 시)
JHA_WEATHER_PROVIDER=kma         # mock|kma
JHA_GEO_PROVIDER=vworld          # mock|vworld
DATA_GO_KR_SERVICE_KEY=<공공데이터포털 Decoding 키>
VWORLD_API_KEY=<V-World 인증키>
JHA_WEATHER_CACHE_TTL=600        # 실황 10분 갱신 → 캐시 권장
```
키 부재 시 provider 는 **mock 폴백**(+경고 로그) — 데모 안전.

---

## 4. 엔드포인트·파라미터 (검증됨)

```
# 1) 기상청 초단기실황 (현재값) — getUltraSrtNcst
GET http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst
    ?serviceKey={KEY}&dataType=JSON&base_date=YYYYMMDD&base_time=HHMM
    &nx={격자X}&ny={격자Y}&numOfRows=60&pageNo=1
    # nx,ny ← lat_lon_to_grid(lat,lon) (grid.py). base_time 은 매시 40분 이후 정시.
    # category: T1H(기온) RN1(1h강수) REH(습도) WSD(풍속) PTY(강수형태) LGT(낙뢰)

# 2) 기상청 기상특보 — getWthrWrnList
GET http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList
    ?serviceKey={KEY}&dataType=JSON&stnId={지점}&numOfRows=10
    # 12종 특보(호우·강풍·폭염·대설…) 주의보/경보 → WeatherWarning 정규화

# 3) 에어코리아 PM10 (옵션) — getMsrstnAcctoRltmMesureDnsty
GET http://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty
    ?serviceKey={KEY}&returnType=json&stationName={측정소}&dataTerm=DAILY&ver=1.3

# 4) V-World 지오코딩 (주소 → 좌표) — getCoord
GET https://api.vworld.kr/req/address
    ?service=address&request=getCoord&version=2.0&crs=EPSG:4326
    &type=ROAD&address={현장주소}&format=json&key={VWORLD_KEY}
    # 응답 result.point.x = 경도(lon), result.point.y = 위도(lat)
    # → lat_lon_to_grid(y, x) 로 기상청 격자
```

**데이터 흐름**: 주소 → (V-World) lat/lon → `lat_lon_to_grid()` → nx/ny → (기상청) 실황·특보 → `DynamicRiskContext` → 룰엔진(`weatherRules.ts`).

---

## 5. 지형 레이어 (2차, 선택) — V-World 주제도 + 국가공간정보

- 산사태 위험등급: 산림청 산사태정보시스템 / V-World 주제도 WMS `GetFeatureInfo`.
- 연약지반·지반: 국토지반정보 통합DB(국가공간정보포털 WFS).
- 홍수: 홍수위험지도(환경부) 주제도.
- 구현 난도 높음 → PoC 는 mock 유지, `source_note` 로 데이터원 표기. 운영 단계 별도 과제.

---

## 6. 연동 구현 상태 (`backend/app/services/dynamic_risk/providers.py`)

**구현 완료(2026-06-14, 실 키로 라이브 검증):**
- [x] httpx 동기 클라이언트(타임아웃 `config.EXTERNAL_API_TIMEOUT_S`) — KMA 실황+특보, V-World 지오코딩.
- [x] base_date/base_time 발표시각 보정(`_ncst_base`, 분<40 직전 정시).
- [x] category 매핑 T1H→temp·REH→humidity·WSD→wind·RN1→rain·PTY→pty(`_PTY_MAP`).
- [x] 특보 12종 정규화 + 발효/해제 누적 파서(`_parse_warnings`·`_WARN_DEFS`), lat/lon→stnId 최근접(`_nearest_stn`).
- [x] 인메모리 TTL 캐시(`WEATHER_CACHE_TTL_S`), 격자 키 단위.
- [x] graceful 폴백: API 실패·키부재·resultCode≠00 시 mock + 경고 로그.
- [x] `.env` 무의존 로더(`config._load_dotenv`, override=False), `.env.example` 문서화.

**잔여 과제(정직 표기 — 현재 근사/mock):**
- [ ] gust(순간풍속)=평균×1.5 근사 → 초단기예보(getUltraSrtFcst) 정밀화.
- [ ] lightning=False 고정 → getUltraSrtFcst LGT 연동.
- [ ] apparent_temp=NWS heat index 근사 → 기상청 생활기상지수 API.
- [ ] snow=PTY 기반 근사(실황 적설 카테고리 부재).
- [ ] 지형 레이어(산사태·지반·홍수)=mock → V-World WMS/WFS + 국가공간정보(§5).
- [ ] 운영: Redis 캐시·다현장 중복제거·특보 5~10분 폴링·공공누리 출처표시·체감온도 보관·V-World 운영 도메인 등록.

---

## 7. 검증

**라이브(실 키, `.env` 설정 후):**
```bash
cd _workspace/04_build/backend   # .env 에 DATA_GO_KR_SERVICE_KEY·VWORLD_API_KEY + provider=kma/vworld
python -X utf8 -c "from app.services.dynamic_risk import get_weather_provider,get_geo_hazard_provider; \
g=get_geo_hazard_provider(); lat,lon=g.geocode('서울특별시 중구 세종대로 110'); \
w=get_weather_provider().get_weather(lat,lon); print(w.source, w.temp_c, w.humidity_pct, [x.label for x in w.warnings])"
# → kma 22.9 62.0 [...]  (실측값, source=kma)
```

**테스트(mock 모드 — 무네트워크·결정적):** `pytest tests/test_dynamic_risk.py` (격자·mock provider·특보 파서·엔드포인트 9건). conftest 가 provider=mock 강제하여 실 API 미호출.
