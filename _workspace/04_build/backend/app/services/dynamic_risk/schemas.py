"""동적 위험 Pydantic 스키마 — frontend lib/types.ts 와 1:1 정합.

WeatherContext/WeatherWarning/GeoHazardContext 필드명·타입을 frontend 계약에
정확히 맞춘다(camel/snake 불일치 없이 snake_case 통일). provider 출력 스키마가
계약이므로 mock↔실API 교체 시에도 이 형태는 불변이다.
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


PtyType = Literal["없음", "비", "비/눈", "눈", "소나기"]
WarnLevel = Literal["주의보", "경보", "예비특보"]
FloodRisk = Literal["없음", "관심", "주의", "위험"]


class WeatherWarning(BaseModel):
    """기상특보 1건 (기상청 WthrWrnInfoService 정규화)."""
    code: str          # HEAVY_RAIN_ADVISORY 등
    label: str         # "호우주의보"
    level: WarnLevel
    region: str


class WeatherContext(BaseModel):
    """현장 기상 컨텍스트 (기상청 단기예보 + 특보 + 에어코리아 정규화)."""
    observed_at: str   # ISO 타임스탬프
    grid_nx: int
    grid_ny: int
    region_name: str
    temp_c: float
    apparent_temp_c: float  # 체감온도 (폭염 판정 기준)
    humidity_pct: float
    wind_ms: float          # 평균 풍속
    gust_ms: float          # 순간 풍속
    rain_mm_1h: float
    snow_cm_1h: float
    pty: PtyType            # 강수형태
    lightning: bool
    pm10: Optional[float] = None
    warnings: list[WeatherWarning] = Field(default_factory=list)
    source: Literal["mock", "kma"] = "mock"


class GeoHazardContext(BaseModel):
    """지형 재해 컨텍스트 (V-World 지오코딩 + 주제도 정규화)."""
    lat: float
    lon: float
    address: str
    landslide_grade: int = 0  # 0~5 (0=해당없음, 5=최고위험)
    flood_risk: FloodRisk = "없음"
    underground_utilities: list[str] = Field(default_factory=list)
    soft_ground: bool = False
    slope_deg: float = 0.0
    near_high_voltage: bool = False
    source: Literal["mock", "vworld"] = "mock"


class DynamicRiskRequest(BaseModel):
    """동적 위험 조회 요청. 주소 또는 좌표 중 하나는 필수(좌표 우선)."""
    trade: str = Field(..., description="평가 대상 공종 키(분류에서 매핑)")
    address: Optional[str] = Field(None, description="현장 주소(좌표 미지정 시 지오코딩)")
    lat: Optional[float] = None
    lon: Optional[float] = None
    scenario: Optional[str] = Field(
        None, description="mock provider 시나리오(calm|windy|rainy|heatwave|storm). 실 provider 무시.")


class DynamicRiskContext(BaseModel):
    """provider 가 반환하는 원시 컨텍스트(룰엔진 입력). 룰 평가는 별도 단계."""
    weather: WeatherContext
    geo: GeoHazardContext
    is_mock: bool
