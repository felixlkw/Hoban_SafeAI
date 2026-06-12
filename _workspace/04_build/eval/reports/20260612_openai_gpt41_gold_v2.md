# Eval Report — openai_gpt41_gold_v2

- dataset: `safety_gold_set_v2.jsonl` (hash `f484a74e3ddd`)
- n_cases: 35 / skipped: 0
- seed: 42 / judge: gpt-4.1 (used=True)
- timestamp: 2026-06-12T06:35:03.160853+00:00

## 메트릭

| 메트릭 | 값 | 임계 | 판정 |
|--------|----|----|------|
| classification_accuracy | 0.8971 | ≥0.85 | PASS |
| classification_major_rate | 0.9118 | ≥0.9 | PASS |
| hazard_coverage | 0.8824 | ≥0.8 | PASS |
| hazard_core_recall | 0.8696 | ≥0.85 | PASS |
| grade_alignment_general | 0.7903 | ≥0.75 | PASS |
| grade_alignment_boundary | 1.0 | — | — |
| grade_alignment_overall | 0.8088 | — | — |
| citation_precision | 0.3407 | ≥0.9 | FAIL |
| citation_recall | 0.7647 | ≥0.7 | PASS |
| legal_recall | 0.9091 | — | — |
| refuse_appropriateness | 1.0 | ≥0.9 | PASS |
| faithfulness | 4.7143 | ≥4.0 | PASS |
| control_verifiability | 0.8091 | ≥0.7 | PASS |

## critical-fail: 8건

- breakdown: `{"E-CITE": 6, "E-UNDER": 2}`

## 임계 위반

- citation_precision 0.3407 < 0.9
- critical_fail_count = 8 (> 0)

## critical-fail 케이스

- GS-0001: ['E-UNDER']
- GS-0002: ['E-CITE']
- GS-0003: ['E-CITE']
- GS-0004: ['E-CITE']
- GS-0005: ['E-CITE']
- GS-0010: ['E-UNDER', 'E-CITE']
- GS-0022: ['E-CITE']

_생성: eval-engineer runner.py · 2026-06-12T06:35:03.160853+00:00_

## 회귀 비교 (vs baseline)

- baseline variant: `openai_gpt41_baseline` (hash `9f29ce50ea14`)

| 메트릭 | baseline | current | Δ | 판정 |
|--------|----|----|----|------|
| classification_accuracy | 0.8971 | 0.8971 | +0.0 | OK |
| hazard_coverage | 0.8824 | 0.8824 | +0.0 | OK |
| citation_precision | 0.3358 | 0.3407 | +0.0049 | ⚠️ |
| refuse_appropriateness | 1.0 | 1.0 | +0.0 | OK |
| grade_alignment_general | 0.7903 | 0.7903 | +0.0 | OK |
| citation_recall | 0.6176 | 0.7647 | +0.1471 | OK |
| faithfulness | 4.7143 | 4.7143 | +0.0 | OK |
| control_verifiability | 0.7954 | 0.8091 | +0.0137 | OK |
| critical_fail_count | 15 | 8 | -7 | ⚠️ |

### 게이트 위반

- ⚠️ [HARD] critical_fail_count 8 > 0 (하드 차단)
- ⚠️ [SOFT] citation_precision: 0.3407 < min_absolute 0.9

> ⚠️ **회귀 차단(BLOCKED)** — 하드 게이트 위반. variant 채택 보류 (exit 1).
