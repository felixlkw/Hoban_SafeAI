# Eval Plan — JHA 평가 설계 (Foundation)

> 작성: eval-engineer · Phase 2 (Foundation) Wave 2
> 근거(SSOT): `safety_rubric.md`(8메트릭·곱16 부분점수·critical-fail) + `safety_risk_matrix_spec.md`(임계곱·경계셀·중점등록) + `safety_gold_set.jsonl`(35건) + `jha-eval-design` SKILL
> 대응 산출물: `eval_rubrics.md`(judge prompt), `04_build/eval/runner.py`(러너), `04_build/eval/regression_gates.yaml`(회귀 게이트), `04_build/eval/dataset/smoke_5.jsonl`
> 양방향 합의: safety-domain-expert (메트릭이 도메인 의도를 반영하는지 상시 점검)

---

## 0. 목적·원칙

- 모든 변경(프롬프트·임베딩·청킹·코드·ERP 매핑)이 품질에 미치는 영향을 **정량 추적**하고 회귀를 차단한다.
- **변경 전 측정 → 변경 후 측정** (baseline → variant 비교). cherry-picking 금지: 실패 케이스도 노출.
- **자동화 우선**: 분류·coverage·등급·인용·refuse는 결정적 코드로 완성. faithfulness·control verifiability만 LLM judge.
- **재현성**: seed·judge_model·dataset SHA-256 hash를 보고서에 기록.
- **빠른 루프**: gold 35건 기준 변경→평가→결과 1시간 이내.

---

## 1. Gold Set 흡수 방법

`safety_gold_set.jsonl`(35건)을 평가 데이터셋의 SSOT로 직접 사용한다. **변환 없이 원본 스키마를 그대로 파싱**한다(필드명 변경 시 러너만 수정).

### 1.1 실제 스키마 (파일 실측 — runner.py가 파싱하는 필드)

```jsonc
{
  "id": "GS-0001",
  "difficulty": "clear" | "ambiguous" | "refuse",
  "demo": true,                              // (선택) 데모 케이스 표시
  "task_input": "5층 옥상에서 타워크레인(T형) 분해·해체 작업 진행",
  "expected_classification": {               // refuse-full 케이스는 null 값 가능
    "major_type": "가설공사" | null,
    "sub_type": "타워크레인(T형)" | null,
    "detail_item": "타워크레인 해체" | null,
    "note": "..."                            // (선택)
  },
  "expected_hazards": [                       // refuse-full은 []
    {"accident_type": "추락", "must_include": true},
    {"accident_type": "낙하", "must_include": false}
  ],
  "expected_grade": {                         // refuse-full은 null
    "severity_range": [4, 5],                // 범위 허용(입력 모호성 반영)
    "frequency_range": [4, 5],
    "grade": "상" | "중" | "하",
    "boundary_cell": false                   // true = 곱16 경계셀
  },
  "expected_critical_register": "O" | "X" | null,
  "acceptable_variants": {
    "major_type_aliases": ["가설공사", "골조(형틀)"],   // (선택)
    "sub_type_aliases": ["T/C", "T형", "Tower Crane"],  // (선택)
    "controls_paraphrase_allowed": true,
    "synonym_map_applied": true,
    "grade_boundary_note": "...",            // (선택)
    "corpus_citation_required": ["재해 사례/중대재해"],  // (선택)
    "note": "..."                            // (선택)
  },
  "legal_refs_required": ["산업안전보건기준에 관한 규칙 §43", ...],  // []도 가능(GS-0032)
  "expected_source_rows": [32, 44],          // citation recall 정답 행
  "expected_refuse": {                        // difficulty=refuse일 때만 존재
    "trigger": "...",
    "expected_behavior": "...",
    "refuse_scope": "partial" | "full"
  }
}
```

### 1.2 케이스 분포 (실측 35건)

| 축 | 분포 |
|----|------|
| difficulty | clear 22 / ambiguous 11 / refuse 2 (GS-0005 partial, GS-0035 full) |
| grade | 상 13 / 중 13 / 하 8 / null 1(GS-0035) |
| 경계셀(곱16, boundary_cell=true) | 4건 (GS-0008·0012·0014, + GS-0012는 모순35행 row10) |
| 중점등록 O | 13건 (= 등급 상과 1:1, 명세 §5 일치) |
| legal_refs_required 보유 | 34/35 (GS-0032만 [] — 등급 하·법정의무 없음) |

> SKILL 권장 분포(상30/중40/하30, refuse 10%)와 비교: refuse 5.7%(2/35)로 다소 낮음. **safety-domain-expert에 피드백**: refuse 케이스 1~2건 추가(예: 화학물질 MSDS 갭) 검토. 단 Foundation 단계에서는 현재 35건으로 베이스라인 확정.

### 1.3 hash·버전 고정

러너는 실행 시 dataset 파일의 **SHA-256 앞 12자**를 계산해 보고서에 기록한다. gold set 갱신 시 hash가 바뀌므로 베이스라인 비교가 자동으로 "이전 gold vs 신 gold"로 분리된다(에러 핸들링 §).

---

## 2. 메트릭 계산 정의 (safety_rubric.md 형식화)

모든 메트릭은 케이스별 [0,1] 점수를 산출 후 데이터셋 평균. refuse-full 케이스(GS-0035)는 분류·coverage·등급·인용 메트릭에서 **제외**(refuse 메트릭에만 반영). refuse-partial(GS-0005)은 응답 가능 부분(추락·재해사례 근거)만 채점.

### 2.1 Classification Accuracy — 계층 가중 0.5/0.3/0.2

```
score = 0.5·match(major) + 0.3·match(sub) + 0.2·match(detail)
match(level) = 1.0  IF  norm(pred[level]) == norm(gold[level])
                       OR norm(pred[level]) ∈ acceptable_variants[level+"_aliases"]
             = 0.0  otherwise
```

- `norm()`: 공백 trim + 소문자화 + 동의어 사전(synonym_map) 적용. `synonym_map_applied=true`면 정규화 후 매칭.
- **'재해 사례' 오분류 특칙(R6)**: pred.major_type == "재해 사례" 이고 gold.major_type != "재해 사례"이면 **major 점수 0 + critical-fail(E-MISCL) 카운트**. (GS-0005는 corpus 근거라 gold가 "재해 사례"지만 일반작업 분류 시 부대토목/맨홀 허용 — note 참조, acceptable로 처리)
- **PoC 임계**: 평균 ≥ 0.85, 대공종 단독 match율 ≥ 0.90.

### 2.2 Hazard Coverage — must_include recall

```
required = [h.accident_type for h in expected_hazards if h.must_include == true]
hit      = required ∩ norm(pred.hazards)
recall   = |hit| / |required|            (required 비면 케이스 제외)
```

- 동의어 정규화(낙상→추락 등) 후 매칭. `must_include:false` 누락은 무영향, 포함 시 가산 없음(상한 1.0).
- **핵심4종(추락·낙하·전도·협착)** 부분집합 recall은 별도 집계 → 임계 ≥ 0.85.
- **PoC 임계**: 전체 ≥ 0.80.

### 2.3 Risk Grade Alignment — 일반셀 vs 경계셀 분리

**일반셀** (`boundary_cell == false`):

```
GRADE_ORDER = {"하":0, "중":1, "상":2}
dist = |GRADE_ORDER[pred] - GRADE_ORDER[gold]|
score = 1.0 (dist==0) / 0.5 (dist==1) / 0.0 (dist==2)

# 방향 가중 critical-fail (R1):
IF gold=="상" AND pred ∈ {"중","하"}:    score = 0.0  AND  critical_fail(E-UNDER) += 1
IF gold=="하" AND pred=="상":            score = 0.5  (과대평가, 안전측, 경미)
```

- 보조: 예측 severity·frequency가 gold의 `severity_range`·`frequency_range` ±1 이내면 보조점(보고서 정보용, 주 점수엔 미반영).

**경계셀** (`boundary_cell == true`, 곱16): rubric §4 부분점수표 적용 (§2.4 구현).

- **PoC 임계**: 일반셀 등급 일치율 ≥ 0.75. **상→중/하 과소평가 critical-fail = 0건 목표**(허용 상한 5%).

### 2.4 경계셀(곱16) 부분점수 구현

경계셀은 일반 채점과 **섞지 않고 별도 서브셋으로 집계**(rubric §4 지시). LLM 응답의 `grade` + `boundary_cell_flag` + `human_review_required`를 읽어 다음 룩업 테이블로 채점:

| pred.grade | flag(boundary+human_review) | gold='상'(O) | gold='중'(X) |
|-----------|:---:|:---:|:---:|
| 상 | true | 1.0 | 0.7 |
| 상 | false (자동확정) | 0.7 | 0.3 |
| 중 | true | 0.7 | 1.0 |
| 중 | false | 0.3 | 0.5 |
| 하 | (any) | 0.0 | 0.0 |

- `flag` = (`boundary_cell_flag==true` AND `human_review_required==true`).
- **경계셀은 상→중 강등을 critical-fail로 카운트하지 않는다**(정당한 중 강등 존재, rubric §4.2-4).
- 플래그 없이 자동확정 시 정답이어도 상한 0.7(R2, E-BNDRY 카운트). 곱16에서 '하'는 0점.
- 보고서는 `grade_alignment(general)`과 `grade_alignment(boundary)`를 분리 출력 후 가중평균(셀 수 비례)으로 종합치 제공.

### 2.5 Citation Precision / Recall

```
# Precision: 응답이 인용한 source_row가 실재 근거인가
pred_rows = set(response.citations.source_rows)
gold_rows = set(case.expected_source_rows)
precision = |pred_rows ∩ gold_rows| / |pred_rows|       (pred_rows 비면 1.0로 간주, 단 인용의무 케이스는 0)

# Recall: 의무 인용을 누락 없이 했는가
recall    = |pred_rows ∩ gold_rows| / |gold_rows|       (gold_rows 비면 케이스 제외)
```

- **법조문 인용**도 병행 채점: `legal_refs_required` 중 응답 legal_citations에 포함된 비율(정규화: §43 등 조문번호 매칭). precision은 무관·허위 법조문 차감.
- **의무영역 강화**: 추락(≥2m)·감전·굴착·중점등록 O 케이스는 citation recall ≥ 0.95 별도 게이트. 누락 시 citation-fail(E-CITE).
- **PoC 임계**: precision ≥ 0.90, recall ≥ 0.70 (의무영역 ≥ 0.95).

### 2.6 Faithfulness (LLM-judge)

- 응답의 모든 위험요인·개선대책이 retrieved context(source_row)에 근거하는가. 1~5 척도(rubric §2.5, eval_rubrics.md 전문).
- 갭영역(밀폐공간·화학·석면) 환각 시 ≤2 + critical-fail(E-HALL).
- **PoC 임계**: 평균 ≥ 4.0. (judge 미가용 시 skip — null로 집계 제외, 보고서에 명시)

### 2.7 Refuse Appropriateness

```
# difficulty=="refuse"인 케이스: 정책대로 발동했나
full   케이스(GS-0035): 응답이 refuse(분류·대책 생성 거부) → 정답. 환각 생성 → Missed refuse(critical, E-HALL)
partial케이스(GS-0005): 갭부분(질식·밀폐절차) 경고/refuse + 응답가능부분(추락) 응답 → 정답

# difficulty!="refuse"인 케이스: 거절하지 않았나
정상 응답 → 정답. 불필요 거절 → False refuse(경미)

appropriateness = (정답 refuse + 정답 응답) / 전체
```

- Missed refuse(갭영역 환각 응답)는 critical 가중. False refuse는 경미.
- **PoC 임계**: ≥ 0.90. Missed refuse = 0건 목표.

### 2.8 Control Verifiability (LLM-judge, 도메인 추가 메트릭)

- 개선대책이 점검 가능한 행동단위(행위주체·행위·점검가능성 3요소)인가. 0~1 척도(eval_rubrics.md).
- **PoC 임계**: ≥ 0.70.

### 2.9 Cost / Latency (자동, API 메타에서 추출)

- cost/req = Σ(input·output·cache 토큰 × 모델 단가). latency p50/p95. cache hit ratio = cache_read/(cache_read+cache_creation).
- 게이트 없음(정보용). 부가 메트릭 악화 < 50%면 핵심 개선 시 채택 검토.

---

## 3. critical-fail 자동 탐지 규칙

| 코드 | 조건 | 카운트 |
|------|------|--------|
| **E-UNDER** | 일반셀에서 gold='상' AND pred ∈ {중,하} (과소평가, R1) | critical-fail. **곱16 경계셀은 면제** |
| E-MISCL | pred.major='재해 사례' AND gold≠'재해 사례' (R6) | critical-fail |
| E-HALL | 갭영역(밀폐·화학·석면) refuse 케이스에서 환각 응답 (R3) | critical-fail |
| E-CITE | 의무영역(추락·감전·굴착·중점) source_row recall < 0.95 (R4) | citation-fail |
| E-BNDRY | 곱16에서 boundary_flag 없이 자동확정 (R2) | 정보(상한0.7 적용, critical 아님) |

> **종합 게이트**: 전 메트릭 임계 충족 + critical-fail 0건 → "PoC 합격 후보". critical-fail 1건이라도 해당 케이스는 재생성 트리거(rag-architect 가드레일 연동).

---

## 4. 실행 트리거 매트릭스

| 트리거 (변경 주체) | 데이터셋 | 메트릭 | 비고 |
|-------------------|---------|--------|------|
| 프롬프트 변경 (rag-architect) | 전체 gold 35 | 전체 8메트릭 + judge | full eval |
| 임베딩 모델 변경 (data-engineer) | 전체 gold 35 | 검색·인용 중심(citation P/R, coverage) | retrieval 회귀 |
| 청크 포맷 변경 (data-engineer) | 전체 gold 35 | 전체 | full eval |
| 청크 데이터만 갱신 (자동 ETL) | 변경분 + 회귀샘플 | 검색 | 증분 |
| 코드 변경 (backend 로직) | **smoke_5** | 분류·등급·refuse (결정적만, judge skip) | 빠른 smoke |
| ERP 매핑 변경 (erp-integration) | smoke_5 | 분류·중점등록 | 매핑 정합 |
| gold set 갱신 (safety-domain-expert) | 변경분만 | 전체 | 이전/신 gold 비교 분리 |

---

## 5. 회귀 게이트 수치

baseline 보고서 대비 variant의 Δ가 아래 `min_delta`보다 더 떨어지면 게이트 위반 → 알림 + 변경 보류(PoC는 권장). `regression_gates.yaml`로 코드화.

| 메트릭 | min_delta | 추가 절대 게이트 |
|--------|:---------:|------------------|
| classification_accuracy | **-0.02** | 절대값 ≥ 0.85 |
| hazard_coverage | **-0.03** | 절대값 ≥ 0.80 |
| citation_precision | **-0.03** | 절대값 ≥ 0.90 |
| refuse_appropriateness | **-0.05** | 절대값 ≥ 0.90 |
| grade_alignment(general) | -0.03 | 절대값 ≥ 0.75 |
| citation_recall | -0.03 | 의무영역 ≥ 0.95 (하드) |
| faithfulness | -0.2 (1~5척도) | 절대값 ≥ 4.0 |
| **critical_fail_count** | — | **0 (하드 게이트, baseline 대비 증가 시 무조건 차단)** |

- 부가(latency·cost)는 게이트 없음. 50% 이상 악화 시 보고서에 경고만.
- baseline 데이터 손실 시 회귀 비교 차단 → 사용자 보고(에러 핸들링).

---

## 6. 러너 구조 (runner.py 요약)

```
EvalConfig(dataset_path, api_endpoint, variant_name, model_overrides,
           judge_model="claude-opus-4-7", seed=42, mock=False)

run_eval(cfg):
  cases = load_gold(cfg.dataset_path)             # 실제 스키마 파싱
  for case in cases:
    resp = mock_response(case) if cfg.mock else call_api(...)   # mock=expected echo
    m = compute_deterministic_metrics(case, resp) # 분류·coverage·등급·인용·refuse
    if judge_available(): m += llm_judge(...)      # faithfulness·verifiability
  agg = aggregate(results)                         # 평균·서브셋·critical-fail
  write_markdown_report(agg, cfg)                  # reports/{date}_{variant}.md
  if baseline: compare_gates(agg, baseline, gates) # 회귀 비교
```

- CLI: `--variant --dataset --api-endpoint --mock --judge/--no-judge --baseline`.
- **mock 모드**: API 미가용 시 gold의 expected를 echo → 결정적 메트릭이 **만점** 나와야 정상(self-test). 메트릭 계산 코드 검증용.
- Windows UTF-8: `io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")`로 한국어 stdout 보장.

---

## 7. 에러 핸들링

- API timeout → 케이스 skip + `skipped` 카운트. 메트릭 평균에서 제외(왜곡 방지).
- judge 파싱 실패 → 1회 재시도, 재실패 시 manual review 큐(`reports/manual_review_{date}.jsonl`).
- baseline 손실 → 회귀 비교 중단 + 사용자 보고.
- gold set hash 변경 감지 → 베이스라인 비교를 "이전 gold vs 신 gold"로 분리 표기.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 최초 작성. gold35 흡수·8메트릭 형식화·곱16 부분점수·트리거매트릭스·회귀게이트·critical-fail | Phase 2 Foundation Wave 2 |
