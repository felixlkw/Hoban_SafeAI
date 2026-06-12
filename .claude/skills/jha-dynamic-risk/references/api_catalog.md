# 무료 공공 API 카탈로그 + 목업↔실API 교체 가이드

## 1. API 카탈로그 (전부 무료, 공공데이터포털 자동승인)

| API | 기관 | 데이터 | 호출제한 | 인증 | PoC |
|---|---|---|---|---|---|
| 단기예보 조회서비스 (VilageFcstInfoService_2.0) | 기상청 | 기온·강수·습도·풍속·강수형태·낙뢰 (실황/초단기/단기) | 개발 1만/일 | serviceKey | mock |
| 기상특보 조회서비스 (WthrWrnInfoService) | 기상청 | 12종 특보(주의보/경보) | 개발 1만/일 | serviceKey | mock |
| 태풍정보 (TyphoonInfoService) | 기상청 | 중심위치·경로·강도 | 개발 1만/일 | serviceKey | mock |
| 중기예보 | 기상청 | 11일 기온·강수확률 | 개발 1만/일 | serviceKey | mock |
| 생활기상지수 | 기상청 | 자외선·체감온도 | 개발 1만/일 | serviceKey | mock |
| 대기오염정보 | 에어코리아 | PM10/2.5·O3·NO2·CO·SO2 | 개발 500/일 | serviceKey | mock |
| V-World Geocoder | 국토부 | 주소↔좌표 | 일 3만건 | 도메인등록키 | mock |
| V-World WMS/WFS | 국토부 | 지적·건물·주제도 | - | 인증키 | mock |
| 국가공간정보포털 | LX | 지반·산사태·홍수 GeoJSON | - | 인증키 | mock |
| Open-Meteo | Open-Meteo | 글로벌 예보(KMA 포함) | 무제한(비상업) | 불필요 | 해외확장 |

## 2. provider 추상화 — 목업↔실API 교체

프론트/백엔드 모두 동일 인터페이스. 환경변수로 구현 스위치.

```ts
interface WeatherProvider {
  getForecast(grid: {nx:number, ny:number}): Promise<WeatherContext>;
  getWarnings(regionCode: string): Promise<WeatherWarning[]>;
}
// MockWeatherProvider: 결정론적 시나리오 데이터 (NEXT_PUBLIC_USE_MOCK=true)
// KmaWeatherProvider: data.go.kr 실 호출 (serviceKey, 폴링+캐시)
```

교체 시 변경 지점:
1. provider impl 1개 추가 (실 API 호출 + 응답 정규화).
2. factory에서 env 기반 분기.
3. **룰엔진·UI·타입은 그대로** (provider 출력 스키마가 계약).

## 3. 운영 전환 체크리스트

- 개발계정 → 운영계정(활용사례 등록, 일 10만) 승인.
- Redis 캐시(TTL=갱신주기), 격자 중복제거(다현장).
- 기상특보 5~10분 폴링 → 의사 이벤트(웹훅 미제공).
- V-World 인증키 도메인 등록, 외부망 전용.
- 공공누리 출처표시. Open-Meteo 상업 사용 시 별도 플랜.
- 폭염 체감온도 기록·보관(연말까지) 기능 필수.

## 4. 장비 의존 — 전부 목업, 추후 교체

| 기능 | 실 기술 | 목업 방식 |
|---|---|---|
| CCTV 영상AI | YOLO/DeepStream | mock 이벤트 스트림 (PPE/추락/협착/연기) |
| 위치 지오펜싱 | UWB/BLE RTLS | mock proximity 이벤트 |
| 드론 캡처 | DJI SDK/DroneDeploy | mock 작업면 갱신 |
| IoT 센서 | MQTT/OPC UA | mock 현장 풍속계·체감온도 |
| 생체신호 | 웨어러블 | 1단계 제외(프라이버시) |

UI에는 "데모 데이터 · 실 장비 연동 예정" 배지로 명시.
