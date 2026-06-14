"""동적 위험 라우트 — POST /v1/jha/dynamic-risk.

현장 위치(주소 또는 좌표) + 공종 → 외부 공공 API provider(기상청·V-World)에서
기상·지형 컨텍스트를 조회해 반환. 작업중지 룰 평가는 frontend weatherRules.ts
(또는 후속 백엔드 룰엔진)가 이 컨텍스트를 입력으로 수행한다.

⚠️ 외부 API 키는 백엔드 전용(이 라우트가 proxy). frontend 직접 호출 금지.
mock 모드(기본)에서는 키 없이 결정적 컨텍스트를 반환(데모·테스트 안전).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from app.middleware.auth import Principal, get_principal
from app.services.dynamic_risk import (
    DynamicRiskContext,
    DynamicRiskRequest,
    get_geo_hazard_provider,
    get_weather_provider,
    is_mock_active,
)

logger = logging.getLogger("jha.dynamic_risk")

router = APIRouter(prefix="/v1/jha", tags=["dynamic-risk"])


@router.post("/dynamic-risk", response_model=DynamicRiskContext)
def get_dynamic_risk(req: DynamicRiskRequest,
                     principal: Principal = Depends(get_principal)) -> DynamicRiskContext:
    """현장 기상·지형 컨텍스트 조회(provider 추상화).

    1) 좌표 미지정 시 주소 → 지오코딩(GeoHazardProvider.geocode).
    2) 기상(WeatherProvider.get_weather) + 지형(get_geo_hazard) 병합.
    3) DynamicRiskContext 반환(룰 평가는 호출측 룰엔진이 수행).
    """
    geo_provider = get_geo_hazard_provider()
    weather_provider = get_weather_provider()

    lat, lon = req.lat, req.lon
    if lat is None or lon is None:
        if not req.address:
            from app.errors import ValidationFailed
            raise ValidationFailed(
                details={"reason": "address 또는 (lat,lon) 중 하나는 필수입니다."})
        lat, lon = geo_provider.geocode(req.address)

    weather = weather_provider.get_weather(lat, lon, scenario=req.scenario)
    geo = geo_provider.get_geo_hazard(lat, lon, req.address or "")

    return DynamicRiskContext(weather=weather, geo=geo, is_mock=is_mock_active())
