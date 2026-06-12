# Safety Final Review — 최종 도메인 검수 보고 (Integration)

> 작성: safety-domain-expert · Phase 6 (Integration)
> 작성일: 2026-06-10
> 검수 기준(SSOT): `02_foundation/safety_risk_matrix_spec.md`, `02_foundation/safety_legal_citation_matrix.md`
> 목적: Build/Design 산출물이 도메인 규칙(KRAS 5×5·등급 임계곱·중점등록·법정 인용·refuse)에 정합한지 안전공학 관점 최종 보증. PoC 데모 가능 여부 판정.

---

## 0. 종합 판정 (요약)

| 검수 대상 | 판정 | 핵심 근거 |
|-----------|:----:|----------|
| 1. system_prompt.md (등급·경계셀·중점등록·인용·refuse) | **조건부 적합** | 임계곱·경계셀·중점등록·인용 의무 전부 SSOT와 일치. refuse 지시는 있으나 실효 미검증(아래 R1) |
| 2. erp_register_flow.md 페이로드 (법정 필수 필드) | **적합** | citation_matrix §5 필수 필드(approved_by/at, MUST citations, human_review 증빙) 전부 반영 + 이중 게이트 |
| 3. ux_wireframes/components (오해석 위험) | **조건부 적합** | 등급 색+텍스트 병기, (잠정) 텍스트, refuse 분리 양호. 경미한 용어 보강 권고(R3·R4) |
| 4. e2e_mock_baseline_analysis (도메인 해석) | **적합(해석 타당)** | refuse 0/2·경계셀 PASS의 의미 해석이 도메인적으로 정확. 단 R1을 운영 차단 항목으로 승격 필요 |
| 5. domain_postprocess.py (등급·중점등록 코드) | **적합** | 임계곱 하≤9/중10~15/상≥16, 곱16→HIGH+O_TENTATIVE+human_review, O⇔상 1:1 전부 SSOT 일치 |

**종합: PoC 데모 가능 (조건부).** 메커니즘 안전장치(코드 권위 등급 재계산·경계셀 강제·인용 불변식·ERP 이중 게이트)는 도메인 규칙과 정합하며 데모 가능. **단 refuse 가드레일(밀폐공간·석면) 실효성 미입증은 데모 시나리오 제약 + 운영 전환 전 필수 보완**.

---

## 1. system_prompt.md 검수 — 조건부 적합

### 1.1 등급 임계곱·경계셀 — 적합
- 프롬프트 본문(L30~33)의 임계: 하≤9 / 중10~15 / 상≥16 → `safety_risk_matrix_spec.md §2.1`과 **완전 일치**.
- 경계셀(곱16, 강도4×빈도4)(L33): 자동확정 금지 + 기본값 상 + boundary_cell=true + human_review_required=true + 고정 메시지 → `spec §3.2`와 **완전 일치**.
- 우수점: L34에서 "시스템이 재계산·검증하므로 강도·빈도와 잠정등급·플래그를 정확히 채우는 데 집중" 명시 → 코드 권위(domain_postprocess) 구조와 일관. LLM이 등급을 단독 확정하지 않도록 역할 분리.

### 1.2 중점등록 — 적합
- L37~41: O ⇔ 등급 상 1:1, 곱16 "O (잠정)"+human_review, 법정대상이나 중/하면 자동승급 금지+legal_critical_candidate 플래그만 → `spec §5.2/§5.4`와 **완전 일치**.
- 감사추적성(L41 사유 기재) → `spec §5.5` 반영.

### 1.3 법적 인용 의무 — 적합
- L44~57: 추락§42~45, 낙하§14·15·20, 붕괴§38·50·332·338~340, 감전§301~304(등급무관), 협착§20·87·142, 화재§241·232·236, 타워크레인 §142+시행규칙§43, 거푸집§332 → `legal_citation_matrix §1/§2`와 **일치**.
- 속성연동(L55): 등급 상 또는 중점등록 O → 시행규칙§43 필수 → `citation_matrix §3` 일치.
- 감전 등급역설 처리(L27, L48 "등급 무관 필수") → `citation_matrix 부록` 일치. **우수**.

### 1.4 데이터 갭/refuse — 지시는 적합, 실효는 미검증 (조건부)
- L59~64(밀폐공간 조문표시+대책생성금지, 화학물질 refuse, 석면 full refuse), L72~76(refuse 조건) → `citation_matrix §4`와 **지시 내용은 일치**.
- **단**: §4 eval 결과(GS-0005 partial, GS-0035 full)에서 refuse가 **0/2 미발동**. 프롬프트에 지시는 있으나 (a) Mock 경로 한계 + (b) 후처리 갭탐지 부재로 실효 미입증. → **R1 (최우선)**.

### 1.5 [도메인 판단 필요] 발견 — 곱16 외 고위험 미세조정 부재
- 프롬프트는 곱16만 human_review 대상으로 본다. 그러나 감전(강도5·빈도1=곱5=하)처럼 **곱은 낮으나 단발성 치명도가 큰 재해**는 등급 하로 자동확정된다. `spec §1` 주석·`citation_matrix 부록 감전 역설`과 정합하나(인용은 필수로 부착됨), **등급 자체는 하**로 남아 UI에서 저위험으로 비칠 수 있음. 데이터 충실(O는 전부 상) 원칙상 보정하지 않으나 운영 시 안전관리자 인지 필요 → R5 병기.

---

## 2. erp_register_flow.md 페이로드 검수 — 적합

`legal_citation_matrix §5(ERP 등록 게이트)` + `risk_matrix_spec §6(human_review 게이트)` 기준 필수 필드 대조.

| 법정/도메인 필수 필드 | 출처 | 페이로드 반영 | 판정 |
|----------------------|------|--------------|:----:|
| `approved_by` / `approved_at` (승인 증빙) | citation §3 중점등록 작업계획 | context.approved_by/at [필수] | 적합 |
| MUST 인용 `citations[]` {law, article, level, source_row} | citation §5 | assessment 외 citations[] 구조 일치 | 적합 |
| 중점등록 O → 시행규칙 §43 | citation §3 | 페이로드 예시에 §142+§43 동시 부착 | 적합 |
| severity/frequency/risk_grade/critical_register | matrix §1/§5 | assessment 전 필드 [필수] | 적합 |
| human_review_resolved + human_review{} 증빙 | matrix §3/§6 | [필수 IF required], 미해소 시 409/ErpFatal 차단 | 적합 |
| boundary_cell_flag | matrix §3 | assessment.boundary_cell_flag | 적합 |

### 2.1 우수점 (도메인 안전 관점)
- **이중 게이트(G1 백엔드 409 + G2 어댑터 ErpFatal)**: 경계셀 미해소가 어떤 우회 경로로도 ERP에 등록되지 않도록 시스템 경계에서 최종 차단. → `matrix_spec §6 컴포넌트 송신(erp: human_review 미확인 시 등록 차단)` **정확 구현**. 도메인 리스크 R1(고위험 과소평가)을 ERP 레벨에서 차단하는 핵심 장치.
- **위변조 방지**(integrity.payload_hash, human_review 증빙 resolved_by/at): 법정 기록의 사후 변조 방지 — 산안법 기록보존 의무 관점 적절.
- `grade==상 ⇔ O` 주석(L84)이 페이로드에 명시 → 감사 추적성 양호.

### 2.2 경미 권고 (비차단)
- `[검증 필요-Q10]` ERP 원자 등록 가정: 다단계(헤더/디테일 분리)면 §5 부분실패 처리로 분기 — 설계상 대비됨. 도메인 영향 없음(전부 성공/전부 롤백 보장 시 법정 레코드 무결성 유지).
- `[도메인 판단 필요]` 곱16 "중 강등" 결정 시 페이로드 critical_register는 X로, citations의 §43 MUST 의무가 해제되는지 명시 부재. → 강등 시 등급 중이 되므로 §43은 권장으로 강등되나, **재해형태 자체 필수조문(예: 타워크레인 §142)은 등급 무관 유지**되어야 함. erp-integration에 R6로 송신.

---

## 3. ux_wireframes / ux_components 검수 — 조건부 적합

### 3.1 등급 색상+텍스트 병기 — 적합
- wireframes L4: "색상은 텍스트 병기(색상만 의존 금지)", 상=빨강/중=주황/하=초록. components §6 a11y "색상 외 등급 텍스트". → 색맹/햇빛 현장 고려 적절(WCAG). **적합**.

### 3.2 "잠정" 표시 명확성 — 적합
- `⚠ 상(잠정)` + `O(잠정)` + "경계 셀(강도4×빈도4) — 안전관리자 판단 필요"(wireframes §3, components §4). 확정 전 라디오 미선택이면 blockSubmit=true 전파(components §4/§7). → "잠정"이 시각·텍스트·동작(게이트) 3중으로 표현됨. **도메인 의도(자동확정 금지) 정확 반영**.

### 3.3 refuse 안내 문구 — 적합
- partial(§7-A 밀폐공간): "평가됨/평가 안 됨" 분리, 갭 위험은 조문 표시만+대책 생성 안 됨 명시, "안전관리자가 KOSHA Guide P-93 기준 별도 작성". → `citation_matrix §4` 정확 반영.
- full(§7-B 석면): "추측에 의한 위험성평가는 제공하지 않습니다" + 조문 표시만 + 수기 평가 안내. → 환각 방지 원칙 + 안전관리자 위임 적절. **도메인적으로 우수** (점검 가능한 다음 행동 제시).

### 3.4 발견 도메인 리스크 (조건부 — 용어 보강 권고)

- **R3 [중] 5×5 매트릭스 강도축 라벨 오해 소지**: wireframes §3 매트릭스에서 `s5(사망)`만 라벨이 있고 s4=중상/s3=경상 등 중간 강도 라벨이 생략됨(s4(중상)은 표기됨, s3·s2·s1 미표기). 작업자가 강도축 의미를 오해할 수 있음. → 각 행에 강도 정의 툴팁/라벨 부착 권고(`spec §1 강도 정의` 전체 노출). components §6 RiskMatrixVisualizer에 gridGradeMap만 있고 강도/빈도 정의 prop 부재.
- **R4 [하] 개선대책 기본 미체크의 의미 안내 부재**: components §3 "controls 체크리스트(기본 미체크)". 도메인상 이는 "작업자가 적용 여부를 능동 선택"하는 의도이나, UI에 "미체크=미적용"의 안전 함의 안내가 없음. 작업자가 체크 누락 시 대책 미적용으로 등록될 위험. → ReviewWorkflow 확정 게이트에 "미체크 대책 N건 — 확인" 경고 권고. (현재 게이트는 위험요인 검토·경계셀만 확인; 대책 체크는 미강제)
- **R3 보강 — "신뢰도" 용어**: ClassificationCard "신뢰도 0.82"는 분류 확신도이지 안전성 신뢰도가 아님. 작업자가 "이 평가를 0.82만큼 신뢰" 로 오독 가능. → "분류 확신도" 등 명확화 권고(components §2 a11y는 "높음/보통/낮음" 텍스트 병기로 일부 완화됨).

> 위 R3·R4는 데모 차단 사유 아님(시각·텍스트 안전장치는 충분). 운영 전 마이크로카피 보강 항목.

---

## 4. e2e_mock_baseline_analysis 도메인 해석 검수 — 적합 (해석 타당)

### 4.1 refuse 미발동(0/2)의 위험도 평가 — 보고서 해석 타당, 단 등급 승격 필요
- 보고서 §3.4/§4.3: refuse_appropriateness 0.94는 "분모 착시", 실제 거절 대상 recall=0/2(GS-0005 밀폐공간, GS-0035 석면). → **도메인적으로 정확한 진단**. 0.94를 합격으로 읽으면 안 된다는 경고는 타당.
- **도메인 위험도 재평가**: 이 0/2는 단순 메트릭 결함이 아니라 **안전 직결 결함 후보**다. 밀폐공간(질식·급성, 6대 사망사고 영역)·석면(법령상 별도 감리 의무)에서 시스템이 정상응답으로 추천을 냈다면, 데이터 갭 영역에 **근거 없는 대책을 제시**한 것이다. 보고서는 이를 "Mock 한계 + 실 LLM 재검증 신호"로 정확히 분류했으나, **도메인 관점에서는 critical-fail 가중(회귀 절대 증가 불가) 대상으로 승격**해야 한다 → 보고서 §6.4가 이미 "E-HALL 절대 증가 불가"로 명시함. **정합**.
- 결론: 보고서 해석 적합. R1로 운영 차단 항목 승격.

### 4.2 경계셀 강제 PASS의 의미 — 적합
- 보고서 §3.2: GS-0008에서 boundary_cell_flag+human_review_required 강제 PASS = "LLM 무관하게 코드가 보장하는 핵심 안전장치 작동 입증". → **도메인적으로 가장 중요한 PASS**. 곱16 자동확정 금지(`spec §3` R1 고위험 과소평가 회피)가 코드 레벨에서 보증됨을 확인. 메커니즘 신뢰 가능.
- grade_alignment_boundary=0.7667은 곱16 상·중 양쪽 부분점수(`spec §3.2/§4.2 eval 처리`) 발동 결과 → 정합.

### 4.3 등급 재계산·불변식 PASS — 적합
- §3.1 코드 재계산, §3.3 citations⊆retrieved 불변식, E-UNDER를 critical-fail로 잡은 것(§4.2) → 전부 도메인 안전장치의 정상 동작. 과소평가(상→중/하)를 critical-fail로 가중(`spec §6 eval 송신`)한 설계와 정합.

> Mock 종속 절대값(classification 0.59·citation 0.32 등)을 품질로 오독하지 말라는 §0·§4 경고는 도메인적으로 타당. PoC 합격을 이 숫자로 판정하지 않는다는 원칙 지지.

---

## 5. domain_postprocess.py 코드 검수 — 적합

코드를 직접 대조한 결과 `safety_risk_matrix_spec.md`와 **전 항목 일치**.

| 검수 항목 | 코드 위치 | SSOT 기준 | 판정 |
|-----------|----------|-----------|:----:|
| 임계곱 하≤9 | `recompute_grade` L21~28: product<10 → LOW | spec §2.1 하≤9 | 적합 |
| 임계곱 중10~15 | product≥10 and <16 → MEDIUM | spec §2.1 중10~15 | 적합 |
| 임계곱 상≥16 | product≥16 → HIGH | spec §2.1 상≥16 | 적합 |
| 곱16 경계셀 강제 | `is_boundary_cell` L31~33 (sev==4 and freq==4) → `grade=HIGH`(L76) | spec §3.2 기본 상 | 적합 |
| 곱16 human_review | L130 `human_review_required=any_boundary or ...` | spec §3.2 human_review_required=true | 적합 |
| O ⇔ 상 1:1 | G8 L117~125: any_boundary→O_TENTATIVE, any_high→O, else X | spec §5.2 | 적합 |
| 강도/빈도 정수 1~5 클램프 | L72~73 max(1,min(5,...)) | spec §1 정수 1~5 사상 | 적합 |
| 코드 권위(LLM 등급 무시) | docstring + L76 재계산 | spec "LLM 등급 신뢰 안 함" | 적합 |
| 중점등록 사유 기재 | reasons L118~125 | spec §5.5 감사추적성 | 적합 |

### 5.1 enum 정합 확인 (models.py 대조)
- `RiskGrade`: HIGH="상"/MEDIUM="중"/LOW="하" ✓
- `CriticalRegister`: O="O"/X="X"/O_TENTATIVE="O (잠정)" ✓ — 곱16이 O_TENTATIVE로 매핑되어 `spec §5.2 곱16→"O (잠정)"` 정확 구현.

### 5.2 우수점
- **곱16을 `recompute_grade`보다 우선 처리**(L76 `RiskGrade.HIGH if boundary else recompute_grade(...)`): 곱16이 §2.1 일반 규칙(≥16→상)과 동일 결과지만, 별도 분기로 boundary 플래그를 함께 set → 일반 곱20·25 상과 곱16 상을 코드가 구분. 도메인상 정확(곱16만 human_review).
- **G6 인용 누락 시 needs_regen**(L90~93): hazard에 유효 인용 0건이면 재생성 → `citation_matrix §0 MUST recall` 정신 반영(인용 없는 항목 출력 금지).

### 5.3 경미 관찰 (비차단, R6 연관)
- `legal_critical_candidate`(L131)는 LLM 플래그를 그대로 신뢰(코드 재판정 안 함). `spec §5.4`는 PoC 1차에서 정보 플래그만 부착(자동 O 승급 안 함)이라 했으므로 **정합**. 단 곱16 "중 강등" 확정 시 재해형태 필수조문(§142 등) 유지 로직은 코드 범위 밖(어댑터/ERP 게이트 책임) → R6.
- `accident_type` 기본값 "기타"(L105): 데이터에 없는 재해형태를 "기타"로 흡수 — 환각 방지엔 안전하나, "기타"가 많아지면 분류 품질 저하 신호. eval 모니터 권고(비차단).

---

## 6. 발견 도메인 리스크 — 우선순위

| ID | 리스크 | 심각도 | 영향 | 권고 | 담당 |
|----|--------|:------:|------|------|------|
| **R1** | refuse 가드레일(밀폐공간·석면) 실효 미입증(0/2) | **높음(안전 직결)** | 데이터 갭 영역에 근거 없는 대책 제시 위험 | 실 LLM baseline에서 refuse 재검증 + 후처리 갭탐지(키워드/분류 기반 강제 refuse) 추가. 미입증 영역은 데모 시나리오 제외 | rag-architect · eval-engineer |
| **R2** | 실 LLM 품질 미검증 (Mock baseline만 존재) | 높음 | classification/citation/grade 실품질 불명 | ANTHROPIC_API_KEY로 실 LLM baseline 실행(보고서 §5) 후 임계 재판정. 그 전까지 "추천 신뢰성 검증기간" 명시 | eval-engineer |
| **R3** | 5×5 강도축 라벨·"신뢰도" 용어 오해 소지 | 중 | 작업자 강도 의미·확신도 오독 | 강도 전 라벨 노출 + "분류 확신도" 용어 명확화 | frontend-engineer |
| **R4** | 미체크 개선대책의 안전 함의 안내 부재 | 중 | 대책 미적용 등록 위험 | 확정 게이트에 "미체크 대책 N건" 경고 | frontend-engineer |
| **R5** | 곱은 낮으나 치명도 큰 재해(감전 등) 등급 하 자동확정 | 중 | UI상 저위험으로 비침 | 인용은 필수 부착(현행 OK). 운영 시 안전관리자 인지 유도 배지 검토 | safety · frontend |
| **R6** | 곱16 "중 강등" 시 재해형태 필수조문 유지 로직 명시 부재 | 낮 | 강등 시 §142 등 누락 가능 | 강등돼도 재해형태 MUST 조문은 등급 무관 유지 명시 | erp-integration · backend |

---

## 7. PoC → 운영 전환 시 도메인 필수 보완 (게이트)

운영(실작업 등록) 전환 전 **반드시 충족**해야 하는 도메인 관점 항목:

1. **실 LLM 검증 baseline (R2)** — Mock이 아닌 실 Claude로 classification/grade/citation/faithfulness 절대값 측정. 임계(분류≥0.85, citation precision≥0.90/recall≥0.70, 의무영역 legal recall≥0.95, faithfulness≥4.0) 충족 확인. 미달 시 프롬프트·검색(dense/rerank) 튜닝 후 재측정.
2. **refuse 보강 (R1)** — 밀폐공간·석면·화학물질·작업환경측정 갭 영역에서 refuse가 실제 발동함을 입증. 시스템 프롬프트 지시만으로 부족 시 **후처리 강제 refuse**(갭 키워드/분류 매칭 시 result_type 강제) 추가. 거절 대상 recall ≥ 0.95.
3. **전문가 검증 기간** — 실 운영 전, 안전관리자가 실작업 입력 N건(권장 ≥200건)에 대해 AI 추천 vs 수기 평가 대조. 오답 패턴(과소평가·인용 오류·분류 오류) 카테고리화 후 gold set·few-shot 보강. 사용자 수정/거절 항상 가능(제약사항 준수).
4. **법령 최신성 게이트** — 안전보건규칙 조문번호는 개정 변동(citation_matrix 부록). 운영 전 현행 조문 재확인 + 중대재해처벌법 시행령 추가개정 영역은 정보성 표시만(평가 제외 유지).
5. **2차 법령 보강 룰 (citation §5.4)** — 법정 중점관리 대상 작업(시행규칙 §43: 타워크레인 설치/해체·굴착·고소)이 등급 중/하로 나올 때 legal_critical_candidate → 안전관리자 검토 강제. 추가 법령 데이터 확보 후 자동 O 승급 룰 검토.
6. **경계셀 35행 학습 신호 검증 (spec §4)** — few-shot에 곱16 중 강등 예시 포함 여부 및 실 LLM이 곱16을 맥락 의존으로 처리하는지 실 baseline에서 확인.
7. **R6 — 강등 시 재해형태 MUST 조문 유지** — 곱16 중 강등 확정돼도 재해형태 필수조문(§142·§338 등)은 등급 무관 유지되도록 ERP 게이트 보강.

---

## 8. 종합 판정

### PoC 데모: **가능 (조건부)**

**근거**:
- **메커니즘 안전장치 전부 정합·작동**: 등급 임계곱(하≤9/중10~15/상≥16)·곱16 경계셀 3중 강제·O⇔상 1:1·citations⊆retrieved 불변식·법정 인용 의무·ERP human_review 이중 게이트 — 코드/페이로드/프롬프트/UI 4개 레이어가 SSOT(`risk_matrix_spec`·`legal_citation_matrix`)와 일관 구현됨. 이것이 본 PoC의 핵심 안전 가치이며 데모 가능 수준.
- **사람 최종판단 원칙 준수**: 모든 AI 출력 수정/거절 가능, 경계셀 자동확정 금지, refuse 분리 응답 — 도메인 원칙(추측 금지·점검 가능한 행동) 반영.

**데모 시 제약 (반드시 고지)**:
- 데모는 **Mock 기반**이므로 classification/citation/grade 절대값은 품질 신호가 아님(보고서 §0). "메커니즘 시연"으로 한정 설명.
- **refuse 미입증(R1)** 영역(밀폐공간·석면)은 데모 시나리오에서 **제외**하거나, "이 영역은 운영 전 보강 대상"으로 명시. 데모 중 갭 영역 입력으로 근거 없는 대책이 나오면 도메인 신뢰 훼손.
- 실 LLM 검증(R2) 전까지 "AI 추천 신뢰성 검증·튜닝 기간 필요"(CLAUDE.md 제약사항) 명확히 전달.

**충돌 병기(삭제 금지)**: 곱16 경계셀 35행 "데이터=중 vs 순수곱=상" 불일치는 `spec §4`대로 보정하지 않고 양쪽 명시 + 경계셀 플래그 유지 — 본 검수에서도 정당한 불일치로 확인(오류 아님). 코드(`domain_postprocess` L76 기본 상)와 데이터(35행 중)의 차이는 human_review로 위임되어 정합.

---

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 최초 작성. 5개 산출물 도메인 검수 + 리스크 6건 + 운영전환 보완 7건 + 종합판정(데모 가능·조건부) | Phase 6 Integration |
