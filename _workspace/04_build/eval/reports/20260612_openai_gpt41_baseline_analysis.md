# 품질 기준점 v1 — OpenAI gpt-4.1 실 LLM Baseline

- **variant**: `openai_gpt41_baseline`
- **dataset**: `gold_v1.jsonl` (35건, hash `9f29ce50ea14`) / synonym_map `aa9774115120`
- **model**: gpt-4.1 (백엔드 `model_used=gpt-4.1` 확인, mock 폴백 아님) / judge: gpt-4.1 / seed 42
- **run**: skip 0건 (전 35건 정상 주행) / timestamp 2026-06-12T06:00:36Z
- **위치**: runner 자동산출물 `20260612_openai_gpt41_baseline.{md,json}` 와 동일 디렉터리. 본 문서는 그 위에 에러분석·지연·judge편향·권고를 더한 해석 레이어.

> **이것이 품질 기준점 v1이다.** 직전 `20260610_e2e_*` 보고서는 전부 Mock 응답(gold echo·결정적 스텁) 기반으로, 메커니즘 sanity 확인용이며 품질 비교 대상이 **아니다**. 향후 모든 프롬프트·모델·prefilter·few-shot 변경은 본 baseline 대비 회귀 비교한다.

---

## 1. 전체 메트릭 + PoC 임계치 달성표

| 메트릭 | 값 | PoC 임계 | 판정 |
|--------|-----|---------|------|
| classification_accuracy (가중 0.5/0.3/0.2) | **0.897** | ≥0.85 | ✅ PASS |
| classification_major_rate (대공종) | 0.912 | ≥0.90 | ✅ PASS |
| hazard_coverage | **0.882** | ≥0.80 | ✅ PASS |
| hazard_core_recall (must_include) | 0.870 | ≥0.85 | ✅ PASS |
| grade_alignment_general | **0.790** | ≥0.75 | ✅ PASS |
| grade_alignment_boundary | 1.000 | — | (경계셀 human-review 정상) |
| grade_alignment_overall | 0.809 | — | — |
| **citation_precision** | **0.336** | ≥0.90 | ❌ **FAIL** |
| **citation_recall** | **0.618** | ≥0.70 | ❌ **FAIL** |
| legal_recall (법조문) | 0.909 | (참고) | ✅ 양호 |
| refuse_appropriateness | **1.000** | ≥0.90 | ✅ PASS |
| faithfulness (judge 1~5) | **4.71** | ≥4.0 | ✅ PASS |
| control_verifiability (judge 0~1) | 0.795 | ≥0.70 | ✅ PASS |
| **지연 mean / p50 / p95** | **10.3s / 10.0s / 15.3s** | (참고) | ⚠️ 높음 |

지연: classify+assess 2회 순차 gpt-4.1 호출 합산(uvicorn access log `duration_ms` 기준, baseline 35세션). min 6.0s / max 18.2s.

**합격 판정**: 13개 임계 메트릭 중 **11개 PASS, 2개 FAIL(citation_precision·citation_recall)**. critical_fail 15건으로 PoC 절대게이트 1건 위반(critical_fail>0). 분류·coverage·등급·refuse·faithfulness 등 **핵심 품질축은 모두 임계 충족** — 단 인용 정합 축이 미달.

---

## 2. Judge 편향 점검 (LLM-as-judge 신뢰성)

동일 응답을 faithfulness judge로 3회 채점한 variance:

| 케이스 | 3회 점수 | variance |
|--------|---------|----------|
| GS-0001 | 5.0 / 5.0 / 5.0 | 0.000 |
| GS-0003 | 5.0 / 4.0 / 4.0 | 0.222 |
| GS-0005 | 5.0 / 5.0 / 5.0 | 0.000 |

**max variance 0.222 < 0.5 → PASS.** judge(gpt-4.1, temp=0)는 재현성 충분. faithfulness 4.71 점수는 신뢰할 수 있음.

---

## 3. 에러 분석 (critical-fail 15건)

| 카테고리 | 건수 | 의미 |
|----------|------|------|
| **E-CITE** (인용 정합 실패) | 13 | mandatory/critical 케이스에서 source_row recall<0.95 |
| **E-UNDER** (등급 과소평가) | 2 | gold 상 → 예측 중/하 (안전상 가장 위험) |

분류 오분류(E-MISCL)·환각(E-HALL)·refuse 오작동·경계셀 오류 = **0건**. 실패는 전적으로 **인용 정합**과 **2건의 등급 과소**에 집중.

### 3-1. E-CITE 13건의 근본원인 — "row-ID 입도 불일치", 환각 아님 (중요)

대표 3건 (gold expected_source_rows vs 실제 cited source_rows):

| 케이스 | 작업 | gold rows | pred rows | row P/R | **legal_refs** |
|--------|------|-----------|-----------|---------|----------------|
| GS-0001 | 타워크레인 해체 | [32, 44] | [42, 43, 44] | 0.33 / 0.50 | ✅ 필수 §43·§142 모두 인용 |
| GS-0002 | 흙막이 터파기 | [1874,1888,1788] | [1723,2126,2141,2151,2675] | 0.0 / 0.0 | ✅ 필수 §338·§339·§340 모두 인용 |
| GS-0003 | 거푸집·동바리 | [333,329,335,336] | [750,764,767,770,773] | 0.0 / 0.0 | ✅ 필수 §332 + KOSHA C-2 인용 |

**핵심 발견**: source_row precision은 0.34로 낮지만, **legal_recall은 0.909로 높다.** 즉 시스템이 인용한 행은 gold가 지목한 정확한 행 번호와 다르지만, **동일 하위공종 패밀리의 의미상 동등한 다른 행**이며 그로부터 추출한 **법조문·대책 내용은 정답**이다. 4,469행 Excel에 동일 세부작업이 다수 중복행으로 존재(예: 동바리 설치 관련 행이 행 329~336과 750~773에 병존)하는 데이터 특성 때문이다.

따라서 citation_precision 0.336은 **환각성 오인용이 아니라 gold의 행-ID 특정성 vs RAG 검색행의 입도 불일치**가 주원인. faithfulness 4.71·legal_recall 0.909가 "인용 내용 자체는 신뢰 가능"을 교차검증한다. 단, **메트릭 정의상 FAIL은 FAIL** — cherry-picking 없이 미달로 보고하며, 해소는 gold 큐레이션(행-동등집합 허용)과 RAG(canonical-row 정규화) 양쪽 과제다.

### 3-2. E-UNDER 2건 — critical-fail (상→중/하 과소평가, 안전 직결)

| 케이스 | 작업 | gold | 예측 | 누락/원인 |
|--------|------|------|------|-----------|
| **GS-0001** | 5층 옥상 타워크레인(T형) 해체 | **상** (sev 4-5×freq 4-5) | **중** | 지배 재해 **추락/낙하**를 놓치고 [충돌·전도·전도]만 도출 → 고소 해체 위험을 중으로 과소 |
| **GS-0010** | 동절기 보온양생 열풍기 연료 보충 | **상** (sev 4-5×freq 3-5) | **하** | [화재]만 도출, 화재·폭발 강도 과소. 단 `human_review_required=True` 플래그는 발동(안전망 작동) |

GS-0001은 고소 해체작업을 중으로 평가한 **가장 위험한 과소평가**. GS-0010은 자동 등급은 하로 빠졌으나 human-review 플래그가 잡아 운영상 2차 검토로 회수 가능. 둘 다 등급 산정 단계에서 **고강도 지배재해(추락·폭발) 인식 누락**이 공통 원인.

---

## 4. Mock baseline과의 관계

| 항목 | Mock baseline (20260610) | **실 LLM baseline v1 (本)** |
|------|--------------------------|------------------------------|
| 응답원 | gold expected echo(결정적 스텁) | gpt-4.1 실 추론 |
| 용도 | 파이프라인·메트릭 계산 sanity | **품질 기준점** |
| 분류·coverage 점수 | (인위적 만점/근사) | 0.897 / 0.882 (실측) |
| 비교 가치 | 회귀 비교 대상 아님 | **향후 회귀의 기준선** |

이번 실행으로 그동안 "Mock 종속으로 보류"였던 품질 메트릭이 처음 실측되었다. `regression_gates.yaml` 게이트는 이제 본 JSON(`20260612_openai_gpt41_baseline.json`)을 baseline 입력으로 사용한다.

---

## 5. rag-architect 전달 actionable 권고

1. **[E-UNDER·최우선] 등급 산정 지배재해 누락 보정** — 고소작업(해체/인양)·인화물 취급 시 추락·낙하·화재폭발을 강제 후보로 주입하는 few-shot/룰 추가. GS-0001(해체→중), GS-0010(열풍기→하) 회귀 케이스로 고정.
2. **[citation_precision] gold 행-ID를 "동등행 집합"으로 완화** — safety-domain-expert와 협업, expected_source_rows를 동일 세부작업 중복행 집합(acceptable_source_rows)으로 확장. 메트릭은 집합교차로 채점하도록 `metric_citation` 보강.
3. **[citation_recall] canonical-row 정규화** — data-engineer: 중복행을 대표행(canonical_row)으로 매핑하는 테이블 구축, RAG가 대표행 ID로 인용 통일 → precision·recall 동시 개선.
4. **[지연] p95 15.3s 단축** — classify·assess 2회 순차호출을 병합하거나, 분류 확정 케이스는 assess에서 분류 재호출 생략. 모호케이스만 상위모델 분기 유지로 평균 토큰 절감.
5. **[유지]** 분류·hazard·refuse·faithfulness·judge신뢰성은 이미 임계 충족 — 변경 시 본 baseline 대비 회귀만 감시(게이트 min_delta 적용).
