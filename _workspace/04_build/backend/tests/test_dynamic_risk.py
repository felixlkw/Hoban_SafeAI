"""동적 위험 — 격자변환·mock provider·특보 파서·엔드포인트(mock 모드) 테스트.

실 공공 API(KMA/V-World)는 호출하지 않는다 — conftest 가 JHA_WEATHER_PROVIDER=
JHA_GEO_PROVIDER=mock 을 강제(.env 의 kma/vworld 무시). 실 호출 정규화는 라이브
스모크로 별도 검증(테스트는 결정성·무네트워크 유지)."""
from __future__ import annotations

from app.services.dynamic_risk.grid import lat_lon_to_grid
from app.services.dynamic_risk.providers import (
    MockWeatherProvider,
    _apparent_temp,
    _nearest_stn,
    _parse_warnings,
)


def test_grid_matches_frontend_seoul():
    # frontend weatherGrid.ts 와 동일 결과(서울시청 → 60,127)
    assert lat_lon_to_grid(37.5665, 126.9780) == (60, 127)


def test_mock_weather_scenario_storm():
    ctx = MockWeatherProvider().get_weather(37.5665, 126.9780, scenario="storm")
    assert ctx.source == "mock"
    assert ctx.gust_ms == 22.0
    labels = {w.label for w in ctx.warnings}
    assert "호우경보" in labels and "강풍경보" in labels


def test_parse_warnings_issue_and_lift():
    # 호우 발표 → 강풍 발효 → 강풍 해제 + 호우 발효 ⇒ 호우만 활성
    items = [
        {"tmSeq": 51, "title": "[특보] / 호우주의보 발표 (*)"},
        {"tmSeq": 52, "title": "[특보] / 강풍주의보 발효 (*)"},
        {"tmSeq": 53, "title": "[특보] / 강풍주의보해제,호우주의보 발효 (*)"},
    ]
    out = _parse_warnings(items, "서울")
    assert [w.label for w in out] == ["호우주의보"]
    assert out[0].code == "HEAVY_RAIN_ADVISORY"


def test_parse_warnings_upgrade_to_warning():
    items = [
        {"tmSeq": 10, "title": "/ 폭염주의보 발효 (*)"},
        {"tmSeq": 11, "title": "/ 폭염주의보해제,폭염경보 발효 (*)"},
    ]
    out = _parse_warnings(items, "대구")
    assert [(w.label, w.level) for w in out] == [("폭염경보", "경보")]


def test_parse_warnings_all_lifted():
    assert _parse_warnings([{"tmSeq": 1, "title": "/ 호우주의보해제 (*)"}], "서울") == []


def test_apparent_temp_summer_bump_and_winter_passthrough():
    assert _apparent_temp(15.0, 50.0) == 15.0          # <25℃ → 기온 동일
    assert _apparent_temp(33.0, 70.0) > 33.0           # 여름 heat index 가중


def test_nearest_stn_seoul_and_busan():
    assert _nearest_stn(37.57, 126.98) == 108          # 서울
    assert _nearest_stn(35.10, 129.03) == 159          # 부산


def test_dynamic_risk_endpoint_mock(client):
    r = client.post("/v1/jha/dynamic-risk",
                    json={"trade": "철골공사", "address": "서울시 중구", "scenario": "storm"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_mock"] is True
    assert body["weather"]["source"] == "mock"
    assert body["geo"]["source"] == "mock"
    assert body["weather"]["gust_ms"] == 22.0


def test_dynamic_risk_endpoint_requires_location(client):
    r = client.post("/v1/jha/dynamic-risk", json={"trade": "철골공사"})
    assert r.status_code == 422  # address/좌표 모두 부재 → ValidationFailed
