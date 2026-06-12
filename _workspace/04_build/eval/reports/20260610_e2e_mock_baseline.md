# Eval Report — e2e_mock_baseline

- dataset: `gold_v1.jsonl` (hash `9f29ce50ea14`)
- n_cases: 35 / skipped: 0
- seed: 42 / judge: claude-opus-4-7 (used=False)
- timestamp: 2026-06-10T06:58:00.373609+00:00

## 메트릭

| 메트릭 | 값 | 임계 | 판정 |
|--------|----|----|------|
| classification_accuracy | 0.5941 | ≥0.85 | FAIL |
| classification_major_rate | 0.7647 | ≥0.9 | FAIL |
| hazard_coverage | 0.8676 | ≥0.8 | PASS |
| hazard_core_recall | 0.8696 | ≥0.85 | PASS |
| grade_alignment_general | 0.7419 | ≥0.75 | FAIL |
| grade_alignment_boundary | 0.7667 | — | — |
| grade_alignment_overall | 0.7441 | — | — |
| citation_precision | 0.3235 | ≥0.9 | FAIL |
| citation_recall | 0.5931 | ≥0.7 | FAIL |
| legal_recall | 0.1263 | — | — |
| refuse_appropriateness | 0.9429 | ≥0.9 | PASS |
| faithfulness | — | ≥4.0 | — |
| control_verifiability | — | ≥0.7 | — |

## critical-fail: 17건

- breakdown: `{"E-CITE": 13, "E-HALL": 2, "E-UNDER": 2}`

## 임계 위반

- classification_accuracy 0.5941 < 0.85
- grade_alignment_general 0.7419 < 0.75
- citation_precision 0.3235 < 0.9
- citation_recall 0.5931 < 0.7
- critical_fail_count = 17 (> 0)

## critical-fail 케이스

- GS-0001: ['E-UNDER', 'E-CITE']
- GS-0002: ['E-UNDER', 'E-CITE']
- GS-0003: ['E-CITE']
- GS-0004: ['E-CITE']
- GS-0005: ['E-CITE', 'E-HALL']
- GS-0006: ['E-CITE']
- GS-0008: ['E-CITE']
- GS-0009: ['E-CITE']
- GS-0010: ['E-CITE']
- GS-0014: ['E-CITE']

_생성: eval-engineer runner.py · 2026-06-10T06:58:00.373609+00:00_
