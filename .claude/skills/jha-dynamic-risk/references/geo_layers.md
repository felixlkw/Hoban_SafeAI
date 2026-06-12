# 지형 재해 레이어 + 격자 변환

## 1. 지리정보 레이어별 위험 매핑

| 레이어 | 데이터원(실 API) | 대상공종 | 위험요인 | PoC 처리 |
|---|---|---|---|---|
| 시추공/지반정보 | 국토지반정보 | 굴착·흙막이·기초 | 연약지반·지하수위·붕괴 | mock |
| 지하매설물 | 지하공간통합지도/JIS | 굴착·천공 | 가스·전력·상수관 손상 | mock |
| 산사태위험지도 | 산림청 산사태정보시스템 | 절토·사면·산악 | 토사붕괴 | mock(1~5등급) |
| 홍수위험지도/침수흔적도 | 환경부 floodmap | 수변·지하·저지대 | 침수·수몰 | mock |
| 급경사지 | 행안부 안전지도 | 사면 인접 | 낙석·붕괴 | mock |
| 지진정보 | 기상청 | 양중기·구조물 | 지진 후 점검 | mock |
| 문화재보호구역 | V-World | 전 공종 | 발파/진동 제약 | mock |
| 고압선/철도 인접 | V-World 주제도 | 양중·고소 | 감전·접촉 | mock |
| 용도지역/도시계획 | V-World | 전 공종 | 인허가·작업시간 | mock |

## 2. WGS84 ↔ 기상청 LCC 격자 변환 (실제 공식)

기상청 동네예보 격자 파라미터:
- Re = 6371.00877 (지구 반경 km)
- grid = 5.0 (격자 간격 km)
- slat1 = 30.0, slat2 = 60.0 (표준위도)
- olon = 126.0, olat = 38.0 (기준점 경도/위도)
- xo = 43, yo = 136 (기준점 격자좌표 x, y)

위경도(lat,lon) → 격자(nx,ny) 변환:
```
DEGRAD = π/180
re = Re/grid
slat1·=slat1·DEGRAD; slat2=slat2·DEGRAD; olon=olon·DEGRAD; olat=olat·DEGRAD
sn = ln(cos(slat1)/cos(slat2)) / ln(tan(π/4+slat2/2)/tan(π/4+slat1/2))
sf = (tan(π/4+slat1/2)^sn · cos(slat1)) / sn
ro = re·sf / tan(π/4+olat/2)^sn
ra = re·sf / tan(π/4+lat·DEGRAD/2)^sn
theta = lon·DEGRAD - olon; (theta 정규화: -π..π)
theta = theta·sn
nx = floor(ra·sin(theta) + xo + 0.5)
ny = floor(ro - ra·cos(theta) + yo + 0.5)
```

비관측영역은 -99. 격자 해상도 5km → 국지 미기상(계곡풍·빌딩풍) 미반영 → 고위험 양중작업은 현장 풍속계 실측 병행(2단계 IoT 연동).

## 3. 특보 단위 불일치 주의

특보는 시·군/해역 단위, 현장은 점 단위 → 시군 매핑 시 과대/과소 경보 가능. 영향예보(폭염·한파 4단계) 보조 활용.
