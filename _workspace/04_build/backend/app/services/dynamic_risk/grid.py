"""WGS84(위경도) ↔ 기상청 동네예보 LCC 격자 변환.

frontend lib/weatherGrid.ts 의 latLonToGrid 와 동일 파라미터·동일 결과(검증됨).
기상청 단기예보(VilageFcstInfoService_2.0) nx/ny 파라미터 산출에 사용.
"""
from __future__ import annotations

import math

# 기상청 동네예보 격자 파라미터(Lambert Conformal Conic)
_RE = 6371.00877   # 지구 반경(km)
_GRID = 5.0        # 격자 간격(km)
_SLAT1 = 30.0      # 표준위도 1
_SLAT2 = 60.0      # 표준위도 2
_OLON = 126.0      # 기준점 경도
_OLAT = 38.0       # 기준점 위도
_XO = 43           # 기준점 X격자
_YO = 136          # 기준점 Y격자

_DEGRAD = math.pi / 180.0


def lat_lon_to_grid(lat: float, lon: float) -> tuple[int, int]:
    """위경도 → 기상청 격자 (nx, ny). 비관측영역은 (-99, -99)."""
    re = _RE / _GRID
    slat1 = _SLAT1 * _DEGRAD
    slat2 = _SLAT2 * _DEGRAD
    olon = _OLON * _DEGRAD
    olat = _OLAT * _DEGRAD

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = (sf ** sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / (ro ** sn)

    ra = math.tan(math.pi * 0.25 + lat * _DEGRAD * 0.5)
    ra = re * sf / (ra ** sn)
    theta = lon * _DEGRAD - olon
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= sn

    nx = int(math.floor(ra * math.sin(theta) + _XO + 0.5))
    ny = int(math.floor(ro - ra * math.cos(theta) + _YO + 0.5))
    return nx, ny
