---
name: jha-eval-design
description: "JHA 시스템의 평가·실험·회귀 워크플로우. safety-domain-expert gold set(30~50건)을 평가 데이터셋으로 흡수, 분류 정확도·hazard coverage·risk grade alignment·citation precision/recall·faithfulness·refuse appropriateness·cost/latency 메트릭 정의, LLM-as-judge rubric 설계, A/B 변형·회귀 자동화, 에러 분석 카테고리화까지 정의한다. eval-engineer가 평가 설계·실행·회귀 분석 시 반드시 이 스킬을 사용한다."
---

# JHA Eval Design — 평가·실험·회귀 워크플로우

## 언제 사용하는가

- 평가 데이터셋·메트릭을 정의·확장할 때
- LLM-as-judge rubric을 작성할 때
- A/B 실험·회귀 평가를 실행할 때
- 에러 케이스를 카테고리별로 분석할 때
- 평가 결과를 다른 팀(rag-architect, safety-domain-expert)에 피드백할 때

## 단계 1: 평가 데이터셋 구조

```jsonl
// _workspace/04_build/eval/dataset/gold_v1.jsonl
{"id":"GS-0001","task_input":"...","expected_classification":{...},"expected_hazards":[...],"expected_grade":{...},"expected_critical_register":"O","acceptable_variants":{...},"legal_refs_required":[...]}
```

### 케이스 균형 (30~50건 목표)
- 등급별: 상 30% / 중 40% / 하 30%
- 재해형태별: 추락·낙하·전도·협착·감전·기타 균형
- 난이도: 명확 60% / 모호 30% / refuse 10%
- 법정 인용 의무: 50%
- 중점등록 O: 30%

## 단계 2: 메트릭 정의

| 메트릭 | 계산 방법 | 자동/Judge |
|--------|----------|-----------|
| Classification accuracy | 대공종/중공종/세부항목 일치율 (3단계 가중 평균: 0.5/0.3/0.2) | 자동 |
| Hazard coverage (recall) | expected_hazards 중 must_include=true가 응답에 포함된 비율 | 자동 |
| Risk grade alignment | (예측 등급 == 기대 등급) ∨ (강도×빈도 곱 차이 ≤ 3) | 자동 |
| Citation precision | 응답 citations 중 retrieved_chunks에 실재하는 비율 | 자동 |
| Citation recall | gold expected_citations 중 응답에 포함된 비율 | 자동 |
| Faithfulness | LLM-judge 1~5 (응답이 컨텍스트로부터 도출 가능한가) | Judge |
| Refuse appropriateness | refuse 발동해야 할 케이스에서 발동 + 발동 안 해야 할 케이스에서 미발동 | 자동 |
| Cost per request | (input·output·cache 토큰 × 모델별 단가) 합 | 자동 |
| Latency p50/p95 | end-to-end 응답 시간 | 자동 |
| Cache hit ratio | cache_read_tokens / (cache_read_tokens + cache_creation_tokens) | 자동 |

## 단계 3: LLM-as-judge rubric (faithfulness 예시)

```text
당신은 한국 건설안전 도메인 평가자입니다. 아래 응답이 제공된 [컨텍스트]에 의해 뒷받침되는지 평가하세요.

[컨텍스트]
{retrieved_chunks}

[응답]
{system_response}

평가 기준 (1~5):
5: 응답의 모든 주장이 컨텍스트로부터 명시적·직접적으로 도출됨
4: 대부분 도출 가능, 1~2개 주장이 약한 추론에 기반
3: 약 절반의 주장이 명확히 도출됨
2: 대부분 컨텍스트와 연결이 약하거나 추측
1: 컨텍스트와 무관하거나 환각

다음 JSON 형식으로 응답:
{"score": <1-5>, "reasoning": "<이유>", "unsupported_claims": ["<목록>"]}
```

평가 LLM: `claude-opus-4-7`. judge 자체 편향 점검: 동일 응답 3회 평가 → variance < 0.5 요구.

## 단계 4: 평가 러너 구조

```python
# _workspace/04_build/eval/runner.py
@dataclass
class EvalConfig:
    dataset_path: str
    api_endpoint: str
    variant_name: str
    model_overrides: dict = field(default_factory=dict)
    judge_model: str = "claude-opus-4-7"
    seed: int = 42

def run_eval(cfg: EvalConfig) -> EvalReport:
    cases = load_jsonl(cfg.dataset_path)
    results = []
    for case in cases:
        response = call_api(cfg.api_endpoint, case.task_input, overrides=cfg.model_overrides)
        metrics = compute_metrics(case, response)
        if needs_judge(metrics):
            metrics["faithfulness"] = llm_judge(response, retrieved=metrics["retrieved"], model=cfg.judge_model)
        results.append({"case_id": case.id, "metrics": metrics, "response": response})
    return aggregate(results, cfg)
```

CLI 실행:
```
python runner.py --variant baseline --dataset dataset/gold_v1.jsonl
python runner.py --variant rerank_on --dataset dataset/gold_v1.jsonl --model JHA_USE_RERANKER=true
```

## 단계 5: A/B 비교 보고서

```
_workspace/04_build/eval/reports/{YYYYMMDD}_{variant_name}_vs_baseline.md
```

표 형식:
| 메트릭 | Baseline | Variant | Δ | 유의 |
|--------|---------|---------|---|------|
| Classification accuracy | 0.78 | 0.84 | +0.06 | ✅ |
| Hazard coverage | 0.72 | 0.79 | +0.07 | ✅ |
| Citation precision | 0.91 | 0.88 | -0.03 | ⚠️ |
| Cost/req | $0.012 | $0.018 | +$0.006 | — |

판정 규칙:
- 핵심 메트릭(분류·coverage·citation precision) 하락 > 3pt → 회귀, variant 보류
- 부가 메트릭(latency·cost) 악화 < 50% 이내면 핵심 개선 시 채택 검토

## 단계 6: 에러 분석 카테고리

실패 케이스 자동 분류:
- `cls_major_wrong` — 대공종 오분류
- `cls_sub_wrong` — 중공종 오분류
- `hazard_missing_required` — 필수 재해형태 누락
- `grade_misaligned` — 등급 KRAS 불일치
- `citation_hallucinated` — 인용이 retrieved_chunks 외
- `citation_missing` — 필수 인용 누락
- `refuse_false_positive` — 응답해야 하는데 거절
- `refuse_false_negative` — 거절해야 하는데 응답
- `format_violation` — JSON 스키마 위반

카테고리별 카운트 + 대표 사례 3건 발췌 → rag-architect·safety-domain-expert에게 actionable 피드백.

## 단계 7: 회귀 게이트

```yaml
# eval/regression_gates.yaml
gates:
  - metric: classification_accuracy
    min_delta: -0.02
  - metric: hazard_coverage
    min_delta: -0.03
  - metric: citation_precision
    min_delta: -0.03
  - metric: refuse_appropriateness
    min_delta: -0.05
```

CI에서 변경 후 eval 실행 → 게이트 위반 시 알림 + 변경 차단 (PoC 단계는 권장만).

## 단계 8: 실행 빈도·트리거

| 트리거 | 데이터셋 규모 | 메트릭 |
|--------|-------------|--------|
| 프롬프트 변경 | 전체 gold | 전체 |
| 임베딩 모델 변경 | 전체 gold + retrieval-only | 검색·인용 |
| 청크 포맷 변경 | 전체 gold | 전체 |
| 청크 데이터만 갱신 (자동 ETL) | 변경분 + 회귀 샘플 | 검색 |
| 코드 변경 (백엔드 로직) | smoke 5건 | 분류·refuse |

## 단계 9: 사용자 정성 평가 (PoC 후반)

별도 트랙으로 frontend-engineer와 협업:
- 작업자 5~10명 대상 사용성 평가
- task completion time, 신뢰도, 수정 횟수
- 정성 피드백 코딩 (긍정/부정/제안)

## 산출물 구조

```
_workspace/04_build/eval/
├─ runner.py
├─ rubrics/
│  ├─ faithfulness.md
│  ├─ hazard_coverage.md
│  └─ refuse_appropriateness.md
├─ dataset/
│  ├─ gold_v1.jsonl
│  └─ smoke_5.jsonl
├─ regression_gates.yaml
├─ reports/
│  ├─ 20260615_baseline.md
│  ├─ 20260618_rerank_on_vs_baseline.md
│  └─ ...
└─ analyzers/
   └─ error_categorizer.py
```

## 적용 우선순위

1. **변경 전 측정, 변경 후 측정**
2. **자동화 우선, 정성은 보완**
3. **재현성** (seed·버전·data hash 기록)
4. **실패 케이스도 노출** (cherry-picking 금지)
5. **회귀 발견 시 변경 주체에게 즉시 알림**

## references/

- `references/judge_rubrics_full.md` — 메트릭별 judge prompt 전문
- `references/cost_calculator.md` — 모델별 단가 + 토큰 계산
