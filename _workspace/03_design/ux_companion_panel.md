# UX 설계 — 상시 동반 패널(Companion Panel) 재설계

> 작성: frontend-engineer · 날짜: 2026-06-11 · 대상 PoC: 호반 JHA Agent
> 트리거: 사용자 피드백 3건 — (1) "오른쪽에서 검토하기" 라벨이 길다 (2) 아티팩트 패널이 켜졌다 꺼졌다 하는 인터페이스가 어색하다 (3) 우측 화면이 "항상 존재"한다면 어떤 콘텐츠가 좋을지.

이 문서는 **코드를 변경하지 않는 설계 산출물**이다. 현 구현(`app/session/[id]/page.tsx` + `components/chat/ArtifactPanel.tsx`)의 **토글 기반 아티팩트**를 **상시 stage-aware 동반 패널**로 전환하는 방향을 정의한다.

---

## 0. 현황 진단 (왜 어색한가)

현 구현은 Claude Artifacts 패턴을 그대로 차용했다. 동작:

- `artifact.open` 불리언 토글. `assess`/`dynamic` 단계 도달 시 `openArtifact()`로 강제 오픈, `approveStoppage()`에서 `closeArtifact()`로 강제 닫힘.
- 닫혀 있으면 채팅이 `flex-1`(전체 폭), 열리면 채팅 `lg:w-[460px]` + 패널 `flex-1`.
- 채팅 측 "아티팩트 열기" 카드(`ArtifactOpener`)의 CTA = "오른쪽에서 검토하기 →".

**문제의 근본 원인:**

1. **레이아웃이 진동(layout shift)** — 패널이 열리고 닫힐 때마다 채팅 컬럼 폭이 460px ↔ 전체 폭으로 점프한다. 단계가 바뀔 때마다 화면 절반이 출렁여 "어색함"을 유발.
2. **우측이 빈 시간(dead space)** — idle·classify·finalize·registered 단계에서 우측이 통째로 비거나 사라진다. 화면의 절반이 놀고 있고, 그 절반이 갑자기 나타났다 사라진다.
3. **라벨이 위치를 설명** — "오른쪽에서 검토하기"는 *무엇을* 보는지가 아니라 *어디서* 보는지를 말한다. 패널이 상시 존재하면 "오른쪽에서"는 자명해지고 군더더기가 된다.

> 결론: 토글을 없애고 **패널을 항상 두되, 단계에 따라 콘텐츠만 전환(stage-aware swap)**한다. 이는 Microsoft 365 Copilot 2026 리디자인이 채택한 "progressive disclosure + adaptive single pane" 방향과 일치한다([Microsoft 365 Blog](https://www.microsoft.com/en-us/microsoft-365/blog/2026/05/28/introducing-a-new-design-for-microsoft-365-copilot/)).

---

## 1. 웹 리서치 요약 (설계 근거)

| 영역 | 핵심 시사점 | 본 설계 반영 |
|---|---|---|
| Claude Artifacts vs ChatGPT Canvas | 둘 다 우측 사이드 패널 = "iterate without scrolling chat". Artifacts는 매 수정마다 전체 재렌더(전환은 부드러우나 상태 리셋 위험), Canvas는 라인 단위 편집(상시 협업 지향). ([InstaPods](https://instapods.com/blog/claude-artifacts-vs-chatgpt-canvas/), [XsOne](https://xsoneconsultants.com/blog/chatgpt-canvas-vs-claude-artifacts/)) | 패널을 **상시 존재**로 두되, 단계 전환은 콘텐츠 swap(전체 재렌더)으로 — 단 평가 데이터(assessment/dynRisk)는 store에 유지해 리셋 없음. |
| MS 365 Copilot 2026 리디자인 | "scattered AI features → unified, context-aware layer that adapts to what you're working on in real time". prompt line을 task-aware workspace로. progressive disclosure로 필요한 도구만 노출. ([Help Net Security](https://www.helpnetsecurity.com/2026/05/29/microsoft-365-copilot-redesign/), [Microsoft Design](https://microsoft.design/articles/a-simplified-system/)) | 동반 패널 = "context-aware layer". 단계별로 패널 콘텐츠가 자동 적응. 토글 제거. |
| GitHub Copilot / MS Learn 위젯 가이드 | declarative agent UI 위젯은 "appear only when you need them" + 일관된 단일 진입점. ([MS Learn](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/declarative-agent-ui-widgets-guidelines)) | 패널 헤더에 단계 라벨 + 콘텐츠는 stage state로 결정. |
| SafetyCulture / Procore 안전 대시보드 | 실시간 센서·기상 피드 연결, 위치·날씨·사진 캡처, corrective-action 시각화. 조건 모니터링이 상시 표시. ([SafetyCulture iAuditor](https://safetyculture.com/iauditor)) | idle 단계 패널 = "오늘의 현장 브리핑"(기상 위젯 상시 노출)로 dead space 제거. |
| 디지털 TBM/툴박스 토크 앱 | 템플릿이 job type에 따라 분기, 관련 hazard 카테고리 자동 노출, weather-condition 확인 강제, 최근 near-miss 교훈 포함. 오프라인 모드 후 동기화. ([HCSS](https://www.hcss.com/products/safety-toolbox-talks/), [Raken](https://www.rakenapp.com/features/toolbox-talks), [SafetyCulture Topics](https://safetyculture.com/topics/toolbox-topics)) | idle 패널에 "오늘의 사고 사례"(재해사례 133행 코퍼스) + 기상 확인 + 안전 팁. classify 패널에 공종 트리(job-type 분기). |

---

## 2. 상시 패널 상태 모델 (Stage-Aware Content)

패널은 **항상 렌더**된다(`open` 토글 폐기). 워크플로우 `phase`를 패널 콘텐츠 `panelView`에 매핑한다. 전환은 페이드/슬라이드(150~200ms)로 부드럽게, 데이터는 store에 유지.

```ts
// 새 상태 모델 (개념). artifact.open 불리언 폐기.
type PanelView =
  | "briefing"   // idle: 오늘의 현장 브리핑
  | "classify"   // classify: 공종 트리·유사작업 탐색
  | "hazards"    // assess: 위험요인 매트릭스 (기존 아티팩트)
  | "dynamic"    // dynamic: 동적 위험(기상·지형)
  | "review"     // finalizing: 검토 요약·게이트 상태
  | "registered";// finalized: 등록 결과 + 다음 작업

// phase → panelView 매핑 (자동), 단 사용자가 탭으로 일시 override 가능
const VIEW_BY_PHASE: Record<Phase, PanelView> = {
  loading:    "briefing",
  classify:   "classify",
  assess:     "hazards",
  dynamic:    "dynamic",
  finalizing: "review",
  finalized:  "registered",
  refused:    "briefing",  // 거절 시 브리핑으로 복귀(다음 작업 유도)
  error:      "briefing",
};
```

### 단계별 패널 콘텐츠 명세

| phase | panelView | 패널 헤더 | 콘텐츠 | 데이터 출처 |
|---|---|---|---|---|
| idle / loading | `briefing` | "오늘의 현장 브리핑" | ① 실시간 기상 위젯(작업중지 경보 배너) ② 오늘의 사고 사례 1건 ③ 안전 팁 로테이션 | `lib/dynamicRiskProvider.ts`(기상), 재해사례 대공종 133행, weatherRules 경보 |
| classify | `classify` | "작업 분류 도우미" | ① 대공종 20 트리 → 중공종 254 드릴다운 ② AI 추천 분류 하이라이트 ③ 유사 작업(같은 중공종 detail 예시) | `02_foundation/taxonomy_lookup/{major,sub,detail}.csv` |
| assess | `hazards` | "위험요인 평가" | 기존 `HazardMatrix` + `RiskMatrixVisualizer`(5×5) + 중대재해 등록 배지 | `assessment` store |
| dynamic | `dynamic` | "동적 위험 (현장·기상·지형)" | 기존 `DynamicRiskPanel`(작업중지 룰·지형·현장소장 승인) | `dynRisk` store |
| finalizing | `review` | "검토 요약" | ① 확정 전 체크리스트(분류·위험요인·동적·게이트 차단 사유) ② 미검토 항목 강조 | `blockingReasons`, `assessment`, `dynRisk` |
| finalized | `registered` | "등록 완료" | ① ERP 등록 결과(ID·상태) ② 등록 요약 PDF/TBM 일지 링크(mock) ③ "새 작업 평가" + 추천 다음 작업 | `erp`, `fin` |

> **핵심 차이:** 단계가 끝나도 패널은 사라지지 않고 **다음 단계 콘텐츠로 슬라이드**. idle/finalize/registered처럼 "기존엔 빈 화면"이던 구간이 모두 유용한 콘텐츠로 채워진다.

### 사용자 override (탭)
패널 헤더에 작은 탭/세그먼트를 둬, 진행 단계와 무관하게 사용자가 **"브리핑"으로 잠깐 돌아가** 기상·사고사례를 다시 볼 수 있게 한다(자동 매핑이 기본, 사용자가 일시 전환 가능 → 다음 단계 진입 시 자동 복귀). MS Copilot의 "context-aware layer + 사용자 제어" 균형.

---

## 3. 시나리오 옵션 비교 (A / B / C)

### 옵션 A — "안전 브리핑 허브"형 (정보 상시 우선)

- **콘셉트:** 우측 패널 = 항상 "현장 안전 정보 대시보드". 기상·경보·사고사례·안전팁이 **상시 고정**되고, 위험요인/동적위험은 그 대시보드 안의 **확장 카드**로 인라인 표시.
- **콘텐츠 구성:** 상단 고정 기상 위젯 + 작업중지 경보 배너 → 그 아래로 단계별 카드(분류 추천 / 위험요인 요약 / 동적위험 요약)가 누적.
- **장점:** dead space 완전 제거. 현장 사용자가 *언제나* 기상·경보를 본다(안전 가치 최상). 데모에서 "상시 안전 정보" 인상 강함.
- **단점:** 위험요인 매트릭스(큰 콘텐츠)가 대시보드 안에 갇혀 비좁다. assess/dynamic 단계에서 검토 집중도 ↓. 정보 과밀(한 화면 한 결정 원칙 위배 위험).
- **구현 비용:** 중. 대시보드 셸 신규 + 기존 매트릭스를 확장 카드로 리팩터.

### 옵션 B — "작업 컨텍스트 캔버스"형 (현재 단계 작업물 우선 + 유휴 시 브리핑)  ★추천

- **콘셉트:** 우측 패널 = 항상 존재하는 **단일 캔버스**. 콘텐츠가 현재 단계의 "작업물"로 전환된다. **작업 전(idle)·작업 후(registered)·거절(refused) 등 작업물이 없는 구간에만 브리핑(기상·사고사례·팁) 표시.**
- **콘텐츠 구성:** §2 상태 모델 그대로. briefing → classify(공종 트리) → hazards(매트릭스) → dynamic → review → registered 슬라이드 전환.
- **장점:**
  - 토글·layout shift 제거(패널 폭 고정, 콘텐츠만 swap) → "어색함" 직접 해소.
  - 각 단계에서 **한 화면 한 결정** 유지(위험요인 검토 시 매트릭스에 집중).
  - idle/finalize에서 브리핑·결과로 dead space 해소.
  - 기존 컴포넌트(`HazardMatrix`·`DynamicRiskPanel`·`RiskMatrixVisualizer`) 100% 재사용.
- **단점:** assess/dynamic 진행 중엔 기상 위젯이 가려진다 → 헤더 탭/미니 경보 배지로 보완(작업중지 경보는 *어느 단계든* 패널 상단 1줄로 상시 표시).
- **구현 비용:** **저~중.** `artifact.open` 불리언 → `panelView` enum으로 교체 + briefing/classify/review/registered 4개 뷰 신규. 기존 hazards/dynamic 뷰는 거의 그대로.

### 옵션 C — 하이브리드 (분할 캔버스: 상시 경보 띠 + 단계 캔버스)

- **콘셉트:** 패널을 수직 2영역으로. **상단 = 항상 고정된 "안전 띠"**(기상·작업중지 경보·오늘의 사고사례 1줄), **하단 = 옵션 B의 단계별 캔버스**.
- **장점:** B의 집중도 + A의 상시 안전 정보 둘 다 확보. 안전 경보가 어느 단계에서도 사라지지 않음(법적·안전 가치).
- **단점:** 세로 공간 분할로 매트릭스 영역이 다소 축소. 상단 띠 콘텐츠 설계 추가. 모바일에서 2영역 처리 까다로움.
- **구현 비용:** 중. B + 상단 고정 SafetyStrip 컴포넌트.

---

## 4. 추천안 + 근거

> **추천: 옵션 B(작업 컨텍스트 캔버스) + C의 "상시 경보 띠" 1줄만 흡수.**
> 즉, 패널은 단계별 단일 캔버스로 전환(B)하되, **작업중지 경보가 활성일 때만** 패널 최상단에 얇은 경보 띠를 상시 표시(C의 핵심 안전 가치만 저비용으로 흡수). 평상시엔 띠 없이 캔버스 전체.

**근거 (PoC 데모 임팩트 × 구현 비용):**
1. **어색함 직접 해소** — 토글·폭 진동 제거가 피드백 #1·#2의 직접 해법. 패널 폭 고정 + 콘텐츠 슬라이드.
2. **dead space → 안전 콘텐츠** — idle의 "오늘의 현장 브리핑"은 기존 mock 자산(기상 provider·사고사례 133행·weatherRules)을 **신규 데이터 없이** 재활용 → 데모에서 "상시 안전 동반자" 인상이 가장 강함(피드백 #3 정확히 충족).
3. **최저 구현 비용** — 기존 매트릭스/동적위험 컴포넌트 무수정 재사용. 신규는 뷰 4개(브리핑·분류트리·검토요약·등록결과) + enum 교체뿐. A는 매트릭스 리팩터, C는 모바일 2영역 부담 → B가 비용 최소.
4. **한 화면 한 결정 유지** — assess/dynamic에서 캔버스가 작업물에 집중(인지 부하 최소화 원칙 준수). 경보만 1줄로 상시 노출해 안전성 타협 없음.
5. **확장성** — B의 `panelView` enum은 추후 호반 ERP 실데이터·실 기상 API로 콘텐츠만 교체 가능(provider 추상화와 정합).

---

## 5. 라벨 개선 — "오른쪽에서 검토하기" 대체

패널이 상시 존재하므로 "오른쪽에서"(위치)는 군더더기. *무엇을 하는지*만 짧게. 채팅 측 요약 카드(`ArtifactOpener`)는 이제 "열기"가 아니라 "패널을 해당 뷰로 포커스"하는 동작이므로 라벨도 그에 맞춘다.

| 순위 | 후보 | 길이 | 적합 맥락 | 비고 |
|---|---|---|---|---|
| ★1 | **검토 →** | 3자 | 범용(위험요인·동적위험·검토요약) | 가장 짧고 명확. 장갑 터치에도 충분한 타깃은 카드 전체. |
| 2 | **상세 보기** | 4자 | 위험요인·동적위험 상세 | 중립적·친숙. "보기"가 읽기 인상 → 수정 가능함을 본문서 보완 필요. |
| 3 | **패널에서 보기** | 6자 | 패널 존재를 처음 안내할 때(1회) | 첫 등장 시 1회만, 이후 "검토 →"로. |

> **권장:** 기본 CTA를 **"검토 →"**로. 단계별 미세 조정 — 위험요인=`검토 →`, 동적위험=`검토 →`, 등록완료 카드=`결과 보기 →`. (현 코드의 `cta="오른쪽에서 검토하기"` 기본값 및 `ArtifactOpener`의 `오른쪽에서 검토하기 →` 하드코딩 2곳 교체 대상.)

---

## 6. 와이어프레임 (ASCII) — 추천안 B

### 6-1. idle 상태 (작업 입력 전 — 패널 = 오늘의 현장 브리핑)

```
┌───────────────────────────────────────────────────────────────────────┐
│  [호반] JHA 안전 도우미                       분류 ─ 위험 ─ 동적 ─ 확정  │ ← 상단 진행 띠
├──────────────────────────────┬────────────────────────────────────────┤
│  채팅 (좌, max-w 고정)        │  동반 패널 (우, 폭 고정·상시)           │
│                              │  ┌── 오늘의 현장 브리핑 ─[브리핑▾]──┐    │ ← 헤더(탭)
│  [호반] 안녕하세요, 호반      │  │ ☀ 서울 중구  24℃  습도 55%       │    │
│  안전 도우미입니다. 평가할    │  │ 🟢 작업중지 경보 없음             │    │ ← 상시 경보 띠
│  작업을 한 줄로 입력해 주세요.│  ├──────────────────────────────────┤    │
│                              │  │ 📌 오늘의 사고 사례               │    │
│  ┌─ 예시 작업 ───────────┐   │  │ "타워크레인 해체 중 붐 낙하"      │    │ ← 재해사례 133행
│  │ 타워크레인 해체        │   │  │ · 강풍 시 작업 강행이 원인        │    │
│  │ 굴착 흙막이            │   │  │ [사례 더보기 →]                  │    │
│  │ 밀폐공간 배관          │   │  ├──────────────────────────────────┤    │
│  └───────────────────────┘   │  │ 💡 오늘의 안전 팁                 │    │
│                              │  │ 고소작업 전 안전대 체결 2회 확인  │    │ ← 로테이션
│  ┌─────────────────────────┐ │  │ ───────── ● ○ ○ ─────────         │    │
│  │ 작업 내용을 입력…    [▶] │ │  └──────────────────────────────────┘    │
│  └─────────────────────────┘ │                                          │
└──────────────────────────────┴────────────────────────────────────────┘
```

### 6-2. assess 상태 (위험요인 평가 — 패널 = 매트릭스, 경보 띠 상시)

```
┌───────────────────────────────────────────────────────────────────────┐
│  [호반] JHA 안전 도우미                  분류 ✓ ─[위험]─ 동적 ─ 확정     │
├──────────────────────────────┬────────────────────────────────────────┤
│  채팅 (좌)                    │  동반 패널 (우, 폭 고정 — 콘텐츠만 전환) │
│                              │  ⚠ 강풍주의보 · 타워크레인 운전 제한      │ ← 경보 띠(활성 시만)
│  [사용자] 이 분류로 진행할게요│  ┌── 위험요인 평가 ──[브리핑▾·분류·위험]┐│ ← 헤더 탭
│         (타워크레인(T형))     │  │ 위험요인 평가 결과   ⚠중대재해 등록 O││
│                              │  │ ┌── 5×5 매트릭스 ──┐               ││
│  [호반] 재해형태별 위험요인   │  │ │  강도→            │  상=빨강       ││ ← RiskMatrixVisualizer
│  8건을 평가했어요.            │  │ │ 빈 ▓▓▒▒░         │  중=주황       ││
│                              │  │ │ 도 ▓▒▒░░         │  하=초록       ││
│  ┌─ 📋 위험요인 평가 (8건) ─┐ │  │ └──────────────────┘               ││
│  │ 상 2 · 중 3 · 하 3 · 경계1│ │  ├──────────────────────────────────┤│
│  │                 [검토 →] │ │  │ ▸ 떨어짐  강3×빈3=상  [원문]      ││ ← HazardMatrix
│  └───────────────────────────┘ │  │   ☑ 안전대 체결 ☑ 방호울          ││   (등급 수정 가능)
│         ↑ 라벨 "검토 →"        │  │ ▸ 맞음    강2×빈2=중  [원문]      ││
│                              │  │ ▸ 무너짐  강3×빈2=상(경계) [원문] ││
│  ┌─────────────────────────┐ │  │   ⚠ 경계셀 — 안전관리자 확정 필요 ││
│  │ (카드 액션 대기 중…)  [▶]│ │  └──────────────────────────────────┘│
│  └─────────────────────────┘ │                                          │
└──────────────────────────────┴────────────────────────────────────────┘
```

> 두 상태에서 **패널 폭·위치 불변**(좌 채팅 폭도 불변). 바뀌는 것은 **패널 내부 콘텐츠뿐** → layout shift 없음. 경보 띠는 작업중지 경보가 활성일 때만 1줄 추가(idle=초록 "경보 없음", assess=주황 "강풍주의보").

---

## 7. 모바일 처리 방침 (상시 패널 불가 시 폴백)

데스크톱(`≥lg`)은 좌채팅+우패널 상시. 모바일(`<lg`)은 화면 폭상 2컬럼 상시 불가 → 다음 폴백:

1. **기본: 채팅 단일 컬럼.** 패널은 화면을 점유하지 않음.
2. **단계 요약 칩(스티키):** 채팅 하단 입력창 위에 현재 단계의 패널 요약을 **얇은 스티키 바**로 상시 표시.
   - idle: `☀24℃ · 🟢경보없음 · 💡안전팁` (탭 시 브리핑 바텀시트)
   - assess: `📋 위험요인 8건 · 상2 중3 하3 · [검토]`
   - dynamic: `⚠ 강풍주의보 · 작업중지 룰 1 · [검토]`
   - 작업중지 경보 활성 시 칩이 주황/빨강으로 변색(색상+텍스트 병행, WCAG).
3. **상세는 바텀시트:** 칩 탭 → 풀스크린 바텀시트로 해당 뷰(매트릭스·동적위험·브리핑). 기존 `ArtifactPanel`의 모바일 시트(`role="dialog"`·ESC·dim·포커스 트랩) 로직 재사용 — **단, "토글로 등장"이 아니라 "요약 칩의 자연스러운 확장"**으로 의미를 바꿈(어색함 완화).
4. **경보는 절대 숨기지 않음:** 작업중지/대피 경보는 모바일에서도 채팅 상단 고정 배너로 별도 노출(바텀시트 닫혀 있어도 보임). 현장 소음·햇빛 환경 고려한 고대비.

> 즉 모바일에서 "상시 우측 패널"은 **상시 요약 칩 + 온디맨드 바텀시트**로 폴백한다. 정보는 항상 1줄로 존재하고, 상세만 펼친다.

---

## 8. 변경 영향 요약 (구현 단계 인계용 — 본 문서는 코드 미변경)

| 항목 | 현재 | 변경 후(추천안 B) |
|---|---|---|
| 패널 상태 | `artifact: {open, kind}` 불리언 토글 | `panelView: PanelView` enum (상시, phase 자동 매핑 + 탭 override) |
| 레이아웃 | `open` 시 채팅 460px ↔ 닫힘 전체 폭(진동) | 채팅·패널 폭 고정, 콘텐츠만 페이드/슬라이드 |
| idle/finalize 우측 | 빈 화면/없음 | 브리핑·검토요약·등록결과(dead space 제거) |
| 신규 뷰 컴포넌트 | — | `BriefingView`(기상+사고사례+팁), `ClassifyTreeView`(공종 트리), `ReviewSummaryView`, `RegisteredView` |
| 재사용(무수정) | — | `HazardMatrix`, `DynamicRiskPanel`, `RiskMatrixVisualizer`, dynamicRiskProvider, weatherRules, taxonomy CSV |
| 라벨 | "오른쪽에서 검토하기 →" (2곳) | "검토 →" / 등록 카드 "결과 보기 →" |
| 경보 띠 | 없음(동적위험 패널 내부) | 패널 최상단 1줄 상시(활성 시), 모바일은 채팅 상단 고정 배너 |
| 모바일 | 토글 풀스크린 시트 | 상시 요약 칩(스티키) + 온디맨드 바텀시트 |
| `closeArtifact()` 호출 | `approveStoppage`에서 강제 닫힘 | 폐기 — 단계 전환은 `panelView` 갱신으로 |

> 회귀 테스트 주의: 기존 `data-testid="artifact-panel"`·`artifact-close`·`artifact-opener` 셀렉터를 쓰는 e2e가 있다면 `companion-panel`·`panel-tab`·`panel-focus`로 갱신 필요(현 `ArtifactPanel.tsx` 셀렉터 기준).

---

## 9. 출처 (웹 리서치)

- [Claude artifacts vs ChatGPT canvas: side-by-side (2026) — InstaPods](https://instapods.com/blog/claude-artifacts-vs-chatgpt-canvas/)
- [ChatGPT Canvas vs Claude Artifacts: Deep-Dive — XsOne Consultants](https://xsoneconsultants.com/blog/chatgpt-canvas-vs-claude-artifacts/)
- [Introducing a new design for Microsoft 365 Copilot — Microsoft 365 Blog (2026-05-28)](https://www.microsoft.com/en-us/microsoft-365/blog/2026/05/28/introducing-a-new-design-for-microsoft-365-copilot/)
- [Microsoft 365 Copilot redesign brings context and actions into one workspace — Help Net Security](https://www.helpnetsecurity.com/2026/05/29/microsoft-365-copilot-redesign/)
- [A simplified system — Microsoft Design](https://microsoft.design/articles/a-simplified-system/)
- [UX guidelines for interactive UI widgets in declarative agents — Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-365-copilot/extensibility/declarative-agent-ui-widgets-guidelines)
- [iAuditor — Inspection Software & Mobile Inspection App — SafetyCulture](https://safetyculture.com/iauditor)
- [Toolbox Talk App for Construction Safety Meetings — HCSS](https://www.hcss.com/products/safety-toolbox-talks/)
- [Toolbox Talk App for Construction Safety Meetings — Raken](https://www.rakenapp.com/features/toolbox-talks)
- [Toolbox Talk Topics: A Guide — SafetyCulture](https://safetyculture.com/topics/toolbox-topics)
