# JHA Agent PoC — 최종 종합 평가 보고서

> 작성: eval-engineer · Phase 6 (Integration) 최종 산출
> 작성일: 2026-06-10
> 근거 SSOT: `02_foundation/eval_plan.md`·`safety_rubric.md`·`safety_risk_matrix_spec.md`·`safety_legal_citation_matrix.md`
> 동반 산출: `04_build/eval/reports/20260610_e2e_refuse_fixed.md`(+.json), `05_integration/safety_final_review.md`

---

## 0. 한 줄 결론

**메커니즘(상태머신·경계셀 3중 강제·인용 불변식·refuse 가드레일·ERP 이중 게이트)은 코드 레벨에서 검증·작동하여 PoC 데모 가능(조건부).**
**단 LLM 추천 품질의 절대값(분류·인용·등급·faithfulness)은 실 Claude baseline 미실행으로 검증 보류** — 이는 PoC 설계상 의도된 경계이며, 운영 전환 전 R1·R2 충족이 게이트다.

---

## 1. PoC 목표 대비 달성 요약

목표: **자연어 작업 입력 → LLM/RAG가 분류·위험요인·등급·대책 추천 → 사용자 검토 → ERP 등록** 파이프라인의 설계·구현·검증.

| 파이프라인 단계 | 구현 | 검증 상태 | 근거 |
|----------------|:----:|:---------:|------|
| 자연어 입력 → 세션 생성 | ✅ | **검증됨(E2E)** | `POST /v1/jha/sessions` 35/35 완주, skip 0 |
| 분류 (대/중공종·세부항목) | ✅ | 메커니즘 검증 / **품질 보류** | classify 200, BM25 4,469청크 prefilter+검색. 절대 정확도는 실 LLM 필요 |
| 위험요인·재해형태 추천 | ✅ | 메커니즘 검증 / **품질 보류** | hazards 매핑·coverage 계산. 절대값은 Mock 종속 |
| 위험등급 (KRAS 5×5·경계셀) | ✅ | **검증됨(코드 권위)** | sev×freq 코드 재계산, 곱16 경계셀 3중 강제 PASS |
| 대책 추천 | ✅ | 품질 보류 | controls 생성. faithfulness/verifiability judge는 실 LLM 키 필요 |
| 인용 강제·refuse 가드레일 | ✅ | **검증됨(이번 수정으로 발동 입증)** | citations⊆retrieved 불변식 + G3 갭탐지 refuse 2/2 발동 |
| 사용자 검토 워크플로우 | ✅ | 검증됨(UI+상태머신) | review→reviewed 전이, frontend 13 테스트 |
| ERP 등록 | ✅(Mock) | **검증됨(7 시나리오)** | Outbox·Idempotency·이중 게이트, erp_outbox 11 테스트 |

**판정: 파이프라인 8단계 전 구현 완료. 메커니즘 안전장치는 검증, LLM 품질 절대값은 의도적 보류(실 LLM 게이트).**

---

## 2. 검증된 것 (메커니즘 — Mock 무관 유효)

이 항목들은 **LLM 추론과 무관하게 코드가 보장**하므로 Mock 환경에서도 신뢰 가능한 검증 결과다.

### 2.1 세션 상태 머신
- `created → classified → assessed → reviewed → finalized` 전이, 위반 전이 차단.
- E2E 35케이스 create→classify→assess 전 구간 연결·타임아웃·5xx **0건**.
- 미해소 human_review 상태에서 finalize 시도 → **409 G1 게이트** 차단 (test_session_state_machine).

### 2.2 경계셀(곱16, 강도4×빈도4) 3중 강제 — 핵심 안전장치
- `domain_postprocess.recompute_grade`: 곱16 → `grade=HIGH` + `boundary_cell_flag=True` + `human_review_required=True` 강제.
- E2E GS-0008에서 강제 플래그 확인, runner 경계셀 부분점수표 발동(`grade_alignment_boundary=0.7667`).
- 자동확정 금지 → safety §1.1·domain_postprocess §5.2와 정합. **곱16 고위험 과소평가를 코드가 차단**.

### 2.3 인용 불변식 (citations ⊆ retrieved)
- 인용 source_row는 검색된 청크에서만 생성(후처리 강제). 임의 행번호 환각 불가.
- `_extract_source_rows` 전건 정수 파싱(파싱 실패 0). (precision 절대값 저하는 불변식 위반이 아니라 Mock 검색≠gold 정답행)

### 2.4 refuse 가드레일 (G3 갭영역) — **이번 Phase 6 수정으로 발동 입증**
- `gap_guardrail.py` 신규: 결정적 키워드 매칭(LLM 비의존) → Mock·실 LLM 무관 STAGE 4(LLM 호출 전) 발동.
- **E2E 재검증 결과**: refuse 대상 2/2 발동 (직전 baseline 0/2 → 수정 후 2/2):
  - GS-0035(석면): `refused_full` (classify 단계, hazards 0건 — 환각 대책 미생성)
  - GS-0005(밀폐공간): `refused_partial` (assess 단계, 질식·환기 갭 차단 + 추락 등 일반위험 응답 유지)
- `refuse_appropriateness 0.9429 → 1.0`, **안전 직결 critical-fail E-HALL 2 → 0**.
- backend pytest **test_gap_guardrail 20케이스 통과** (refuse 발동 + false-refuse 0).

### 2.5 ERP Mock 7 시나리오
- 정상 등록·중복(Idempotency-Key)·부분실패 롤백·human_review 미해소 차단(G2 ErpFatal)·Outbox 재시도(1·2·4·8s 백오프)·payload_hash 위변조 방지·5xx 일시장애 격리.
- `test_erp_outbox` 11 + `test_api_flow` 10 + `test_security_gate` 5에서 커버.

### 2.6 테스트 커버리지 (전체)
| 영역 | 테스트 수 | 비고 |
|------|:---------:|------|
| backend pytest | **55** (collected) | gap_guardrail 20·erp_outbox 11·api_flow 10·postprocess 6·security_gate 5·state_machine 3 |
| frontend | **13** (it-blocks) | BoundaryCellBadge 4·ClassificationCard 4·RefuseNotice 5 |
| eval self-test | mock 결정적 메트릭 만점 + critical-fail 0 검증(runner `--mock`) | 계산 코드 정합성 보증 |

---

## 3. 검증 보류 (실 LLM 필요)

다음은 **Mock(MockClaudeClient — anthropic SDK 미설치 시 자동) 종속**이라 절대값을 품질 신호로 읽으면 안 된다. 실 Claude baseline 실행 시 비로소 유효.

| 메트릭 | Mock 값 | PoC 임계 | 왜 보류인가 |
|--------|:-------:|:--------:|-------------|
| classification_accuracy | 0.5941 | ≥0.85 | Mock은 BM25 top 청크 라벨 echo. LLM 의도추출·재랭킹 부재 |
| classification_major_rate | 0.7647 | ≥0.90 | 〃 (BM25 검색 상한 근사) |
| citation_precision / recall | 0.3235 / 0.5931 | ≥0.90 / ≥0.70 | Mock 검색결과 ≠ 전문가 선정 gold 정답행. 실 dense/rerank 필요 |
| legal_recall | 0.1869 | — | Mock 고정 stub(§43 등) → 케이스별 법조문 부재 |
| grade_alignment_general | 0.7097 | ≥0.75 | Mock 메타 sev×freq 입력값 종속 |
| faithfulness | — (skip) | ≥4.0 | ANTHROPIC_API_KEY 미설정 → judge 미실행 |
| control_verifiability | — (skip) | ≥0.70 | 〃 |

### 3.1 실 LLM baseline 실행 절차 (운영 전환 전 필수)
```bash
# 1) SDK 설치 + 키 설정 (현재 미설치 → Mock 강제 중)
pip install anthropic
export ANTHROPIC_API_KEY=sk-ant-...
# 2) Mock 해제하고 백엔드 기동
unset JHA_FORCE_MOCK            # (또는 JHA_FORCE_MOCK=false)
export JHA_AUTH_ENABLED=false   # 평가는 worker 경로 → 인증 우회
cd _workspace/04_build/backend && python -m uvicorn app.main:app --port 8400
# 3) 러너 = LLM-judge 동반 (faithfulness·control_verifiability 채점 활성)
cd ../eval
python runner.py --variant e2e_llm_baseline \
  --dataset dataset/gold_v1.jsonl --api-endpoint http://localhost:8400 \
  --baseline reports/20260610_e2e_refuse_fixed.json
```
- 실 LLM에서 분류·인용·등급 절대값이 비로소 품질 신호. Mock baseline은 그때의 **메커니즘 회귀 하한(sanity)** 으로 재사용.
- 임계: 분류≥0.85, citation precision≥0.90/recall≥0.70, 의무영역 legal recall≥0.95, faithfulness≥4.0.

---

## 4. 산출물 인벤토리 (Phase 1~6 파일 맵)

| Phase | 디렉토리 | 핵심 산출물 |
|-------|----------|------------|
| 1 Discovery | `01_discovery/` | data_profile.md · erp_interface_inventory.md · safety_scope.md |
| 2 Foundation | `02_foundation/` | **data**: data_cleaned.parquet·data_schema.json·chunks.jsonl(4,469)·bm25_index.pkl·etl_pipeline.md·data_security_policy.md / **rag**: rag_architecture.md·rag_chunking_spec.md·rag_embedding_choice.md·rag_retrieval_spec.md·rag_guardrails.md·rag_prompts/ / **safety**: safety_gold_set.jsonl(35)·safety_rubric.md·safety_risk_matrix_spec.md·safety_legal_citation_matrix.md·safety_taxonomy_review.md / **eval**: eval_plan.md·eval_rubrics.md |
| 3 Design | `03_design/` | api_openapi.yaml · backend_architecture.md · session_state_machine.md · observability_plan.md / **erp**: erp_access_strategy.md·erp_master_mapping.md·erp_register_flow.md·erp_security.md·erp_etl_pipeline.md·erp_mapping/ / **ux**: ux_wireframes.md·ux_components.md·ux_user_journey.md·ux_accessibility.md |
| 4 Build | `04_build/` | **backend/**: app/(main·config·routes·schemas·services·adapters·outbox·middleware) + services/gap_guardrail.py(신규)·domain_postprocess.py·rag_pipeline.py·security_gate.py + tests/(55) / **frontend/**: app·components·lib + tests/(13) / **eval/**: runner.py·regression_gates.yaml·synonym_map.json·dataset/(gold_v1.jsonl)·rubrics/·reports/ / **scripts/etl/** |
| 5 Integration | `05_integration/` | safety_final_review.md · demo_script.md · **eval_final_report.md(본 문서)** |
| 5 Sync | `05_sync/` | blue/ · sync_log.jsonl |

### 4.1 평가 보고서 이력 (reports/)
- `20260610_baseline.md` / `_v2.{md,json}` — Foundation 골격 검증
- `20260610_smoke.md` — smoke_5 스모크
- `20260610_e2e_mock_baseline.{md,json}` + `_analysis.md` — **E2E Mock 기준선** (회귀 비교 baseline)
- `20260610_e2e_refuse_fixed.{md,json}` — **refuse 수정 회귀 검증(본 Phase 6 산출)**

---

## 5. safety 권고 R1~R6 반영 상태

| ID | 권고 | 심각도 | 반영 상태 | 근거 |
|----|------|:------:|-----------|------|
| **R1** | refuse 가드레일(밀폐공간·석면) 실효 입증 | 높음(안전직결) | **부분 해소** | gap_guardrail.py로 Mock E2E에서 **refuse 2/2 발동·E-HALL 0** 입증(§2.4). ⚠️ **실 LLM 재검증 잔존** + GS-0010 false-partial 보완(§6) |
| **R2** | 실 LLM 품질 baseline 측정 | 높음 | **미해소(게이트)** | ANTHROPIC_API_KEY 미설정. 절차 §3.1 명시. 운영 전 필수 |
| **R3** | 5×5 강도축 라벨·"신뢰도" 용어 명확화 | 중 | 미해소(비차단) | frontend 마이크로카피 보강 항목 |
| **R4** | 미체크 개선대책 안전 함의 안내 | 중 | 미해소(비차단) | 확정 게이트 "미체크 N건" 경고 권고 |
| **R5** | 곱 낮으나 치명도 큰 재해(감전) 등급 하 인지 | 중 | 부분(인용 필수 부착 OK) | UI 배지 검토 잔존 |
| **R6** | 곱16 중 강등 시 재해형태 MUST 조문 유지 | 낮 | 미해소(설계 대비됨) | ERP 게이트 보강 항목 |

**R1 갱신**: 이번 수정으로 "refuse 미발동(0/2)" → "결정적 발동(2/2)"로 **부분 해소**. 단 (a) 실 LLM 경로에서 시스템 프롬프트 refuse + G3 이중 발동 재검증, (b) 회귀에서 발견된 **GS-0010 false-partial-refuse**(키워드 "보온양생" 과잉매칭) 정밀화가 잔존 과제.

---

## 6. 회귀 검증 결과 요약 (refuse 수정 효과 격리)

baseline `e2e_mock_baseline` → variant `e2e_refuse_fixed` (동일 dataset hash `9f29ce50ea14`·endpoint·Mock).

| 메트릭 | baseline | refuse_fixed | Δ | 해석 |
|--------|:--------:|:------------:|:--:|------|
| refuse_appropriateness | 0.9429 | **1.0** | +0.0571 | ✅ refuse 2/2 발동 |
| critical_fail E-HALL | 2 | **0** | -2 | ✅ 안전직결 거절누락 전멸 |
| critical_fail E-UNDER | 2 | 3 | +1 | ⚠️ GS-0010 부작용(아래) |
| critical_fail_count(전체) | 17 | 16 | -1 | E-CITE 13 잔존(Mock 아티팩트) |
| grade_alignment_general | 0.7419 | 0.7097 | -0.0322 | ⚠️ GS-0010 등급 하락 영향 |
| classification·citation 절대값 | 동일 | 동일 | 0 | refuse 외 메트릭 미변동(결정성 확인) |

### 6.1 의도된 개선 (입증)
- GS-0035(석면) E-HALL→해소, GS-0005(밀폐공간) E-HALL→해소. false-refuse 0(GS-0010 제외).

### 6.2 발견 부작용 — GS-0010 false-partial-refuse (actionable)
- "동절기 콘크리트 **보온양생** 중 열풍기 연료 보충 작업"이 `confined_space` 키워드 **"보온양생"** 에 매칭 → `refused_partial` → 갭 hazard 필터링으로 고강도 화재 위험 제거 → 대표 등급 '하' vs gold '상' → **E-UNDER 신규**.
- **피드백(→ rag-architect·safety)**: (1) `guardrail_gap_areas.json`의 "보온양생" 키워드를 질식 맥락 동반("갈탄/연탄/밀폐양생") 시에만 매칭하도록 정밀화(코드 변경 불필요). (2) refused_partial이 비갭 고강도 위험을 가려 등급을 떨어뜨리지 않도록 필터 전 원시 최고등급 유지 검토.

### 6.3 게이트 판정
- 하드 BLOCK(critical_fail_count 16>0)은 **기존 E-CITE×13(Mock 인용 아티팩트)** 잔존 탓이며 refuse 수정과 무관(전체 17→16 **감소**). 실 dense/rerank·실 LLM에서 해소될 Mock 종속 항목.
- **순 안전 효과**: E-HALL -2 / E-UNDER +1 → 안전직결 critical-fail 4→3 감소. E-UNDER 1건은 키워드 정밀화로 즉시 해소 가능.

---

## 7. 운영 전환 로드맵

PoC(메커니즘 데모) → 운영(실작업 등록) 전환 전 **게이트(필수 충족)**:

1. **dense 검색 활성화** — BM25 단독 → BM25+dense 하이브리드(+rerank). E-CITE 13건·classification 절대값의 가장 민감한 타깃. `JHA_TOP_K`/임베딩 모델 env A/B로 스윕.
2. **실 LLM baseline (R2)** — §3.1 절차로 분류·인용·등급·faithfulness 절대값 측정. 임계(분류≥0.85·citation P≥0.90/R≥0.70·의무 legal R≥0.95·faithfulness≥4.0) 충족 확인. 미달 시 프롬프트·검색 튜닝 후 재측정.
3. **refuse 보강 완결 (R1)** — 실 LLM에서 시스템 프롬프트 + G3 이중 refuse 재검증, GS-0010류 false-partial 정밀화. 거절 대상 recall≥0.95.
4. **실 ERP 연동** — Mock 어댑터 → 실 ERP I/F(mTLS·시크릿·IP 화이트리스트). Outbox·Idempotency·이중 게이트는 구현됨, 실 엔드포인트 결선·계약 검증 잔존.
5. **전문가 검증 ≥200건** — 안전관리자가 실작업 입력에 대해 AI 추천 vs 수기 평가 대조. 오답 패턴(과소평가·인용오류·분류오류) 카테고리화 → gold set·few-shot 보강. 사용자 수정/거절 항상 가능(제약사항 준수).
6. **법령 최신성 게이트** — 안전보건규칙 조문번호 개정 재확인 + 중대재해처벌법 시행령 추가개정 영역은 정보성 표시만(평가 제외 유지).

---

## 8. 종합 판정

**PoC 데모: 가능 (조건부).** 메커니즘 안전장치(상태머신·경계셀 3중 강제·인용 불변식·refuse 가드레일·ERP 이중 게이트)는 코드/E2E로 검증·작동하며, 이번 Phase 6 refuse 수정으로 핵심 갭영역(석면·밀폐공간) 거절이 결정적으로 발동함을 입증했다(E-HALL 2→0, refuse_appropriateness 1.0).

**검증 보류(실 LLM 게이트):** 분류·인용·등급·faithfulness의 품질 절대값은 Mock 종속으로 보류 — 이는 결함이 아니라 PoC 설계상 의도된 경계다. 운영 전환은 R1·R2(실 LLM baseline + refuse 완결) 충족을 게이트로 한다.

**잔존 과제(즉시 actionable):** GS-0010 false-partial-refuse(키워드 "보온양생" 과잉매칭)는 `guardrail_gap_areas.json` 정밀화로 코드 변경 없이 해소 가능.

---

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | 최초 작성. refuse 수정 E2E 회귀 검증(2/2 발동·E-HALL 0·GS-0010 부작용 발견) + PoC 목표 대비 달성·메커니즘 검증·검증보류·산출물 인벤토리·R1~R6 반영·운영 로드맵 종합 | Phase 6 Integration 최종 |
