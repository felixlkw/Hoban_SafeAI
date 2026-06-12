---
name: jha-chat-ux
description: 호반 JHA Agent의 대화형(Chat) 워크플로우 UI/UX + 호반건설 브랜드 시스템 적용 워크플로우. 정적 단계별 폼이 아닌 채팅 인터페이스에서 위험성평가 전 과정(자연어 입력→분류 추천→위험요인·등급→동적 위험→검토·확정→ERP 등록)이 메시지 스트림으로 전개되는 패턴을 정의한다. 호반 CI(오렌지 #EE7500·그레이 블럭 심볼·로고타입), 브랜드 컬러 토큰, 어시스턴트/사용자 메시지 버블, 리치 카드(분류·위험·기상) 임베드, 타이핑 인디케이터, 퀵 리플라이/액션칩, 단계 진행 표시, 스크롤·앵커, 접근성(role=log·aria-live)을 다룬다. frontend-engineer가 챗 기반 UI로 전환하거나 호반 브랜드를 반영할 때 사용한다.
---

# JHA Chat UX — 대화형 워크플로우 + 호반 브랜드

## 언제 사용하는가

- 단계별 폼/페이지 UX를 채팅(대화) 흐름으로 전환할 때
- 호반건설 CI·로고·브랜드 컬러를 UI에 반영할 때
- AI 추천(분류·위험·기상)을 채팅 메시지/리치 카드로 표시할 때
- 어시스턴트 응답 스트리밍·타이핑·퀵리플라이 패턴 설계 시

## 1. 호반 브랜드 시스템 (CI 기반)

출처: **루트 "HOBAN 브랜드 컬러  색상 가이드.txt"**(공식 3색) + White 추가 = 4색 조합. 상세는 `references/hoban_brand.md`.
심볼 = 2개 블럭(상단 오렌지=밝은 미래, 하단 그레이=노하우/헤리티지) — 공식 SVG 좌표 불변.

| 공식색(★) | HEX | 파생 토큰 | 용도 |
|---|---|---|---|
| HOBAN Orange | #EE7500 | `brand-500`(★)/`600` | primary·CTA·포커스·활성 (소형텍스트는 600) |
| HOBAN Gray | #89898A | `steel-500`(★)/`700` | 보조텍스트·비활성·구분선·아이콘 |
| HOBAN Dark Gray | #575553 | `ink-700`(★)/`800`/`900` | 본문(800)·헤딩(900) |
| White | #FFFFFF | `surface`/`page`/`tint`/`line` | 배경·카드·서피스(위계는 옅은 Gray 틴트) |

- White 중심 서피스(기존 warm #FAF7F2 폐기). Orange on White ≈3.5:1 → 본문 금지, CTA배경+White텍스트·아이콘·대형텍스트만.
- **로고**: 2블럭 심볼(상 오렌지/하 그레이) + "호반" 워드마크. SVG 컴포넌트로 구현(`HobanLogo`).
- **안전 등급 색상은 유지**(KRAS: 상 #DC2626 / 중 #F97316 / 하 #16A34A) — 법적 의미. 브랜드 오렌지(#EE7500)와 위험 주황(#F97316)을 톤으로 구분(브랜드는 더 진하고 채도 높음).
- 색상만 의존 금지 원칙 유지(텍스트 라벨 병행).

## 2. 대화형 워크플로우 패턴

채팅 = 위험성평가 진행의 단일 타임라인. 각 단계가 메시지로 누적.

```
[어시스턴트] 인사 + 작업 입력 유도
[사용자]     "타워크레인 해체"            (말풍선, 우측)
[어시스턴트] ⌛ 타이핑… → 분류 추천 카드   (리치 카드 임베드)
[사용자 액션] 카드에서 확정/수정          (인라인, 결과는 사용자 버블로 echo)
[어시스턴트] 위험요인 매트릭스 카드
[어시스턴트] 동적 위험(기상·지형) 카드 + 작업중지 경보
[어시스턴트] 확정 게이트 → [확정·등록] 액션
[어시스턴트] ERP 등록 상태 카드 → 완료
```

### 핵심 규칙
1. **한 번에 한 질문/한 결정** — 인지 부하 최소화는 챗에서도 유지. 어시스턴트가 다음 행동을 명확히 제시.
2. **AI 출력 = 어시스턴트 메시지** — 좌측, 호반 로고 아바타. 사용자 = 우측 말풍선.
3. **리치 카드 임베드** — 기존 컴포넌트(ClassificationCard, HazardMatrix, DynamicRiskPanel, ErpRegistrationStatus)를 버블 안에 렌더. 새로 만들지 말고 재사용.
4. **퀵 리플라이/액션칩** — 자주 쓰는 응답(예시 작업, "이대로 진행", "수정") 칩으로 제공.
5. **타이핑 인디케이터** — AI 처리 중 점 3개 애니메이션 + "분석하고 있습니다".
6. **자동 스크롤** — 새 메시지 시 하단 앵커로 스크롤(사용자가 위로 올렸으면 "새 메시지" 버튼).
7. **단계 헤더/진행** — 채팅 상단에 얇은 진행 표시(분류→위험→동적→확정). 챗을 대체하지 않고 보조.

### 2.1 안전 문구 원칙 — "승인" 단어 사용 규칙 (개정 2026-06-12)

작업중지·대피·폭염 휴식 같은 안전 게이트에서 **"승인"이라는 단어를 작업 재개 허가로
오독하지 않도록** 한다. 현장에서 "승인 = 작업 계속해도 된다"로 읽히면 중대 안전사고로 이어진다.

- **경보 수준별 "실제 행위" 문구로 분리**(버튼·완료 배지·채팅 동기화 모두 정합):
  - STOP → "작업중지 조치 기록"
  - EVAC → "대피 지시 완료"
  - WARN(폭염 등) → "휴식/보호 조치 완료"
  - 공통 확인 행위 → "현장소장 확인 완료"
- 게이트·완료 문구에 **"작업 재개 허가가 아니라 조치 이행 기록"**임을 명시.
- 단일 출처 헬퍼 `stoppageActionCopy(level, { heatRest })`(lib/tokens.ts)로 패널·채팅이
  같은 문구를 공유. 채팅 echo도 1인칭 조치 이행 문장(예: "작업중지 조치를 시행했음을 확인합니다").
- 관리(검토 sign-off) 맥락의 "안전관리자 승인 요청"은 작업 재개 허가가 아니므로 허용.
  단, 현장 작업 제어를 암시하는 위치의 "승인"은 "확인/조치"로 교체.

### 2.2 컴포저 상태 규칙 — 카드 대기 중 입력창 (개정 2026-06-12)

카드 액션 대기 중 하단 입력창을 **흐리게 남기지 않는다**(혼란 유발). 대신:

- 카드 대기 상태(`disabled` + `stepName`) → 입력창을 **고정 액션 바**로 교체:
  "현재 단계: 위 카드에서 {단계명} 확인 필요" + **"카드로 이동 ↑"**(마지막 액션 카드로 smooth scroll).
- 입력 가능 상태(홈·자유 입력) → 기존 컴포저 그대로. 전환은 `animate-fade-in`.
- 단계명이 없는 종료성 비활성(refused/finalized)은 액션 바 대신 간단 힌트 표시.
- 보조 단서 칩 등 외부 삽입은 `valuePatch={{text,nonce}}` 단방향 패치 + `onValueChange`로
  동기화(제어형 진입점 없이). 칩은 입력창 위가 아니라 **메시지 스트림 안**에 두어 sticky 입력과
  겹치지 않게 한다(모바일 pointer 인터셉트 회피).

### 2.3 자유 입력(질문·정정) + 되돌리기/거절 규칙 (개정 2026-06-12)

카드 흐름이 기본이지만, 사용자는 **언제든 자연어로 질문·정정**할 수 있어야 한다(대화형의 본질).

- **자유 입력 토글**: 카드 대기(액션 바) 상태에서 액션 바에 **"질문·정정" 토글**(`onOpenInput`)을
  둔다. 누르면 컴포저가 활성(`freeInput`)되어 고정 액션 바와 공존. 입력 후 카드 흐름으로 자동 복귀
  (또는 "카드 흐름으로 ↑" 버튼). 흐린 입력창을 항상 띄우지 않는다(§2.2 원칙 유지).
- **mock 모드 처리**: (a) 정정 명령 패턴("재분류"·"분류 다시"→ classify 단계 복귀, "등급이 이상해"→
  hazards 패널 포커스+안내, "거절"→ 거절 버튼 안내), (b) 일반 질문 → "카드 기반 진행을 우선합니다.
  {현재 단계} 카드에서 진행하거나 '재분류'라고 입력하세요" 류 안내, (c) **모든 입력은 사용자 버블로
  채팅 스트림에 기록**(감사 추적). 실연동은 `api.ts: chatTurn(sessionId, text)`로 전달(action·next_phase).
- **되돌리기/거절 경로**(PoC 핵심 2개):
  - **재분류**: 분류 확정 후에도 분류 카드에 "분류 다시 선택" → classify 복귀 + **이후 단계 산출물
    무효화**(assessment·dynRisk·fin·erp·confirmedCls 리셋, dynamicShown/finalizeShown ref 리셋) + 채팅 기록.
  - **평가 거절**: 위험요인 카드에 "이 평가 거절" → **거절 사유 필수(≥5자)** → 세션 거절 종료(`refused`)
    + "안전관리자에게 문의" 안내. 채팅 스트림에 거절 기록.
  - 전체 undo 스택은 PoC 범위 밖. 재분류·평가 거절 2경로가 핵심.

### 2.4 역할 게이트(권한) 규칙 (개정 2026-06-12)

작업자(worker)는 **확정·등록 권한이 없다**(ux_user_journey.md). 채팅·패널의 권한 액션은 `RoleGate`로 분기.

- `RoleGate allow={["safety_manager","admin"]}`로 감싸고 **worker fallback**을 제공:
  - 확정·ERP 등록(`FinalizeGate`) → **"안전관리자 검토 요청" CTA**(검토 대기 제출, `/manager` 목록 연결).
  - 위험등급 확정(`HazardMatrix editable`) → worker는 **읽기 전용**(`editable=false`).
  - 현장소장 조치 확인(작업중지·대피, `DynamicRiskPanel onApprove`) → worker는 **읽기 전용 안내**만.
- 매니저 화면과 게이트 방식·문구를 통일. "안전관리자 승인 요청"은 작업 재개 허가가 아니라 검토 sign-off.

## 3. 접근성

- 메시지 영역 `role="log"` + `aria-live="polite"` (새 메시지 announce).
- 각 메시지 `role="article"`, 발신자 라벨 sr-only.
- 퀵리플라이/액션칩 키보드 포커스·44px 터치.
- 타이핑 인디케이터 `aria-label="어시스턴트가 입력 중입니다"`.
- 자동 스크롤이 포커스를 가로채지 않게(focus 이동 금지, 스크롤만).

### 3.1 고대비(High Contrast) 규칙 — 햇빛 가독성 (개정 2026-06-12)

고대비 토글은 `html[data-contrast="high"]`를 세팅한다(AppProviders). 기본 약속:
**검정 배경(#000)·근검정 서피스(#0A0A0A)·흰 텍스트(#FFF)·흰 보더·노란 포커스(#FDE047).**

- **화면 단위 일관성(필수).** 같은 화면에서 일부만 반전되는 어중간한 상태 금지.
  컴포넌트가 CSS 변수(`--bg/--card/--fg…`)가 아니라 Tailwind 유틸리티
  (`bg-white`, `bg-surface*`, `text-ink-*`, `text-steel-*`, `border-line`, `bg-brand`,
  `bg-[#…]` 등)로 색을 하드코딩하면 변수만 뒤집혀도 이 색들이 그대로 남는다.
  → `app/globals.css`의 **고대비 유틸리티 오버라이드 레이어**(`[data-contrast="high"]{ .util{…!important} }`)
  에서 실제 사용 유틸리티를 일괄 재매핑한다. OFF(일반) 모드는 이 블록이 적용되지 않아 회귀 없음.
- **브랜드 오렌지 CTA.** 검정 위 대비 확보를 위해 밝은 변형 `#FF8A2A` + **검정 텍스트**.
  (`.text-white`보다 우선하도록 `.bg-brand.bg-brand` 이중 클래스로 specificity 확보.)
- **위험등급(상/중/하)·경보(INFO/WARN/STOP/EVAC)·에러 시맨틱 유지.** 솔리드 배지는
  흰 글자 대비 ≥4.5:1 채도(상 `#D4202A`/중 `#C2410C`/하 `#157F3B`)로 조정하고,
  검정 배경과 분리되도록 **흰 윤곽선**(`box-shadow: inset 0 0 0 1.5px #fff`)을 둔다.
  라이트 배너(`bg-[#FEF2F2]` 등)는 **어두운 틴트 + 밝은 텍스트**로 반전. 의미 색상 체계는 보존.
- 색상만으로 정보 전달 금지 — 등급·경보는 글리프(▲■●/✋⛔)·텍스트 라벨 병행(고대비 무관).
- 검증: 고대비 ON 캡처(`screenshots/HC1~HC4`) + OFF 회귀 캡처(`OFF*`) + e2e 24건.
  캡처 스크립트: `e2e/capture-contrast.mjs`(ON), `e2e/capture-contrast-off.mjs`(OFF).

## 4. 모바일/현장

- 챗은 본질적으로 모바일 우선(단일 컬럼). 입력창 하단 고정, safe-area 패딩.
- 리치 카드는 버블 폭 100%까지 확장.
- 고대비/장갑/햇빛 토큰 유지.

### 4.1 모바일 레이아웃·e2e hit-test 안정화 (개정 2026-06-12)

풀하이트 챗/시트가 모바일에서 깨지지 않도록(데스크톱은 무영향):
- **`100dvh`/`calc(100dvh-…)` 금지** — 모바일 Chrome에서 `dvh`가 `innerHeight`보다 크게 평가돼
  하단 컴포저·footer가 뷰포트 밖으로 밀려 hit-test가 깨진다. 대신 `html,body{height:100%}` +
  `body{display:flex; min-height:100svh}` + `#main{flex:1; min-height:0}` 풀하이트 플렉스 체인으로
  실제 뷰포트에 정확히 맞춘다. 챗 컴포저는 sticky가 아니라 **flex footer(`shrink-0`)** — 고정폭
  플렉스 컬럼에선 sticky가 불필요하고, Playwright의 scrollIntoView와 충돌해 dock이 자기 버튼을
  가로채는 오탐을 유발한다.
- **다이얼로그/바텀시트(KB 패턴)**: `fixed inset-0` 플렉스 컨테이너 + `max-h-[calc(100%-1rem)]`
  플렉스 패널. 본문만 `flex-1 overflow-y-auto`로 스크롤, **액션 푸터는 스크롤 밖 `shrink-0` 고정**.
  열림 동안 `body{overflow:hidden}` 스크롤 잠금.
- **`prefers-reduced-motion` 존중**(globals.css에서 애니메이션/`scroll-behavior` 무력화 + JS
  `scrollIntoView`도 `matchMedia`로 분기) — WCAG 2.3.3이자 모바일 hit-test 안정화. e2e는
  `playwright.config use.reducedMotion:"reduce"`로 동일 적용.
- **Playwright 모바일 클릭 오탐**: DOM은 가림이 없는데(`document.elementFromPoint`=대상) 터치
  hit-test가 인접 요소 intercept를 오탐하면, **먼저 `elementFromPoint`로 비가림을 단언한 뒤**
  `click({force:true})`로 우회한다(맹목 force 금지 — 단언이 실제 가림 회귀를 잡는다).

## 5. 구현 가이드

- `ChatShell` — 메시지 리스트 + 입력 독(dock) + 자동 스크롤.
- `ChatMessage` — role(assistant/user/system) + 아바타 + 버블 + children(리치 카드 슬롯).
- `TypingIndicator`, `QuickReplies`, `ChatComposer`(자연어 입력, NaturalLanguageInput 재사용/경량화).
- 상태 머신: messages[] 누적 + 현재 phase. 단계 전환 시 어시스턴트 메시지 push.
- 기존 페이지(app/session)는 챗 셸로 재구성하되, 컴포넌트 로직은 재사용.

## 6. 컴패니언(상시 동반) 패널 패턴 — 큰 화면 분리 (개정 2026-06-11)

> 기존 토글형 아티팩트(open/close)를 **상시 stage-aware 동반 패널**로 전환.
> 채택안: `ux_companion_panel.md` 추천 **B(작업 컨텍스트 캔버스) + C의 상시 경보 띠 1줄**.

대형 콘텐츠(위험요인 매트릭스, 동적 위험, 5×5, 인용)는 **항상 존재하는 우측 패널**로 분리하되,
**열림/닫힘 토글 없이 단계(stage)별 콘텐츠만 전환**한다(폭·위치 불변 → layout shift 없음).

- 데스크톱(≥1024px): 좌 채팅(440px / xl 520px) + 우 컴패니언 패널(상시). 콘텐츠만 페이드 전환.
- 모바일(<1024px): 패널 미점유 → 입력창 위 **요약 칩(스티키)** + 칩 탭 시 **풀스크린 시트**.
- **와이드 정렬 축(개정 2026-06-12)**: TopBar·ChatProgress·세션 분할을 모두 동일한 `mx-auto max-w-screen-2xl px-6` 컨테이너에 정렬 — 분할 화면이 풀블리드여도 상단바 로고/역할전환이 채팅·패널 가장자리와 같은 축에 놓이도록(초광폭에서도 중앙 정렬). 본문형 화면(홈·매니저)은 내부 가독 폭(max-w-3xl)을 유지하되 같은 외곽 축을 공유.
- **상시 경보 띠**: 패널 최상단 1줄 고정(작업중지 경보). 평시 INFO 톤, STOP/EVAC 강조 + 채팅 동기화.

### Stage 모델 (open 불리언 폐기)
`PanelView = briefing | classify | hazards | dynamic | review | registered`.
phase로 자동 매핑(`VIEW_BY_PHASE`), 헤더 탭으로 일시 override(phase 변경 시 자동 복귀).
- idle/refused/error = `briefing`(기상·작업중지 경보·오늘의 사고 사례·안전 팁·공종 트리) → dead space 제거.
- finalizing = `review`(체크리스트·게이트), finalized = `registered`(ERP 결과·산출물·다음 작업).

### 양방향 동기화 (핵심)
1. 큰 화면 단계 → 채팅에 요약 + **"검토 →"**(등록은 "결과 보기 →") 카드 push. 패널은 phase로 자동 stage 전환.
2. 패널에서 액션(등급 수정·시나리오 토글·현장소장 승인) → 단일 store 갱신 → 채팅 echo → 다음 단계.
3. 채팅·패널은 같은 store 공유. 요약 카드 클릭 = 패널을 "여는" 게 아니라 해당 **stage로 포커스**.

### 라벨 규칙
"오른쪽에서"(위치) 제거 → 기본 CTA **"검토 →"**, 등록 결과 카드 **"결과 보기 →"**.

### 컴포넌트
- `CompanionPanel`(`companion-panel`/`data-view`) — 경보 띠 + 헤더(탭 `panel-tab-*`) + stage 슬롯 + 모바일 닫기(`panel-sheet-close`).
- `PanelAlertStrip`(`panel-alert-strip`/`data-level`), `PanelViews`(Briefing/ClassifyTree/ReviewSummary/Registered), `PanelSummaryChip`(모바일).
- `ArtifactOpener`(`artifact-opener`) — 채팅 측 요약 카드(stage 포커스), 기본 CTA "검토".
- 접근성: 모바일 시트 `role="dialog"` ESC·dim, 데스크톱 `role="region"`. stage 전환은 `animate-fade-in`(transform 없음).
- 상세: `references/artifact_pattern.md`(컴패니언 패널 패턴으로 개정).

## references/
- `references/hoban_brand.md` — 호반 CI 색상·로고 규정·적용 가이드
- `references/chat_patterns.md` — 메시지 타입·상태 머신·스크롤·퀵리플라이 상세
- `references/artifact_pattern.md` — 컴패니언(상시 동반) 패널 패턴: stage 모델·상시 경보 띠·라벨 규칙·양방향 동기화 상세
