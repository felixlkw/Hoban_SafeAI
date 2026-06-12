# RAG Retrieval Spec — 검색 명세 (Foundation)

> 작성: rag-architect · Phase 2 (Foundation) Wave 2
> 상태: **PoC 베이스라인 = BM25 단독, rerank OFF, dense OFF**. Dense는 Phase 4.
> 근거: `jha-rag-design` SKILL 3-stage + `etl_pipeline.md`(BM25 검증) + taxonomy_review(prefilter 규칙) + data_schema(메타 키).
> 목적: prefilter·가중치·top_k·threshold·rerank 도입조건의 SSOT. eval-engineer가 스윕할 hyperparameter 노출.

---

## 1. Prefilter 규칙 (STAGE 1)

사용자 입력 → taxonomy_lookup 매칭 → 메타데이터 결정적 필터로 검색공간 축소. **semantic 검색 전에 수행**.

### 1.1 매칭·필터 매핑

| 입력 신호 | taxonomy_lookup 소스 | 필터 필드 | 효과(예) |
|----------|---------------------|----------|---------|
| 중공종명("타워크레인","리프트","흙막이","동바리") | `sub.csv` (SB###) | `sub_type_id IN [...]` | 4,469 → 43~86 |
| 대공종명("가설공사","토목 전문공사") | `major.csv` (MJ###) | `major_type_id` | 대분류 축소 |
| 세부항목 힌트("해체","설치","굴착") | `detail.csv` (DT####) | `detail_item_id` 후보 가중 | 추가 정밀화 |
| 재해형태어("추락","낙하","협착","감전","붕괴") | accident_type enum | `accident_type` | 4,469 → 해당형태 |
| 동음/이형("T/C","Tower Crane","흙막이/토류벽") | 동의어 맵(`acceptable_variants`) | 정규화 후 매칭 | recall 보호 |

### 1.2 '재해 사례' 대공종 제외 규칙 (확정)

`is_classification_candidate=false` 청크(대공종 '재해 사례' 133행):
- **분류 추천 모드 prefilter**: 후보에서 **배제**(일반 작업 입력을 재해사례로 오분류 방지, R6).
- **근거/few-shot 검색 모드**: **포함**(중대재해 7건 고가치 근거, GS-0005 등 partial refuse 응답 근거로 사용).
- `classification_priority=low`('공통 일반'·'기타공사'): 정공종 매칭 성립 시 후순위. 18개 정공종 우선.

### 1.3 추출 실패 처리

- prefilter 신호 추출 실패 → **prefilter 건너뜀**(전체 색인 대상 검색, recall 보호). low_confidence 가능성↑.
- 다중 sub_type 후보(예: "고소작업" → 비계·교각·철골 등) → `sub_type_id IN [...]` OR 필터로 확장(recall 우선).

### 1.4 혼동 쌍 주의 (taxonomy_review §2.2)

prefilter의 `accident_type` 필터는 LLM 분류 의도에 의존하므로, 혼동 쌍(전도↔붕괴↔도괴, 추락↔낙하)에서 과도하게 좁히지 않는다. **재해형태 필터는 강제 필터가 아닌 가중 신호**로 적용하고, 복합 작업은 다중 형태 허용(coverage 보호).

---

## 2. 하이브리드 검색 가중치 (STAGE 2)

| 구성 | 현재(PoC 베이스라인) | Phase 4 (dense 도입) |
|------|---------------------|---------------------|
| BM25 (kiwipiepy) | **weight 1.0 (단독)** | RRF 0.4 |
| Dense (BGE-M3) | OFF (stub) | RRF 0.6 |
| 융합 | 없음(BM25 순위 그대로) | RRF(Reciprocal Rank Fusion) |

> RRF 가중 0.4:0.6은 **베이스라인 가설**. eval-engineer가 `bm25_dense_weight` 스윕으로 확정. dense 도입은 인덱스 재구축 동반(`rag_embedding_choice.md §5`).

---

## 3. top_k (검색 후보 수)

| 파라미터 | 기본값 | 비고 |
|----------|:-----:|------|
| `top_k_retrieval` | **20** | STAGE 2 후보. dedup(dup_group/content_hash) 후 유효수 ≤20 |
| `top_k_final` | **5** | STAGE 3 후 컨텍스트에 넣는 청크 수. rerank OFF면 상위 5 컷 |

컨텍스트 5청크 근거: 동일 작업의 다중 위험요인(추락+낙하+협착 등)을 포괄하기 충분하면서 프롬프트·비용 절제. coverage 부족 시 eval에서 top_k_final 상향 검토.

---

## 4. Score Threshold (검색 게이트)

### 4.1 PoC(BM25) — 상대 임계 운영

BM25 raw score는 비정규화(쿼리별 스케일 상이: `타워크레인 해체`=15.92 vs `고소 용접`=8.72)라 **단일 절대 임계 부적합**. 베이스라인 게이트:

```
검색 0건                           → result_type = "no_match" (refuse)
top1 매칭 토큰 0개 (순수 noise)    → result_type = "no_match"
top1_score < 5.0 (약한 매칭)       → result_type = "low_confidence" (경고+후보 표시)
그 외                              → ok
```

> 임계 5.0은 초기값. eval-engineer가 gold set으로 `score_threshold`(BM25 모드 = top1 절대값) 스윕하여 confirm. precision↔recall 트레이드오프 보고.

### 4.2 Dense 도입 후 — 절대 cosine 임계

```
모든 cosine < 0.5  → low_confidence/no_match (SKILL 기준)
```
RRF 도입 시 score 의미가 rank-based로 바뀌므로 threshold 재정의(`rag_architecture.md §2`).

---

## 5. Rerank 도입 조건 (STAGE 3)

| 항목 | 결정 |
|------|------|
| PoC 베이스라인 | **rerank OFF** (20 → 상위 5 단순 컷) |
| 도입 트리거 | eval에서 rerank ON이 베이스라인 대비 **hazard coverage 또는 citation recall +3pt 이상** 개선 입증 |
| 후보 리랭커 | cross-encoder(온프레미스) / Cohere rerank / Voyage rerank. **온프레미스 cross-encoder 우선**(보안) |
| 도입 시 | backend 함수 시그니처 합의 + 재인덱싱 불요(쿼리타임 재순위) + eval 회귀 |

> rerank는 쿼리타임 연산이라 인덱스 재구축 불요. 다만 지연·비용 증가 → +3pt 가치 입증 전 미도입.

---

## 6. 평가 노출 Hyperparameter (eval-engineer 송신)

config 파일 + 환경변수로 노출. 코드 변경 없이 스윕 가능.

| 파라미터 | 기본값 | 스윕 범위(권장) |
|----------|:-----:|----------------|
| `top_k_retrieval` | 20 | 10 / 20 / 40 |
| `top_k_final` | 5 | 3 / 5 / 8 |
| `score_threshold` | BM25=5.0 / dense=0.5 | 3~7 / 0.4~0.6 |
| `bm25_dense_weight` | 1.0:0.0(PoC) → 0.4:0.6 | 0.5:0.5 / 0.4:0.6 / 0.3:0.7 |
| `use_dense` | false(PoC) | true(Phase 4) |
| `use_reranker` | false | true |
| `prefilter_mode` | "soft"(가중) | "hard"(강제 필터) / "off" |
| `model_id` | claude-sonnet-4-6 | claude-opus-4-7 |
| `use_extended_thinking` | conditional(confidence<0.7) | always / never |

### 베이스라인 vs 실험 변형 정의
- **B0 베이스라인**: BM25 단독, rerank OFF, prefilter soft, sonnet-4-6, thinking conditional.
- **E1**: + dense RRF 0.4:0.6.
- **E2**: B0 + rerank ON.
- **E3**: B0 + prefilter hard.
- **E4**: B0 + opus-4-7 always.
회귀 기준: 각 실험이 B0 대비 citation recall·hazard coverage·grade alignment에서 유의미 개선 시 채택.

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0 작성. prefilter 규칙(재해사례 제외 포함)·BM25 단독 가중·top_k 20→5·BM25 상대임계·rerank +3pt 조건·hyperparameter 노출 | Phase 2 Foundation Wave 2 |
