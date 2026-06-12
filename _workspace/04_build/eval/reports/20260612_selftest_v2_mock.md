# Eval Report — selftest_v2_mock

- dataset: `safety_gold_set_v2.jsonl` (hash `f484a74e3ddd`)
- n_cases: 35 / skipped: 0
- seed: 42 / judge: gpt-4.1 (used=False)
- timestamp: 2026-06-12T06:20:25.586235+00:00

## 메트릭

| 메트릭 | 값 | 임계 | 판정 |
|--------|----|----|------|
| classification_accuracy | 1.0 | ≥0.85 | PASS |
| classification_major_rate | 1.0 | ≥0.9 | PASS |
| hazard_coverage | 1.0 | ≥0.8 | PASS |
| hazard_core_recall | 1.0 | ≥0.85 | PASS |
| grade_alignment_general | 1.0 | ≥0.75 | PASS |
| grade_alignment_boundary | 1.0 | — | — |
| grade_alignment_overall | 1.0 | — | — |
| citation_precision | 1.0 | ≥0.9 | PASS |
| citation_recall | 1.0 | ≥0.7 | PASS |
| legal_recall | 1.0 | — | — |
| refuse_appropriateness | 1.0 | ≥0.9 | PASS |
| faithfulness | — | ≥4.0 | — |
| control_verifiability | — | ≥0.7 | — |

## critical-fail: 0건

- breakdown: `{}`

## 임계 위반

- 없음 (전 메트릭 임계 충족 + critical-fail 0)

_생성: eval-engineer runner.py · 2026-06-12T06:20:25.586235+00:00_
