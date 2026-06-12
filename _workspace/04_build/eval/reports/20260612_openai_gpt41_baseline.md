# Eval Report — openai_gpt41_baseline

- dataset: `gold_v1.jsonl` (hash `9f29ce50ea14`)
- n_cases: 35 / skipped: 0
- seed: 42 / judge: gpt-4.1 (used=True)
- timestamp: 2026-06-12T06:00:36.555837+00:00

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
| citation_precision | 0.3358 | ≥0.9 | FAIL |
| citation_recall | 0.6176 | ≥0.7 | FAIL |
| legal_recall | 0.9091 | — | — |
| refuse_appropriateness | 1.0 | ≥0.9 | PASS |
| faithfulness | 4.7143 | ≥4.0 | PASS |
| control_verifiability | 0.7954 | ≥0.7 | PASS |

## critical-fail: 15건

- breakdown: `{"E-CITE": 13, "E-UNDER": 2}`

## 임계 위반

- citation_precision 0.3358 < 0.9
- citation_recall 0.6176 < 0.7
- critical_fail_count = 15 (> 0)

## critical-fail 케이스

- GS-0001: ['E-UNDER', 'E-CITE']
- GS-0002: ['E-CITE']
- GS-0003: ['E-CITE']
- GS-0004: ['E-CITE']
- GS-0005: ['E-CITE']
- GS-0006: ['E-CITE']
- GS-0008: ['E-CITE']
- GS-0009: ['E-CITE']
- GS-0010: ['E-UNDER', 'E-CITE']
- GS-0017: ['E-CITE']

_생성: eval-engineer runner.py · 2026-06-12T06:00:36.555837+00:00_
