# 호반 JHA Agent — 프론트엔드 (PoC)

**대화형(Chat)** 으로 작업 내용을 입력하면 "호반 안전 도우미"가 분류·위험요인·등급·대책과
현장 기상·지형 위험까지 메시지 스트림으로 평가하고, 검토·확정 후 ERP에 등록하는 JHA 지원 UI.

## 브랜드 & 대화형 UX

- **호반 브랜드(CI)** — 호반건설 공식 CI 적용. HOBAN Orange `#EE7500`(primary·CTA·어시스턴트 강조) +
  Gray `#89898A`/`#575553`, 따뜻한 뉴트럴 배경 `#FAF7F2`. 2블럭 심볼 로고(`HobanLogo`).
  안전 등급 색상(상 #DC2626/중 #F97316/하 #16A34A)은 법적 의미로 불변, 브랜드 오렌지와 톤 구분.
- **대화형 워크플로우** — 정적 폼 대신 채팅으로 전 과정 전개:
  인사 → 작업 입력(사용자 버블) → 분류 추천 카드 → 위험요인 매트릭스 → 동적 위험(기상·지형) →
  확정 게이트 → ERP 등록. 기존 리치 카드를 챗 버블에 임베드(컴포넌트 재사용).
  타이핑 인디케이터, 퀵리플라이(예시 작업), 자동 스크롤·"최신 메시지" 버튼, 상단 얇은 진행 표시.
  접근성: `role="log"` + `aria-live`, 발신자 sr-only, 44px 터치.

- **아티팩트(분할 뷰)** — 큰 화면(위험요인 매트릭스·5×5, 동적 위험)은 채팅에 다 넣지 않고
  **오른쪽 아티팩트 패널**로 분리(Claude 아티팩트 UX). 데스크톱은 좌(채팅 460px)+우(아티팩트) 분할,
  모바일은 풀스크린 시트. 채팅에는 "오른쪽에서 검토하기 →" 요약 카드(`ArtifactOpener`)를 띄움.
  **양방향 동기화**: 아티팩트에서 액션(등급 수정·기상 시나리오 토글·현장소장 승인) 시 단일 store가 갱신되고
  채팅도 함께 진행(사용자 echo + 어시스턴트 다음 단계). 어디서 눌러도 대화 타임라인이 전진.

- **스택**: Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Vitest + React Testing Library + Playwright
- **설계 원칙**: 인지 부하 최소화(한 화면 한 결정), AI 추천은 제안일 뿐(항상 수정/거절 가능),
  인용 1동작 검증, 친절한 한국어 에러, 현장 환경(햇빛·장갑·소음) 고려, WCAG 2.1 AA.

## 동적 위험성평가 (고도화 — 기상·지형 결합)

리서치 기반 P0 고도화: 정적 분류·위험요인 평가에 **현장 위치 + 실시간 기상 + 지형 재해**를
결합해 "동적 위험지도"를 생성한다("외부 위험 = 내부 위험"). 위험요인 검토 단계에 `DynamicRiskPanel`로 노출.

- **기상 작업중지 룰엔진**(`lib/weatherRules.ts`) — 산안규칙 §37/§140/§143/§383, KOSHA C-69/C-99,
  폭염 §559/§560 정량 임계값을 결정테이블로 구현. **실제 동작하는 순수 함수**(목업 아님).
  - 타워크레인 순간풍속 10/15m/s, 철골 강우 1mm/h, 이동식크레인 5/18/30m/s, 폭염 체감 31/33/35/38℃ 등.
- **WGS84 → 기상청 LCC 격자 변환**(`lib/weatherGrid.ts`) — 실제 수학 공식. 화면에 격자 좌표 표시.
- **지형 재해 플래그** — 산사태·홍수·지하매설물·연약지반·고압선(공종별 가중).
- **Human-in-the-loop** — 자동 작업중지 금지. STOP/EVAC 또는 폭염 휴식 의무 시 **현장소장 승인** 전까지
  ERP 등록 차단. 승인은 TBM 일지·감사 로그에 기록.
- **provider 추상화**(`lib/dynamicRiskProvider.ts`) — 외부 API/장비는 목업. 실 연동 시 provider impl만 교체
  (룰엔진·UI·타입 불변). UI에 "데모 데이터 · 실 장비/API 연동 예정" 배지.

### 구현 가능 vs 목업 대체 (PoC 환경 기준)
| 분류 | 항목 | PoC |
|------|------|-----|
| 실제 로직 | 작업중지 룰엔진, 날씨×공종 매핑, LCC 격자변환, 폭염 휴식 판정 | **즉시 구현(동작)** |
| 외부 데이터 | 기상청 단기예보·특보, 에어코리아, V-World 지오코딩 | 목업 provider(실 API 교체 가능) |
| 장비 의존 | CCTV 영상AI(YOLO), UWB/BLE 지오펜싱, 드론, IoT 센서 | 목업 + "추후 연동" 배지 |

### 동적 위험 데모 (위험요인 검토 단계에서 "기상 상황(데모)" 토글)
- **타워크레인**(기본 강풍) → 순간풍속 16.8m/s, 작업중지 2건(§37②), 현장소장 승인 게이트 → 등록 차단.
- **폭염 토글** → 체감 35.6℃, 폭염 휴식 의무(2시간당 20분, §560③), 14~17시 중지 권고.
- **태풍·낙뢰 토글** → 순간풍속 31.5m/s + 낙뢰 → 대피(EVAC) 경보.
- **굴착·흙막이**(기본 호우) → 여주 현장, 강우 4.5mm/h 작업중지 + 지형 재해 3건(침수·지하매설물·연약지반).
  기상 "평온"으로 토글하면 동적 위험 해소 → 정상 등록.

## 실행 방법

```bash
npm install

# 데모 모드 (백엔드 없이 mock 응답으로 전체 흐름 시연)
# PowerShell:
$env:NEXT_PUBLIC_USE_MOCK="true"; npm run dev
# bash:
NEXT_PUBLIC_USE_MOCK=true npm run dev

# 실제 백엔드 연동 (FastAPI가 http://localhost:8000 에 기동된 경우)
npm run dev
```

브라우저에서 `http://localhost:3000` 접속.

### 환경 변수
| 변수 | 기본값 | 설명 |
|------|--------|------|
| `NEXT_PUBLIC_USE_MOCK` | `false` | `true` 시 `lib/mock.ts` 응답 사용 (백엔드 미기동 데모) |
| `NEXT_PUBLIC_API_BASE` | `http://localhost:8000` | 백엔드 API 베이스 URL |

## 데모 시나리오 (NEXT_PUBLIC_USE_MOCK=true)

홈 화면 입력창에 아래 문구를 입력하면 키워드 매칭으로 시나리오가 분기됩니다.

| # | 입력 예시 | 시나리오 | 확인 포인트 |
|---|-----------|----------|-------------|
| 1 | `5층 옥상에서 타워크레인(T형) 해체 작업` | **경계셀** | 분류 카드 → 위험요인 검토에서 추락 위험요인에 `⚠ 상(잠정)` 경계셀 배지. 중점등록 `O (잠정)`. 확정 게이트가 등록을 차단 → 안전관리자 화면에서 확정 필요 |
| 2 | `지하 흙막이 굴착·터파기 작업` | **정상(ok)** | 붕괴(상)/전도(중) 위험요인. 경계셀 없음. 5×5 매트릭스에 현재 셀 강조. 바로 ERP 등록 진행 |
| 3 | `E/V PIT 밀폐공간 내부 점검` | **refused_partial** | 추락만 평가됨. 질식(밀폐공간) 데이터 갭 → `RefuseNotice(partial)`로 "수동 작성 필요" 안내 + 담당자 연락처 |
| 4 | `석면 해체 작업` / `화학물질 MSDS` | **refused_full** | 분류 단계에서 `RefuseNotice(full)` — 추측 평가 미제공, 전용 양식 안내 |

### 역할별 화면 (우측 상단 "역할 전환" 드롭다운)
- **작업자(worker)**: `/` 자연어 입력 → `/session/[id]` 분류·위험요인 검토·등록.
- **안전관리자(safety_manager)**: `/manager` 검토 대기 목록 → 경계셀 확정(상/중 택1 + 사유 5자 이상 필수) → 중점등록 O/X.
- **관리자(admin)**: 안전관리자 권한 포함.

> `/manager`는 권한 게이트가 걸려 있어 worker 역할로 접근하면 접근 거부 안내가 표시됩니다. 역할을 전환하세요.

### 경계셀 확정 데모 (시나리오 1 연계)
1. 역할을 **안전관리자**로 전환 → `/manager` 이동.
2. "타워크레인 해체" 항목의 `경계셀 확정 ▶` 클릭.
3. 등급 **상/중 택1** + **확정 사유**(5자 이상) 입력 → `확정하고 등록 진행`.
   (사유 미입력 시 버튼 비활성 = 감사 기록 강제)

## 화면·컴포넌트 구조

```
app/
  page.tsx                 worker 자연어 입력 (NaturalLanguageInput)
  session/[id]/page.tsx    분류검토 → 위험요인·등급검토 → 확정·ERP등록 (단계 게이트)
  manager/page.tsx         검토 대기 목록 + 경계셀 확정 다이얼로그
components/
  NaturalLanguageInput     입력창 + 음성 + 자동완성 + 최근입력 + 글자수 가이드
  ClassificationCard       분류 추천 + confidence 바 + 대안 드롭다운(1클릭 수정)
  HazardMatrix             재해형태 그룹 + 위험요인 카드(강도×빈도×등급, 대책, 인용)
  RiskMatrixVisualizer     KRAS 5×5 그리드(색상+glyph+곱셈값, 경계셀 점선, 현재셀 강조)
  BoundaryCellBadge        "상(잠정)"·"O(잠정)" ⚠아이콘+텍스트
  CitationPanel            인용 원문 (데스크톱 사이드패널 / 모바일 풀스크린 모달), 로드실패 시 ID 유지
  ReviewWorkflow           progress bar + 단계 게이트 / FinalizeGate(미확정 차단)
  ErpRegistrationStatus    대기/성공/실패/세션만료 + 재시도
  RefuseNotice             partial/full 거절 안내 + 다음 행동 + 연락처
```

## 접근성·현장 UX
- **터치 타겟** 최소 44px(`min-h-touch`), 주요 버튼 56px(장갑 착용).
- **색상만 의존 금지**: 모든 위험등급에 텍스트 라벨 + glyph(▲상/■중/●하) 병행.
- **고대비 모드**: 상단 토글(`data-contrast="high"`) — 햇빛 아래 가독성.
- **키보드**: 포커스 가시성(3px outline), 본문 바로가기 링크, ESC로 패널 닫기, Cmd/Ctrl+Enter 제출.
- **텍스트 확대**: viewport `maximumScale: 5` (줌 차단 안 함).
- **스크린리더**: role/aria-label, role=alert로 에러·거절 즉시 안내.

## 테스트

### 컴포넌트 단위 테스트 (Vitest + React Testing Library)
```bash
npm test        # tests/**/*.test.tsx, jsdom
```
대상: BoundaryCellBadge, RefuseNotice, ClassificationCard, HazardMatrix,
RiskMatrixVisualizer, ErpRegistrationStatus, ReviewWorkflow/FinalizeGate,
**weatherRules(룰엔진·LCC 격자변환 19 케이스)**.
색상-비의존(aria-label에 텍스트 병행), 대안 선택, 인용 콜백, 게이트 차단, 작업중지 임계값을 검증.

### e2e 테스트 (Playwright, mock 모드)
```bash
npm run e2e:install     # 최초 1회 — chromium 다운로드
npm run build:mock      # mock 모드로 프로덕션 빌드 (USE_MOCK는 빌드 타임 인라인)
npm run e2e             # desktop + mobile(Pixel 5) 2개 프로젝트
# 특정 프로젝트만:  npm run e2e -- --project=desktop
```
`playwright.config.ts`의 webServer가 `start:mock`(포트 3100)을 자동 기동합니다.
커버: 데모 4시나리오 전체 흐름(타워크레인 경계셀 게이트 차단 / 굴착 정상→ERP 등록 성공 /
밀폐공간 부분거절 / 석면 전체거절), 분류 대안 선택, 인용 패널 열기·ESC 닫기,
안전관리자 권한 게이트·경계셀 확정(사유 필수),
**동적 위험(작업중지 경보·현장소장 승인 게이트·폭염 휴식·태풍 EVAC·지형 재해 플래그)**.

> e2e는 mock 빌드를 사용하므로 `npm run build`(실연동용)와 산출물이 다릅니다. e2e 후
> 실연동 데모를 하려면 `npm run build`로 다시 빌드하세요.

## 빌드·테스트 결과 (검증 완료)
- `npm install` → 정상 (Node v24.12.0, npm 11.6.2).
- `npm run build:mock` / `npx next build` → ✓ 컴파일 성공, 타입체크 통과, 4개 라우트 생성.
- `npm test` (Vitest) → ✓ 10개 테스트 파일 / 60 테스트 전부 통과(룰엔진 19·챗·호반로고 포함).
- `npm run e2e` (Playwright) → ✓ desktop 12 + mobile 12 = 24 e2e 전부 통과(챗 UI 회귀 검증 포함).

> 참고: next@14.2.5 보안 권고가 있으나 PoC 범위에서는 동작에 영향 없음. 운영 전환 시 패치 버전 업그레이드 권장.

## 에러 UX 처리
- 네트워크/5xx → 재시도 버튼(`JhaApiError.retryable`).
- LLM 파싱 실패(`parse_error`) → raw_text graceful 표시(백엔드 협의 필드).
- 인용 로드 실패 → 원문 미표시여도 인용 ID(chunk_id)·행 번호는 항상 표시.
- 세션 만료(401) → 자동 저장 안내 + 재로그인.
- ERP 비동기 실패 → ErpRegistrationStatus 재시도/취소 + 큐 위치 표시.
