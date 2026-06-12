# Safety Evaluation Rubric — JHA LLM 산출물 평가 루브릭 (Foundation)

> 작성: safety-domain-expert · Phase 2 (Foundation) · eval-engineer와 양방향 합의 대상
> 근거: `jha-domain-knowledge` SKILL 루브릭 + `safety_risk_matrix_spec.md` + `safety_scope.md` 리스크 R1~R8
> 목적: LLM 산출물(작업명 → 분류·위험요인·등급·중점등록·개선대책·인용)의 **정량 채점 기준 SSOT**. eval-engineer가 `jha-eval-design`으로 흡수.

---

## 1. 평가 대상 (LLM 출력 필드)

1. `classification` = {major_type, sub_type, detail_item}
2. `hazards` = [{accident_type, ...}] (재해형태 목록)
3. `grade` = {severity, frequency, grade, boundary_cell_flag}
4. `critical_register` = O/X
5. `controls` = 개선대책 (verifiable action 단위)
6. `citations` = 법적 인용 + source_rows
7. `refuse` = 거절 여부·사유

---

## 2. 메트릭별 정의·척도·PoC 임계치

### 2.1 Classification Accuracy (분류 정확도)
- **정의**: 3계층(대공종/중공종/세부항목) 매칭. 계층별 가중.
- **척도(계층 가중)**: 대공종 0.5 + 중공종 0.3 + 세부항목 0.2 = 1.0. 각 계층 정확=가중치, 오답=0.
  - acceptable_variants의 동의어/표기차는 정답 처리(예: T/C·T형·Tower Crane → 타워크레인(T형) 동일).
  - '재해 사례'로 오분류 시 **대공종 점수 0 + critical 감점**(R6).
- **PoC 임계치**: 평균 ≥ **0.85** (SKILL 일치). 대공종만 따로 ≥ 0.90.

### 2.2 Hazard Coverage (위험요인 포함률)
- **정의**: gold set `must_include:true` 재해형태의 recall.
- **척도**: recall = (예측한 must_include 재해형태 수) / (전체 must_include 수). `must_include:false`는 누락 무영향, 포함 시 가산점(상한 1.0 유지).
  - 동의어 정규화 후 매칭(낙상→추락 등). 비정규 표기는 정규화 후 채점.
- **PoC 임계치**: ≥ **0.80** (SKILL 일치). 추락·낙하·전도·협착 4종은 ≥ 0.85(scope 집중 영역).

### 2.3 Risk Grade Alignment (위험등급 정합)
- **정의**: 예측 등급 vs gold 등급 일치율. + 강도·빈도 정합.
- **척도**:
  - 등급 정확 일치 = 1.0 / 인접 등급(상↔중 또는 중↔하) = 0.5 / 2단계 차(상↔하) = 0.
  - **방향 가중(critical-fail)**: gold='상'인데 예측 '중/하'(과소평가, R1) → 해당 항목 **0점 + critical-fail 카운트**(단순 0.5 아님). 반대로 gold='하'인데 '상'(과대평가)은 0.5(안전측 오류, 경미).
  - 강도·빈도 보조 점수: 각 ±1 이내 허용(부분).
- **PoC 임계치**: 등급 일치율 ≥ **0.75** (SKILL 일치). **상→중/하 과소평가 critical-fail = 0건 목표**(허용 상한 5%).

### 2.4 Citation Precision / Recall (법적 인용)
- **Precision 정의**: LLM이 인용한 source_row가 실제 근거를 포함하는 비율 + 법조문이 해당 작업에 실제 적용되는 비율.
  - 척도: 정확 인용/전체 인용. 허위·무관 인용은 차감.
  - **PoC 임계치**: ≥ **0.90**.
- **Recall 정의**: `legal_citation_matrix`상 **인용 의무** 영역에서 누락 없이 인용한 비율.
  - 척도: (인용한 의무 항목)/(필수 의무 항목). gold set `legal_refs_required` 기준.
  - **의무 영역 누락 = citation-fail**(추락≥2m·감전·굴착 미인용은 R4 법적 리스크).
  - **PoC 임계치**: ≥ **0.70** (SKILL 일치). 단 **의무 영역(추락·감전·굴착·중점등록) recall은 ≥ 0.95** 별도 강화.

### 2.5 Faithfulness (충실성 — 환각 방지)
- **정의**: 출력의 모든 위험요인·개선대책이 검색된 source_row에 근거하는가(데이터 없는 위험 추측 금지, R3).
- **척도**: LLM-as-judge 1~5. 5=전부 근거 / 3=일부 근거 외 일반론 / 1=환각 다수. 검색 결과에 없는 밀폐공간·화학물질 대책을 생성하면 ≤2.
- **PoC 임계치**: 평균 ≥ **4.0** (SKILL 일치).

### 2.6 Refuse Appropriateness (거절 적정성)
- **정의**: refuse 발동이 정책(SKILL Refuse 정책)과 정합하는가.
- **척도**: (정답 refuse + 정답 응답) / 전체. False refuse(답해야 하는데 거절)와 Missed refuse(거절해야 하는데 환각 응답) 양방향 집계.
  - Missed refuse(갭 영역 환각)는 **critical**(가중 ↑). False refuse는 경미.
- **PoC 임계치**: ≥ **0.90** (SKILL 일치). Missed refuse(밀폐공간·화학물질 환각) = 0건 목표.

### 2.7 Control Verifiability (개선대책 실행가능성) — 추가 도메인 메트릭
- **정의**: 개선대책이 **점검 가능한 행동 단위(verifiable action)**인가(R7). "안전모 착용" ❌ → "안전모(턱끈) 착용 후 작업반장 출입구 점검" ✅.
- **척도**: LLM-as-judge 0~1. 행위주체·행위·점검가능성 3요소 충족도. data의 개선대책 원문을 paraphrase한 경우 원문이 verifiable이면 정답.
- **PoC 임계치**: ≥ **0.70**.

---

## 3. 메트릭 요약표

| 메트릭 | 척도 | PoC 임계치 | critical-fail 조건 |
|--------|------|:---------:|-------------------|
| Classification accuracy | 0~1 (계층가중 0.5/0.3/0.2) | ≥ 0.85 | '재해 사례' 오분류 |
| Hazard coverage | recall (must_include) | ≥ 0.80 (핵심4종 0.85) | — |
| Risk grade alignment | 일치 1 / 인접 0.5 / 2단계 0 | ≥ 0.75 | 상→중/하 과소평가 |
| Citation precision | 정확/전체 | ≥ 0.90 | 허위 인용 |
| Citation recall | 의무 충족/필수 | ≥ 0.70 (의무영역 0.95) | 추락·감전·굴착·중점 누락 |
| Faithfulness | LLM-judge 1~5 | ≥ 4.0 | 갭영역 환각 |
| Refuse appropriateness | 정합/전체 | ≥ 0.90 | Missed refuse |
| Control verifiability | 0~1 | ≥ 0.70 | — |

> **종합 게이트**: 전 메트릭 임계치 충족 + critical-fail 0건이어야 "PoC 합격 후보". critical-fail(과소평가·의무인용 누락·갭환각) 1건이라도 발생 시 해당 케이스는 재생성 트리거(rag-architect 가드레일 연동).

---

## 4. 경계셀(곱16, 강도4×빈도4) 부분점수 규칙 — 명시

`safety_risk_matrix_spec §3` 연동. 곱16 케이스는 등급이 데이터상 상·중 혼재(비결정 셀)이므로 특별 채점.

### 4.1 채점 규칙
| LLM 출력 | gold='상'(O) | gold='중'(X) | 부분점수 |
|----------|:-----------:|:-----------:|---------|
| grade='상' + boundary_flag=true + human_review=true | 1.0 | **0.7** | 경계셀 인지 시 양쪽 부분인정 |
| grade='상' + flag 없음(자동확정) | 0.7 | 0.3 | **자동확정 감점**(R2) |
| grade='중' + boundary_flag=true | 0.7 | 1.0 | 보수성 낮으나 경계 인지 |
| grade='중' + flag 없음 | **0.3** | 0.5 | gold 상인데 중 자동확정 = 과소평가 근접 |
| grade='하' | 0 | 0 | 곱16에서 '하'는 명백 오답 |

### 4.2 핵심 원칙
1. **곱16에서 상·중은 둘 다 부분정답**(양방향 0.7 이상 가능) — 단 **경계셀 플래그(boundary_cell_flag) + human_review_required를 부착했을 때만** 만점/고부분점.
2. **플래그 없이 자동확정하면 감점** — 정답을 맞혀도 "자동 확정 금지" 위반(R2)이므로 상한 0.7.
3. **곱16에서 '하' 출력은 0점**(명백 오답).
4. **상→중/하 과소평가 critical-fail은 곱16에서는 면제** — 경계셀은 정당한 중 강등이 존재하므로 critical-fail로 카운트하지 않음(일반 셀과 구분).

> eval-engineer: 곱16 케이스를 별도 서브셋으로 분리 집계. 전체 grade alignment 평균에서 곱16은 위 부분점수표로 계산하여 일반 셀의 엄격 채점과 섞이지 않게 한다.

---

## 5. 에러 분석 카테고리 (eval-engineer 송신 — 반복오답 추적)

| 코드 | 카테고리 | 연결 리스크 | 대응 |
|------|----------|:----------:|------|
| E-UNDER | 등급 과소평가(상→중/하) | R1 | critical. 곱·재해형태 신호 재학습 |
| E-BNDRY | 경계셀 자동확정 | R2 | 플래그 강제 프롬프트 |
| E-HALL | 갭영역 환각(밀폐·화학) | R3 | refuse 가드레일 강화 |
| E-CITE | 의무 인용 누락 | R4 | citation matrix 강제 |
| E-ELEC | 감전 과대평가 | R5 | 행수→등급 추정 금지 |
| E-MISCL | 분류 오류('재해사례' 등) | R6 | 후보 배제 필터 |
| E-VERIF | 비실행 대책 | R7 | verifiable action 템플릿 |
| E-SYNON | 동의어 비정규화 | R8 | 정규화 사전 적용 |

> 반복 오답 패턴(동일 코드 누적) 발견 시 rag-architect와 프롬프트·few-shot·청킹 공동 조정.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 최초 작성. 8메트릭 + 곱16 부분점수표 + 에러 카테고리 | Phase 2 Foundation |
