# 컴패니언(상시 동반) 패널 패턴 상세

> 개정 2026-06-11: 기존 "토글형 아티팩트(open/close)"를 **상시 stage-aware 동반 패널**로 전환.
> 근거: 사용자 피드백(라벨 장황·패널 점멸 어색·우측 dead space) → 설계 `_workspace/03_design/ux_companion_panel.md` 추천안 **B(작업 컨텍스트 캔버스) + C의 상시 경보 띠 1줄**.

채팅(좌) + 컴패니언 패널(우) 양방향 동기화. 패널은 **항상 존재**하고, 단계에 따라 **콘텐츠(stage)만 전환**한다(폭/위치 불변 → layout shift 없음).

## 1. 레이아웃 (반응형)

```
데스크톱 ≥1024px (패널 상시):
┌──────────────┬──────────────────────────┐
│  채팅(460px)  │  컴패니언 패널 (flex-1)    │
│  메시지 로그   │  ┌ 상시 경보 띠(1줄) ──┐  │ ← 항상
│  ...          │  ├ 헤더(stage·탭) ────┤  │
│  [컴포저]      │  │ stage 콘텐츠(fade)   │  │
│               │  └─────────────────────┘  │
└──────────────┴──────────────────────────┘
  ※ 폭 고정. 단계가 바뀌어도 패널은 사라지지 않고 콘텐츠만 페이드 전환.

모바일 <1024px (폴백): 채팅 단일 컬럼.
  - 입력창 위 "요약 칩"(스티키) = 현재 stage 한 줄 + 경보 단계(색상+텍스트).
  - 칩 탭 → 풀스크린 시트(role=dialog, ESC·dim)로 해당 stage 확장.
  - 경보는 칩에 항상 노출(시트 닫혀도 보임).
```

## 2. Stage 모델 (open 불리언 폐기)

```ts
type PanelView = "briefing" | "classify" | "hazards" | "dynamic" | "review" | "registered";

// phase → 패널 stage 자동 매핑(사용자 탭 override 가능, phase 변경 시 자동 복귀)
const VIEW_BY_PHASE: Record<Phase, PanelView> = {
  loading: "briefing", classify: "classify", assess: "hazards",
  dynamic: "dynamic", finalizing: "review", finalized: "registered",
  refused: "briefing", error: "briefing",
};
// panelView = overrideView ?? VIEW_BY_PHASE[phase]
```

| stage | 콘텐츠 | 데이터 출처 |
|---|---|---|
| `briefing` | 기상 위젯 + 작업중지 경보 + 오늘의 사고 사례(재해사례 133행) + 안전 팁 로테이션 + 공종 트리 | `dynamicRiskProvider`, `lib/briefingData.ts`(MJ020 추출), `weatherRules` |
| `classify` | 추천 분류 트리 위치 + 형제/유사 후보 | `cls.classification`, `briefingData.MAJOR_TAXONS` |
| `hazards` | `HazardMatrix` + `RiskMatrixVisualizer`(5×5) + 중대재해 배지 (기존 무수정) | `assessment` store |
| `dynamic` | `DynamicRiskPanel`(작업중지 룰·지형·승인) (기존 무수정) | `dynRisk` store |
| `review` | 확정 전 체크리스트 + 게이트 차단 사유 | `blockingReasons`, `assessment`, `dynRisk` |
| `registered` | `ErpRegistrationStatus` + 산출물 링크 + 다음 작업 | `erp`, `fin` |

> idle/finalize/registered처럼 "기존엔 빈 화면"이던 구간이 모두 유용한 콘텐츠로 채워진다(dead space 제거).

## 3. 상시 경보 띠 (SafetyStrip)

- 패널 **최상단 1줄 고정**. `panelAlertFor(scenario, trade)`(분류 전) 또는 `dynRisk.overall_level`(분류 후)로 산출.
- 평시 **INFO** = 차분한 정보 톤(`role="status"`, 🟢 "작업중지 경보 없음").
- **STOP/EVAC** = 경보 시맨틱 강조색(`alertToken`, `role="alert"`) + glyph + 룰 개수 배지. 색상만 의존 금지(라벨 텍스트 병행).
- 채팅 측(모바일 요약 칩)과 **동일 데이터** 동기화.

## 4. 양방향 동기화 흐름

| 트리거 | 동작 |
|---|---|
| assess 완료 | 채팅에 요약 + "위험요인 평가 [검토 →]" 요약 카드 push. 패널은 phase=assess→`hazards`로 자동 전환 |
| dynamic 완료 | 채팅 요약 + "동적 위험 [검토 →]" 카드. 패널 `dynamic` 자동 |
| 패널에서 등급 수정 | `assessment` 갱신 → 채팅 요약/게이트 즉시 반영 |
| 패널에서 시나리오 토글 | `dynRisk` + 경보 띠 갱신 → 채팅 echo |
| 패널에서 현장소장 조치 확인 | 채팅에 **조치 이행 echo**(작업중지 기록/대피 지시/휴식 조치) + "등록 가능" (패널 미닫힘 — 단계 전환은 phase로). "승인"이라는 단어로 작업 재개 허가처럼 읽히지 않게 한다 |
| 등록 완료 | "ERP 등록 결과 [결과 보기 →]" 카드 → 패널 `registered` 포커스 |
| 요약 카드 클릭 | `focusPanel(view)` — 패널 stage 포커스(모바일=시트 오픈). **패널을 "여는" 게 아니라 "포커스"** |

핵심: 액션 핸들러는 페이지 한 곳. 채팅 카드·패널 본문이 같은 store/핸들러 공유.

## 5. 라벨 규칙 (위치어 제거)

패널이 상시 존재 → "오른쪽에서"(위치)는 군더더기. *무엇을 하는지*만.

- 기본 CTA = **"검토 →"** (위험요인·동적위험 요약 카드).
- 등록 결과 카드 = **"결과 보기 →"**.
- (구) `"오른쪽에서 검토하기 →"` 하드코딩/기본값은 전면 교체.

## 6. 접근성

- 데스크톱 패널: `role="region" aria-label`. 경보 띠 `role=status|alert`. 탭 `role=tablist/tab + aria-selected`.
- 모바일 시트: `role="dialog"` ESC·dim·닫기. 요약 칩은 색상+텍스트 병행.
- 단계 전환은 채팅 흐름을 끊지 않음(메시지 유지). stage 콘텐츠는 `animate-fade-in`(transform 없는 opacity — 터치 stability 보존).
- 키보드: 요약 카드·탭·닫기·내부 액션 모두 포커스·≥44px.

## 7. 컴포넌트 / 셀렉터

- `CompanionPanel`(`data-testid="companion-panel"`, `data-view`) — 경보 띠 + 헤더(탭 `panel-tab-{view}`) + stage 슬롯 + 모바일 닫기(`panel-sheet-close`).
- `PanelAlertStrip`(`data-testid="panel-alert-strip"`, `data-level`).
- `PanelViews` — `BriefingView`/`ClassifyTreeView`/`ReviewSummaryView`/`RegisteredView`.
- `PanelSummaryChip`(`data-testid="panel-summary-chip"`) — 모바일 스티키 요약.
- `ArtifactOpener`(`data-testid="artifact-opener"`) — 채팅 측 요약 카드(이제 "포커스 전환"). 기본 CTA "검토".
- 회귀 주의: 구 `artifact-panel`·`artifact-close` 셀렉터 폐기 → `companion-panel`·`panel-sheet-close`. e2e는 "요약 카드 클릭으로 stage 포커스" 흐름으로 보정.

## 8. 구현 메모

- 페이지 루트 flex row: `<ChatColumn(고정폭)/> <CompanionPanel/>`. 패널 폭 불변 → layout shift 없음.
- stage 본문은 phase 데이터 기반 렌더(별도 fetch 없음 — store 공유). 데이터는 단계가 지나도 유지(리셋 없음).
- 모바일 전환은 CSS(`lg:` breakpoint) + 시트. 데스크톱 패널은 `hidden lg:flex`(시트 토글 무관 상시).
