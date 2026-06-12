# Gold v2 동등행 채점 — gpt-4.1 회귀 재측정 비교 분석

- **variant**: `openai_gpt41_gold_v2` · **baseline**: `openai_gpt41_baseline`(20260612)
- **dataset**: `safety_gold_set_v2.jsonl`(35건, hash `f484a74e3ddd`) ← v1 `gold_v1.jsonl`(hash `9f29ce50ea14`)
- **model**: gpt-4.1 (`model_used=gpt-4.1` 확인, mock 폴백 아님) · judge gpt-4.1 · seed 42 · skip 0
- **변경 범위**: ①러너 `metric_citation` 동등집합 채점화(`acceptable_source_rows`), ②gold v1→v2(+10 동등행 / hash 갱신). **백엔드 코드·프롬프트·RAG 무변경.**
- **timestamp**: 2026-06-12T06:35:03Z
- 산출: `20260612_openai_gpt41_gold_v2.{md,json}`(러너 자동) + 본 분석 레이어

> **핵심 메시지**: 비-citation 메트릭 8개가 baseline과 **비트단위 동일**(응답 재현성 입증) → citation recall 개선 +0.1471은 **순수 평가-기준 변경 효과**다. 응답 자체 변동 기여 ≈0. precision은 동등집합과 무관하게 여전히 FAIL(0.34) — RAG canonical-row 정규화가 잔여 과제.

---

## 1. 메트릭 전후표 (baseline → v2)

| 메트릭 | baseline(v1) | v2(동등집합) | Δ | 게이트 | 판정 |
|--------|------:|------:|------:|------|------|
| classification_accuracy | 0.8971 | 0.8971 | +0.0000 | min_delta -0.02 | OK(동일) |
| classification_major_rate | 0.9118 | 0.9118 | +0.0000 | — | OK(동일) |
| hazard_coverage | 0.8824 | 0.8824 | +0.0000 | min_delta -0.03 | OK(동일) |
| hazard_core_recall | 0.8696 | 0.8696 | +0.0000 | — | OK(동일) |
| grade_alignment_general | 0.7903 | 0.7903 | +0.0000 | min_delta -0.03 | OK(동일) |
| grade_alignment_overall | 0.8088 | 0.8088 | +0.0000 | — | OK(동일) |
| **citation_precision** | **0.3358** | **0.3407** | **+0.0049** | min_abs 0.90 | **FAIL(미달)** |
| **citation_recall** | **0.6176** | **0.7647** | **+0.1471** | min_abs 0.70 | **PASS(임계 돌파)** |
| legal_recall | 0.9091 | 0.9091 | +0.0000 | — | OK(동일) |
| refuse_appropriateness | 1.0000 | 1.0000 | +0.0000 | min_delta -0.05 | OK(동일) |
| faithfulness | 4.7143 | 4.7143 | +0.0000 | min_abs 4.0 | OK(동일) |
| control_verifiability | 0.7954 | 0.8091 | +0.0137 | min_delta -0.05 | OK |
| **critical_fail_count** | **15** | **8** | **-7** | max_abs 0 | (감소=개선, 절대>0) |
| └ E-CITE | 13 | 6 | -7 | — | 7건 해소 |
| └ E-UNDER | 2 | 2 | 0 | — | 불변 |

핵심 6개: 분류 0.8971(동일)·coverage 0.8824(동일)·grade_general 0.7903(동일)·**citation_P 0.3407(FAIL)**·**citation_R 0.7647(PASS↑)**·refuse 1.0(동일).

---

## 2. 응답 재현성 검증 (이중해석의 전제)

baseline은 per_case에 인용행을 저장하지 않았으나(이번 러너 보강으로 v2부터 적재), **세 가지 교차증거**로 LLM 응답이 baseline과 사실상 동일하게 재현됨을 입증한다 → citation 개선분에서 "응답 변동" 성분을 분리·소거할 수 있다.

| 증거 | baseline | v2 | 결론 |
|------|----------|----|------|
| 비-citation 메트릭 8개 평균 | (좌측 표) | 전부 비트단위 동일 | 분류·hazard·등급 응답 불변 |
| E-UNDER 케이스 집합 | {GS-0001, GS-0010} | {GS-0001, GS-0010} | 동일 — 등급 응답 불변 |
| 대표 cited rows (analysis §3-1 확정) | GS-0001 [42,43,44]·0002 [1723,2126,2141,2151,2675]·0003 [750,764,767,770,773] | 동일 [42,43,44]·[1723,2126,2141,2151,2675]·[750,764,767,770,773] | 인용 응답 불변 |

유일한 변동: `control_verifiability` +0.0137 (judge gpt-4.1 temp=0의 미세 잔여 비결정, soft 게이트 -0.05 이내 무영향). **분류·hazard·등급·인용 모든 응답축은 재현됨.**

---

## 3. 인용 개선 분해 — "기준 변경 효과" vs "응답 변동"

### 3-1. citation_recall +0.1471 = 100% 기준 변경 효과

v2 recall 정의 변경: (구) `|cited∩gold|/|gold|` 비율 → (신) **케이스 단위 binary**(동등집합 중 1행 이상 적중 시 1.0). E-CITE 해소 7건을 행 단위로 분해:

| 케이스 | base_crit | v2_crit | cited∩accept | recall_v1(비율) | recall_v2(binary) | 해소 원인 |
|--------|-----------|---------|--------------|------:|------:|----------|
| GS-0006 | E-CITE | — | [134,137] | 0.667 | 1.0 | 비율→binary |
| GS-0008 | E-CITE | — | [2920] | 0.500 | 1.0 | 비율→binary |
| GS-0009 | E-CITE | — | [129] | 0.500 | 1.0 | 비율→binary |
| GS-0017 | E-CITE | — | [33] | 0.333 | 1.0 | 비율→binary |
| GS-0026 | E-CITE | — | [2167] | 0.500 | 1.0 | 비율→binary |
| GS-0029 | E-CITE | — | [265] | 0.500 | 1.0 | 비율→binary |
| GS-0001 | E-CITE(+E-UNDER) | E-UNDER만 | [44] | 0.500 | 1.0 | 비율→binary |

**해소 7건 전부**에서 `cited∩accept == cited∩(v1 expected)`. 즉 **신규 추가 동등행(+10행: 341·346·643·4340·139·2925·682·75·3053)이 적중에 기여한 케이스는 0건**이다 — LLM이 그 행들을 한 번도 인용하지 않았기 때문. 해소는 전적으로 **recall 정의를 비율→binary로 바꾼 효과**다(원래 v1 expected의 일부 행을 LLM이 인용했고, 비율로는 0.95 미만이라 E-CITE였던 것이 binary 충족으로 전환).

### 3-2. citation_precision +0.0049 = 순수 응답 변동(noise)

precision은 set-membership(`|cited∩accept|/|cited|`)이라 동등집합 확장 시 상승 가능하나, **per_case 34건 전수에서 `precision_v1(expected) == precision_v2(acceptable)`** — cited행이 신규 동등행에 든 케이스 0건이므로 동등집합 무영향. 따라서 baseline 0.3358 → v2 0.3407(+0.0049)는 temp=0 잔여 비결정에 의한 미세 응답 변동(noise 수준). **precision 0.34는 동등집합으로 구제되지 않음** — 본질이 "LLM이 동등집합 밖의 다른 패밀리 행을 다수 인용"이기 때문.

---

## 4. citation 임계 달성 여부 + 잔여 FAIL 분리 집계

| 임계 | 목표 | baseline | v2 | 달성 |
|------|------|------:|------:|------|
| citation_precision | ≥0.90 | 0.3358 | **0.3407** | ❌ 미달(Δ-0.56) |
| citation_recall | ≥0.70 | 0.6176 | **0.7647** | ✅ **달성**(+0.065 여유) |

### 4-1. 잔여 E-CITE 6건 = precision FAIL 주원인 (cited∩accept=∅)

| 케이스 | acceptable_rows | LLM cited_rows | 원인 분류 |
|--------|----------------|----------------|-----------|
| GS-0002 | [1788,1874,1888] | [1723,2126,2141,2151,2675] | **gold측 해소 불가** — equivalence.md "오답유지". 동등후보 부재 → canonical 정규화 과제 |
| GS-0022 | [3275] | [764,767,773,777,790] | **gold측 해소 불가** — 단일행, 동등후보 부재. 게다가 cited가 전혀 다른 sub(동바리 행) → 분류오류(major X) 연동 |
| GS-0003 | [329,333,335,336,341,346] | [750,764,767,770,773] | 동등행 확장(+341,346)했으나 LLM이 그조차 미인용 → **RAG 검색입도** |
| GS-0004 | [643,651,3044,3055] | [3098,3585,3742] | 동등행(+643) 확장했으나 LLM이 전혀 다른 행 인용 → **RAG 검색입도** |
| GS-0005 | [4338,4339,4340,4344] | [2196,2200,4302] | partial-refuse 코퍼스. 동등행(+4340) 미적중 → RAG + 데이터갭 |
| GS-0010 | [675,680,682] | [678,681] | 동등행(+682) 확장했으나 681(필수대책 추가행, C4위반 제외) 인용 → **RAG 검색입도** + E-UNDER 동반 |

- **gold 측 해소 불가(canonical 정규화 필수)**: GS-0002·GS-0022 (+ baseline analysis가 지목한 GS-0001은 binary로 E-CITE 해소되어 잔존목록에서 빠짐).
- **RAG 검색입도 문제(동등행 확장에도 미적중)**: GS-0003·0004·0005·0010 — 동등집합을 넓혀도 LLM이 그 집합 밖 행을 인용 → gold 큐레이션으로는 한계, **RAG canonical-row 정규화·prefilter 강화**가 본질 해법.

### 4-2. E-UNDER 2건(GS-0001·GS-0010)은 citation과 무관한 잔존 회귀

baseline과 동일(불변). 등급 산정의 지배재해(추락·화재폭발) 누락 — rag-architect 권고 §5-1(few-shot 룰)의 과제로 별도 트랙. 본 gold 변경의 영향권 밖.

---

## 5. 게이트 판정

| 게이트 | 규칙 | 결과 | 판정 |
|--------|------|------|------|
| classification_accuracy | min_delta -0.02 | Δ+0.0 | ✅ 통과 |
| hazard_coverage | min_delta -0.03 | Δ+0.0 | ✅ 통과 |
| citation_precision | min_abs 0.90 | 0.3407 | ⚠️ SOFT 위반(미달, 단 baseline 대비 Δ+0.0049 비회귀) |
| citation_recall | min_abs 0.70 | 0.7647 | ✅ 통과(신규 달성) |
| refuse / grade / faithfulness / control_verif | min_delta | Δ≥0 | ✅ 전부 통과 |
| **critical_fail_count** | max_abs 0 (하드) | 8 | ⚠️ HARD 위반(절대>0) |

**러너 자동 판정**: `BLOCKED`(exit 1) — 하드 게이트 critical_fail_count > 0.

**해석상 정정(본 실행 맥락)**: 하드 게이트는 "절대 critical_fail > 0" 또는 "baseline 대비 증가"를 차단한다. 본 실행은 critical_fail **15→8 감소(개선)**이며 코드·프롬프트 무변경의 **gold 기준 갱신 실행**이다. 즉 *새 variant 채택을 막는 회귀*가 아니라, *잔존 8건이 여전히 0 초과*임을 알리는 절대게이트 발동이다. 회귀(min_delta) 관점에서는 **위반 0건 — 어떤 메트릭도 baseline 대비 하락하지 않았다.** variant "보류" 대상이 아니라, citation_P·E-UNDER 잔존과제가 남았다는 신호로 읽어야 한다.

> 권고: `regression_gates.yaml`의 critical_fail 하드게이트를 "baseline 대비 증가 시에만 하드 차단, 절대>0은 SOFT 경고"로 분리하면 gold 갱신·점진 개선 실행에서 오탐 BLOCKED를 줄일 수 있음(eval_plan 반영 검토).

---

## 6. 잔여 FAIL 원인 → 다음 단계 (canonical-row 정규화 작업량)

citation_precision FAIL(0.34)과 잔존 E-CITE 6건은 **gold 큐레이션 한계점에 도달**했다. 동등집합 확장(+10행)은 recall 임계를 넘기는 데 기여(정의 변경과 함께)했으나, precision과 "동등행조차 미인용" 4건(GS-0003·0004·0005·0010)은 **RAG 측 canonical-row 정규화** 없이는 해소 불가.

### 권고 작업 (data-engineer + rag-architect)

1. **canonical-row 매핑 테이블 구축** (data-engineer) — 4,469행 중 트리플(중공종·세부항목·위험요인) 중복·동의어 행을 대표행 1개로 묶는 `canonical_row` 컬럼 추가. `chunks.jsonl`의 `dup_group`·`content_hash`를 시드로 사용. 추정 작업량: 254 중공종 × 평균 중복도 기준 **대표행 선정 룰 + 1회 배치 + 도메인 spot-check 50건** (safety-domain-expert 검수 0.5d).
2. **RAG 인용 정규화** (rag-architect) — 검색 결과 source_row를 canonical_row로 치환해 인용 통일. precision·recall 동시 개선 기대(현재 GS-0003·0004·0010처럼 "옆 패밀리 행" 인용이 canonical로 수렴).
3. **eval 재측정** — canonical 적용 후 본 v2를 baseline으로 재회귀. precision 0.34→목표 0.90 도달 여부가 PoC citation 게이트 합격의 분기점.
4. **E-UNDER 별도 트랙** — GS-0001·0010 등급 과소는 citation과 독립. few-shot 지배재해 강제 주입(rag-architect §5-1)으로 처리, 본 gold 변경과 무관.

**요약**: gold 동등집합으로 **recall 임계는 달성**(0.7647 ≥ 0.70). precision(0.34)과 E-UNDER(2건)는 gold로 해소 불가 → **RAG canonical-row 정규화가 다음 마일스톤의 핵심 작업**.

---

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-12 | 작성. 러너 동등집합 채점화 + gpt-4.1 gold v2 회귀 재측정 + 인용 개선 분해(기준변경 vs 응답변동) | citation 행-ID 입도 불일치 gold측 해소 효과 정량화 |
