# UX Components — 호반 JHA Agent 컴포넌트 명세 (Phase 3)

> 작성: frontend-engineer · 스택: Next.js 14 + Tailwind + shadcn/ui.
> 응답 스키마 출처: `_workspace/02_foundation/rag_prompts/jha_generation_template.md`.
> 원칙: 모든 AI 출력은 수정/거절 가능 · 인용 1클릭 · 경계셀 자동확정 금지.

---

## 0. API JSON 필드 ↔ Prop 매핑 (★ backend 계약)

| 컴포넌트 | prop | API JSON 경로 | 변환/비고 |
|----------|------|--------------|----------|
| ClassificationCard | `major/sub/detail` | `classification.major_type/sub_type/detail_item` | null → "미분류" |
| ClassificationCard | `confidence` | `classification.confidence` | 0.8↑초록/0.5~0.8노랑/<0.5빨강 |
| ClassificationCard | `candidates` | **(신규 요청)** `classification.alternatives[]` | `{label, level, confidence}` — **현 스키마 미존재, backend 합의 필요** |
| HazardMatrix | `hazards[]` | `hazards[]` | 전체 배열 |
| HazardCard | `accidentType` | `hazards[].accident_type` | 탭 그루핑 키 |
| HazardCard | `description` | `hazards[].description` | — |
| HazardCard | `severity/frequency` | `hazards[].severity/frequency` | 1~5, 5×5 마커 좌표 |
| HazardCard | `riskGrade` | `hazards[].risk_grade` | 상/중/하 → 색+텍스트 |
| BoundaryCellBadge | `isBoundary` | `hazards[].boundary_cell` | true → "상(잠정)" 배지 |
| HazardCard | `controls[]` | `hazards[].controls[]` | 체크리스트(기본 미체크) |
| HazardCard/CitationPanel | `citations[]` | `hazards[].citations[]` | chunk_id `R00042` |
| HazardCard | `legalRefs[]` | `hazards[].legal_refs[]` | 조문 칩 |
| CitationPanel | `sourceRows[]` | `source_rows[]` | 원문 역추적 키 |
| CitationPanel | `chunkText/meta` | **(신규 요청)** `citation_detail[chunk_id]` | 원문 행 텍스트+메타. **현 스키마는 ID만 — backend 합의 필요** |
| CitationPanel | `score` | **(신규 요청)** `citation_detail[].score` | 검색 score 표시용 |
| RefuseNotice | `resultType` | `result_type` | refuse/no_match 분기 |
| RefuseNotice | `dataGap/gapAreas` | `human_review_flags.data_gap` / `.gap_areas[]` | partial refuse 영역명 |
| RefuseNotice | `warnings[]` | `warnings[]` | 갭 위험 안내 텍스트 |
| RefuseNotice/리스트 | `legalRefs[]` | `legal_refs[]` | 거절 시에도 조문 표시 |
| ErpRegistrationStatus | `erpStatus/erpId` | **(신규 요청)** `erp.status` / `erp.erp_id` | 비동기 등록 결과. **erp-integration-engineer 협의** |
| ReviewWorkflow | `criticalRegister` | `critical_register` | "O"/"X"/"O (잠정)" |
| ReviewWorkflow | `humanReviewRequired` | `human_review_flags.human_review_required` | true → 확정 게이트 |
| LowConfidenceBanner | `show` | `result_type==="low_confidence"` 또는 `human_review_flags.low_citation_confidence` | — |

---

## 1. NaturalLanguageInput
- **props**: `value:string`, `onChange(v)`, `onSubmit(v)`, `suggestions:string[]`(taxonomy), `recent:string[]`, `placeholders:string[]`, `minChars=30`, `maxChars=150`, `voiceEnabled=true`.
- **states**: `idle | typing | listening(음성) | submitting`. 글자수 카운터, placeholder 로테이션(5s), 자동완성 드롭다운 open/close.
- **events**: `onSubmit`(분석 트리거), `onVoiceResult(text)`(Web Speech API ko-KR), `onSelectSuggestion`, `onSelectRecent`.
- **a11y**: textarea `aria-label="작업 내용 입력"`, 자동완성 `role="listbox"`. 음성 버튼 `aria-pressed`.

## 2. ClassificationCard
- **props**: `major/sub/detail:string|null`, `confidence:number`, `candidates:{label,level,confidence}[]`, `onEdit(level, value)`, `onConfirm()`.
- **states**: `collapsed | editing(level)`. confidence 색 구간. `<0.5` → LowConfidenceBanner 표출.
- **events**: `onEdit`(인라인 드롭다운 선택/직접입력), `onConfirm`(다음 단계).
- **a11y**: `role="region" aria-label="AI 분류 추천"`. confidence 바에 `aria-valuenow` + 텍스트("높음/보통/낮음").

## 3. HazardMatrix
- **props**: `hazards:Hazard[]`, `groupBy="accident_type"`, `onToggleControl(hazardId, idx)`, `onCitationClick(chunkId)`, `onReviewHazard(hazardId)`.
- **states**: 활성 탭(재해형태), 카드 확장/축소, 매트릭스 시각화 토글.
- **events**: `onToggleControl`, `onCitationClick`(→ CitationPanel), `onGradeChange`(경계셀 라디오).
- **a11y**: 탭 `role="tablist"`. 각 카드 `role="article"`.

## 4. BoundaryCellBadge ★ (경계셀 곱16)
- **props**: `isBoundary:boolean`, `provisionalGrade="상"`, `criticalRegister="O (잠정)"`, `confirmed:boolean`, `onConfirmGrade(grade, reason)`.
- **states**: `provisional`(잠정·확정 전) → `confirmed`(상/중 택1 후). 잠정 시 라디오 미선택이면 상위 ReviewWorkflow에 `blockSubmit=true` 전파.
- **렌더**: `⚠ 상(잠정)` + `O(잠정)` + "경계 셀(강도4×빈도4) — 안전관리자 판단 필요". 확정 시 잠정 배지 제거.
- **events**: `onConfirmGrade("상"|"중", reason)`. "중" 선택 시 reason 필수.
- **a11y**: 배지 `role="status" aria-label="잠정 등급 상, 안전관리자 확정 필요"`. 색상 외 "(잠정)" 텍스트 필수.

## 5. CitationPanel
- **props**: `open:boolean`, `chunkId:string`, `detail:{text, meta, score}|null`, `relatedChunks:string[]`, `onClose()`, `loadError:boolean`.
- **states**: `loading | loaded | error`. 다중 인용 탭. loadError 시 **인용 ID는 항상 표시**(완전 미표시 금지).
- **events**: `onTabChange(chunkId)`, `onRetry()`, `onClose()`.
- **a11y**: 데스크탑 사이드 패널, 모바일 `Dialog`(모달). open 시 포커스 이동 + `aria-live` announce. 원문 위험요인 행 `<mark>` 하이라이트.

## 6. RiskMatrixVisualizer
- **props**: `severity:number`, `frequency:number`, `grade:string`, `isBoundary:boolean`, `gridGradeMap`(safety_scope 5×5 맵).
- **states**: 현재 마커 셀 강조, 호버 미리보기. 경계셀(s4×f4)은 `*` + "상/중 혼합" 표기.
- **events**: `onCellHover(cell)`.
- **a11y**: 그리드 `role="table"`, 셀에 등급 텍스트(색상만 의존 금지). 현재 셀 `aria-current="true"`.

## 7. ReviewWorkflow
- **props**: `steps`, `currentStep`, `checklist:{label, done}[]`, `boundaryHazards[]`, `criticalRegister`, `humanReviewRequired:boolean`, `onSign(method)`, `onConfirmAndRegister()`.
- **states**: progress(분류→평가→검토→확정→등록). **확정 게이트**: 미검토 항목 OR 미확정 경계셀 OR `humanReviewRequired && !resolved` → `confirmDisabled=true`.
- **events**: `onCheck(item)`, `onSign("pin"|"sso")`, `onConfirmAndRegister`.
- **a11y**: 진행바 `aria-label`, 비활성 버튼 `aria-disabled` + 사유 텍스트 연결(`aria-describedby`).

## 8. ErpRegistrationStatus
- **props**: `status:"idle"|"pending"|"success"|"failed"|"session_expired"`, `erpId:string|null`, `queuePosition`, `onRetry()`, `onContactAdmin()`.
- **states**: pending(스피너) / success(ERP ID) / failed(재시도+문의+큐) / session_expired(임시저장 복구).
- **events**: `onRetry`, `onContactAdmin`, `onResumeAfterLogin`.
- **a11y**: 상태 변경 `aria-live="assertive"`(시각 알림 우선, 현장 소음 고려). 스피너 `role="status"`.

## 9. RefuseNotice ★
- **props**: `resultType:"refuse"|"no_match"`, `mode:"full"|"partial"`, `gapAreas:string[]`, `warnings:string[]`, `legalRefs:string[]`, `evaluatedHazards:Hazard[]`(partial 시), `onContact()`, `onForwardToManager()`.
- **states**:
  - `partial`(data_gap, 밀폐공간): 평가된 위험(추락) 카드 + 갭 위험은 "평가 안 됨 — 대책 생성 안 됨" + 조문 표시만.
  - `full`(석면·화학물질 refuse / no_match): 거절 카드 + 조문 표시만 + 문의 CTA. **대책 렌더 금지**.
- **events**: `onContact`(담당자 ☎), `onForwardToManager`(수기 평가 전달).
- **a11y**: `role="alert"`. 거절 사유 + 다음 행동 명시. 조문은 표시하되 대책 영역 비노출.

---

## 공통: RoleGate / A11y / 디자인 토큰
- **RoleGate**: `<RoleGate allow={["safety_manager","admin"]}>` — 권한 부족 시 미렌더. worker는 확정/ERP 버튼 미표시.
- **변형(A/B)**: `variant={getVariant(splitKey)}` — eval-engineer 정의 split key 사용, `variants/` 분리.
- **토큰**: `lib/tokens.ts`(SKILL 정의 흡수). 등급색 risk.high/medium/low + 텍스트 라벨 동시.

---

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 초기 9 컴포넌트 + 매핑표 작성 | Phase 3 Design |
