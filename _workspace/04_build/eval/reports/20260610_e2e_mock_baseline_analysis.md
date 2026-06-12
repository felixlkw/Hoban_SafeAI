# E2E Mock Baseline — 분석 보고서

- variant: `e2e_mock_baseline`
- dataset: `dataset/gold_v1.jsonl` (35건, hash `9f29ce50ea14`, = `02_foundation/safety_gold_set.jsonl` 스냅샷)
- synonym_map_hash: `aa9774115120` · seed: 42 · judge: 미사용(ANTHROPIC_API_KEY 미설정)
- backend: FastAPI `app.main` @ :8400, `JHA_AUTH_ENABLED=false` `JHA_FORCE_MOCK=true`
- BM25 인덱스 실로드: 4,469 chunks (tokenizer=kiwipiepy)
- 실행: `python runner.py --variant e2e_mock_baseline --dataset dataset/gold_v1.jsonl --api-endpoint http://localhost:8400 --no-judge`
- 머신 출력: `20260610_e2e_mock_baseline.md` / `.json` (러너 자동생성, 본 문서와 함께 보존)
- timestamp: 2026-06-10T06:58:00Z

---

## 0. 가장 중요한 해석 기준 — 이 숫자는 LLM 품질이 아니다

본 baseline은 **MockClaudeClient**로 생성되었다(anthropic SDK 미설치 → 자동 Mock). Mock은
BM25 상위 청크의 메타데이터(severity/frequency/accident_type/chunk_id)로 **결정적 JSON**을
조립할 뿐, 실 LLM 추론을 하지 않는다. 따라서:

> **분류 정확도·hazard coverage·citation·grade의 절대값은 LLM 추천 품질의 척도가 아니다.**
> 이들은 "검색 → 후처리 → 가드레일 → 상태머신" **파이프라인 메커니즘이 정상 동작하는지**의
> 척도다. 절대 점수로 PoC 합격/불합격을 판정하면 안 된다(실 LLM baseline 필요, §5).

메트릭은 두 부류로 분리해 읽어야 한다.

| 부류 | 메트릭 | Mock에서 유효? |
|------|--------|----------------|
| **Mock-무관 유효(메커니즘 검증)** | 상태머신 완주·409 게이트, 등급 코드 재계산, 경계셀 강제 플래그, citations⊆retrieved 불변식, source_rows 정수형, refuse **발동 메커니즘**, skip=0(타임아웃 0) | **예** — 아래 §3 |
| **Mock-종속(LLM 품질 대리, 신뢰 불가)** | classification_accuracy, hazard_coverage 절대값, citation precision/recall 절대값, grade_alignment 절대값, legal_recall | **아니오** — §4 |

---

## 1. 메트릭 표 (전체)

| 메트릭 | 값 | PoC 임계 | 판정 | 부류 |
|--------|----|---------|------|------|
| classification_accuracy | 0.5941 | ≥0.85 | FAIL | Mock-종속 |
| classification_major_rate | 0.7647 | ≥0.90 | FAIL | Mock-종속 |
| hazard_coverage | 0.8676 | ≥0.80 | PASS* | Mock-종속 |
| hazard_core_recall | 0.8696 | ≥0.85 | PASS* | Mock-종속 |
| grade_alignment_general | 0.7419 | ≥0.75 | FAIL | Mock-종속 |
| grade_alignment_boundary | 0.7667 | — | — | 혼합 |
| grade_alignment_overall | 0.7441 | — | — | Mock-종속 |
| citation_precision | 0.3235 | ≥0.90 | FAIL | Mock-종속 |
| citation_recall | 0.5931 | ≥0.70 | FAIL | Mock-종속 |
| legal_recall | 0.1263 | — | — | Mock-종속 |
| refuse_appropriateness | 0.9429 | ≥0.90 | PASS** | 혼합(아래 주의) |
| faithfulness | — | ≥4.0 | SKIP | judge 미실행 |
| control_verifiability | — | ≥0.70 | SKIP | judge 미실행 |

\* PASS여도 Mock 우연 일치(BM25 상위에 정답 재해형태가 자주 섞임)일 뿐, 품질 신호 아님.
\*\* **착시 주의** — §3.4 참조. 전체 0.94는 정상 33건이 trivially 통과한 결과이고,
**실제 refuse 케이스 2건은 둘 다 실패(0/2)**다.

critical-fail 17건 breakdown: `E-CITE ×13, E-UNDER ×2, E-HALL ×2`

---

## 2. 파이프라인 건전성 (E2E round-trip)

- **35/35 케이스 완주, skip=0.** createSession(201) → classify(200) → assess(200) 전 구간
  연결·타임아웃·5xx 0건. 세션 상태머신·인메모리 store·BM25 검색이 35회 연속 안정.
- **어댑터(`_adapt_contract_response`) 정합 확인.** 실 계약 응답(ClassificationResult +
  AssessmentResult)을 단건 수동 round-trip(GS-0001)으로 대조 → 필드 매핑 일치.
  **어댑터/백엔드 수정 0건** (계약 위반 미발견).
  - `hazards[].accident_type/severity/frequency/risk_grade/boundary_cell` ✓
  - top-level `source_rows`(int) ✓, `human_review_flags.{boundary_cell,human_review_required}` ✓
  - `legal_refs`(top + per-hazard 합집합 fallback) ✓, `hazards[].citations`(chunk_id) → retrieved_chunks ✓

---

## 3. Mock-무관 유효 메트릭 (메커니즘 — 이것이 본 baseline의 핵심 산출)

### 3.1 등급 코드 재계산 정합 — PASS
백엔드는 LLM이 주장한 등급을 신뢰하지 않고 severity×frequency로 **코드 재계산**한다
(`domain_postprocess`). 어댑터는 케이스 대표 등급을 hazard 중 최고 위험으로 산출 →
경계셀 케이스 GS-0008에서 `grade=상`, score=1.0. 재계산 로직 정상 동작 확인.

### 3.2 곱16 경계셀 3중 강제 — PASS (대표 검증 GS-0008)
강도4×빈도4 경계셀에서 `boundary_cell_flag=True` + `human_review_required=True` 강제됨.
runner의 경계셀 부분점수표가 발동(`grade_alignment_boundary=0.7667`). **경계셀 플래그
강제는 LLM 무관하게 코드가 보장** — 본 PoC의 핵심 안전장치가 작동함을 입증.

### 3.3 citations ⊆ retrieved 불변식 — PASS
인용된 source_row가 검색되지 않은 행에서 임의 생성되지 않음(백엔드 후처리가 강제,
pytest 35건에 포함). 어댑터의 `_extract_source_rows`는 전부 정수로 파싱됨(파싱 실패 0).
*precision 절대값이 낮은 것은 불변식 위반이 아니라 "Mock 검색결과 ≠ gold 정답행"일 뿐.*

### 3.4 refuse 발동 **메커니즘** — 부분 PASS / 신호 발견
- 정상 33건: 전부 `normal_answered`(false-refuse 0건) → 정상 입력에 과잉거절 안 함 ✓
- **refuse 2건(GS-0005 partial, GS-0035 full): 둘 다 발동 실패(E-HALL ×2).**
  backend `result_type=ok`로 응답 → 데이터 갭/밀폐공간/석면 트리거에서 `refused_partial/full`
  미생성. **Mock은 LLM 갭탐지를 못 하므로 일부는 Mock 한계지만, 데이터-갭 가드레일이
  Mock 경로에서 비활성인 것은 실 LLM에서도 재확인이 필요한 신호다**(§4.3, 권고).
- 결론: refuse_appropriateness=0.94는 **분모 착시**. 거절 대상만 본 refuse recall = **0/2**.

### 3.5 상태머신·409 게이트 — 본 baseline 범위 외(백엔드 pytest로 커버)
러너는 create→classify→assess만 구동(평가에 finalize/review 불필요). 409 G1 게이트·
역할 403은 backend pytest(test_session_state_machine, test_api_flow)에서 검증됨. 본 E2E는
해당 경로를 호출하지 않으므로 "미회귀"로만 표기(별도 측정 아님).

---

## 4. 에러 분석 (카테고리별)

### 4.1 E-CITE ×13 (지배적) — Mock 검색 vs gold 정답행 불일치
- 원인: Mock은 BM25 top-k 행을 그대로 source_rows로 반환. gold의 `expected_source_rows`는
  도메인 전문가가 손으로 고른 정답행 → 교집합 작음.
  - GS-0001: gold `[32,44]` vs pred `[37,43,44]` → recall 0.5, precision 0.33
  - GS-0002: gold `[1874,1888,1788]` vs pred `[2126,2151,2675]` → 교집합 0 (precision/recall 0)
- legal_recall 0.13: **Mock은 모든 hazard에 고정 stub `산업안전보건기준에 관한 규칙 §43`만
  부착** → §338/§339/§619/KOSHA 등 케이스별 법조문 전무. 순수 Mock 아티팩트.
- **판정: 인용 파이프라인 결함 아님.** 검색 적합성(실 dense/rerank)과 LLM의 근거선택
  품질이 결정. 실 LLM baseline에서 재측정해야 의미 있음.

### 4.2 E-UNDER ×2 (GS-0001, GS-0002) — Mock 등급값 과소
- Mock이 청크 메타의 severity×frequency로 만든 대표 등급이 중/하 → gold 상 대비 과소평가.
- **단, 과소평가를 critical-fail로 "잡아낸 것"은 러너 가드의 정상 동작.** 등급 재계산
  메커니즘(§3.1)은 정상이나 Mock 입력값이 낮아 산출 등급이 낮은 것.

### 4.3 E-HALL ×2 (GS-0005, GS-0035) — refuse 미발동
- GS-0005(밀폐공간/질식 데이터 갭, 기대 partial): backend가 정상응답 → 갭경고 없이 답함.
- GS-0035(석면, 기대 full refuse): backend가 정상응답.
- **가장 actionable한 신호.** rag-architect/safety-domain-expert에 피드백:
  데이터-갭·화이트리스트 밖 위험(밀폐공간·석면) 입력에 대한 `refused_partial/full` 트리거가
  Mock 경로에서 발화하지 않음 → 실 LLM 시스템 프롬프트의 refuse 지시 + 후처리 갭탐지를
  실 baseline에서 반드시 재검증.

### 4.4 classification_accuracy 0.59 / major_rate 0.76 — Mock 분류 한계
- Mock은 BM25 최상위 청크의 분류 라벨을 echo. 대공종 일치율 76%는 BM25 검색만으로의
  상한선 근사이며, LLM의 의도추출·재랭킹이 빠진 값. 실 LLM에서 상향 기대.

---

## 5. 실 LLM baseline 실행 절차 (ANTHROPIC_API_KEY 설정 시)

```bash
# 1) anthropic SDK 설치 (현재 미설치 → Mock 강제됨)
pip install anthropic
# 2) 키 설정 + Mock 해제하고 백엔드 기동
export ANTHROPIC_API_KEY=sk-ant-...
unset JHA_FORCE_MOCK            # (또는 JHA_FORCE_MOCK=false)
export JHA_AUTH_ENABLED=false   # 평가는 worker 경로만 → 인증 우회
cd _workspace/04_build/backend
uvicorn app.main:app --port 8400
# 3) 러너 = LLM-judge 동반 실행(faithfulness/control_verifiability 채점 활성)
cd ../eval
export ANTHROPIC_API_KEY=sk-ant-...   # judge(claude-opus-4-7)용
python runner.py --variant e2e_llm_baseline \
  --dataset dataset/gold_v1.jsonl --api-endpoint http://localhost:8400
```
- 실 LLM에서는 classification/grade/citation 절대값이 비로소 **품질 신호**가 된다.
  본 Mock baseline은 그때의 **회귀 하한 sanity check**(메커니즘 미파손 확인)로 재사용.
- judge 키 설정 시 faithfulness(≥4.0)·control_verifiability(≥0.70)가 채점됨.

---

## 6. 다음 실험 권고 (회귀 비교 방법)

모든 변형은 **동일 dataset hash(`9f29ce50ea14`)**·동일 endpoint로 baseline 대비 측정.
`regression_gates.yaml`이 자동 적용된다(`--baseline <baseline>.json`).

1. **프롬프트 v2** (분류 의도추출·refuse 지시 강화):
   `--variant prompt_v2 --baseline reports/20260610_e2e_llm_baseline.json`
   → classification_accuracy·refuse(거절 대상 recall) Δ 확인. **단 실 LLM baseline 대비로만**
   비교(Mock baseline 대비는 무의미 — 부류가 다름).
2. **dense 검색 활성**(BM25→하이브리드): citation_precision/recall·hazard_coverage Δ 추적.
   E-CITE 13건이 가장 민감한 타깃 → 회귀 게이트에서 citation_recall min_delta 모니터.
3. **rerank 도입**: classification_major_rate·citation_precision Δ. 비용/지연(p95) 동반 기록.
4. 회귀 차단 규칙(하드): `critical_fail_count` 증가 시 BLOCKED(exit 1). E-UNDER(과소평가)·
   E-HALL(refuse 누락)은 안전 직결 → 절대 증가 불가.
5. **부류 분리 원칙**: Mock baseline과 LLM baseline의 절대값을 직접 비교하지 말 것.
   Mock은 메커니즘 회귀(상태머신·경계셀·불변식)의 sanity 하한으로만, 품질 회귀는 LLM
   baseline 간(prompt_v1 vs v2 등)으로만 비교한다.

---

## 7. 발견 이슈 요약 (→ 담당 피드백)

| # | 이슈 | 영향 | 담당 | 비고 |
|---|------|------|------|------|
| 1 | refuse 가드레일이 Mock 경로에서 미발동 (GS-0005/0035, 0/2) | refuse recall 0 | rag-architect · safety-domain-expert | 실 LLM baseline 우선 재검증 |
| 2 | Mock legal_refs 고정 stub(§43) → legal_recall 0.13 | 인용 절대값 무의미 | (Mock 한계) | 실 LLM 필요 |
| 3 | citation/grade/classification 절대값 LLM 품질 아님 | 임계 FAIL은 거짓신호 | eval(본 문서 명시) | 합격판정 보류 |
| 4 | refuse_appropriateness 0.94 분모 착시 | 지표 오독 위험 | eval | 거절대상 분리 리포팅 도입 권고 |
| 5 | 경계셀 강제·등급 재계산·citations⊆retrieved·skip0 = PASS | 메커니즘 건전 | — | 회귀 하한으로 보존 |
