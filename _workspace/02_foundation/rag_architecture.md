# RAG Architecture — JHA 검색·생성 파이프라인 전체 설계 (Foundation)

> 작성: rag-architect · Phase 2 (Foundation) Wave 2
> 근거: `jha-rag-design` SKILL + data-engineer 산출물(BM25 인덱스·청크·스키마) + safety-domain-expert 확정 명세(등급·인용·refuse·taxonomy)
> 상태: **PoC 베이스라인 = BM25 단독 검색** (kiwipiepy 인덱스 구축·검색 테스트 통과). Dense(BGE-M3)는 stub → Phase 4 활성화.
> 목적: 의도추출 → prefilter → 검색 → 컨텍스트 → Claude → 인용검증 → 도메인 후처리 → 응답의 단일 흐름도(SSOT). backend·eval·frontend·data-engineer가 공유하는 파이프라인 계약.

---

## 0. 핵심 설계 원칙 (우선순위)

1. **출처 없이는 답하지 않는다** — 모든 hazard/control에 `source_row`(chunk_id) 인용 필수. 누락 시 재생성→거절.
2. **단순 → 복잡** — 베이스라인은 BM25 단독. dense·rerank·tool use·HyDE는 eval에서 +가치 입증 시에만 도입.
3. **메타데이터 prefilter 우선** — semantic 검색 전에 결정적 필터로 검색공간 축소(4,469 → 수십). 비용·정확도 동시 이득.
4. **도메인 규칙은 코드가 강제, LLM은 추천만** — 등급 임계곱·경계셀 플래그·중점등록 종속·인용의무는 **백엔드 후처리에서 결정적으로 재계산/검증**. LLM 출력을 신뢰하지 않고 검산한다.
5. **모델 의존성 격리** — 임베딩·LLM·리랭커는 어댑터 인터페이스(`embed_dense()`·`llm_generate()`·`rerank()`)로 분리. 교체 비용 최소화.

---

## 1. 파이프라인 전체 흐름도 (텍스트)

```
[사용자 자연어 입력]  예: "5층 옥상에서 타워크레인 분해·해체 작업"
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 0. 입력 전처리 + 비작업 입력 게이트                      │
│  - 동의어 정규화(낙상→추락 등, taxonomy_review §2.2)          │
│  - 작업 설명 여부 판정(룰 + 짧은 LLM 분류). 비작업이면 refuse  │
│  - PII 스캔(현 데이터 PII 0건이나 입력단 방어)                 │
└─────────────────────────────────────────────────────────────┘
        │  (작업 입력으로 판정)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1. 의도 추출 + 메타데이터 PREFILTER                      │
│  - taxonomy_lookup(major/sub/detail.csv)와 매칭               │
│  - 매칭 신호 → 필터 필드 결정:                                 │
│      "타워크레인" → sub_type_id IN [SB001(T형),SB0xx(L형)]    │
│      "추락"/"해체" → accident_type / detail 힌트              │
│  - '재해 사례' 대공종(MJ, is_classification_candidate=false)  │
│      → 분류 모드 후보에서 배제 (근거 모드에서는 포함)          │
│  - 추출 실패 → prefilter 건너뜀(recall 보호, 전체 색인 검색)  │
│  출력: filter dict {sub_type_id?, accident_type?, ...}        │
└─────────────────────────────────────────────────────────────┘
        │  검색공간 4,469 → (예: 타워크레인) 43~86
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2. 하이브리드 검색                                       │
│  [현재/PoC]  BM25 단독 (kiwipiepy 토크나이저) · weight 1.0    │
│  [Phase 4]  BM25 + Dense(BGE-M3) RRF 융합 0.4:0.6            │
│  - prefilter 적용 후보 집합 내에서만 스코어링                  │
│  - top_k_retrieval = 20                                       │
│  출력: [(chunk_id, score, metadata)] × ≤20                   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3. (옵션) 재순위 RERANK                                  │
│  [PoC 기본 OFF]  20 → 그대로 상위 5 컷                        │
│  [도입 조건]  eval에서 rerank ON이 베이스라인 대비            │
│              hazard coverage 또는 citation recall +3pt↑      │
│  도입 시: cross-encoder/Cohere/Voyage → top_k_final = 5      │
│  출력: top_k_final = 5 청크                                   │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 4. 검색 결과 게이트 (LLM 호출 전 가드레일)              │
│  - 0건 → LLM 호출 안 함. result_type="no_match" 정형 응답    │
│  - 모든 score < threshold → low_confidence 경고 동반          │
│  - 갭 영역(밀폐공간/화학물질/석면) 탐지 → refuse 분기          │
│  (상세: rag_guardrails.md)                                    │
└─────────────────────────────────────────────────────────────┘
        │  (검색 유효)
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 5. 컨텍스트 구성 (프롬프트 조립)                         │
│  [system prompt]  ← cache breakpoint 1 (고정)                │
│  [few-shot 7건]   ← cache breakpoint 2 (고정)                │
│  [검색 결과 5청크 + 메타 inline]                              │
│  [사용자 입력]                                                │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 6. Claude 호출                                          │
│  - 기본: claude-sonnet-4-6 (temperature=0)                   │
│  - 분류 모호(confidence<0.7) 2차: claude-opus-4-7 + adaptive │
│    thinking (Opus는 temperature 미지원 → effort=low 결정성)  │
│  - JSON 스키마 출력 (jha_generation_template.md)             │
└─────────────────────────────────────────────────────────────┘
        │  raw JSON
        ▼
┌─────────────────────────────────────────────────────────────┐
│ STAGE 7. 응답 후처리 (백엔드 결정적 검증·재계산)              │
│  7-1 JSON 스키마 검증 → 실패 시 1회 재생성                    │
│  7-2 인용 검증: citations ⊆ retrieved chunk_ids              │
│       외부 인용 발견 → 1회 재생성 → 실패 시 거절             │
│  7-3 등급 재계산(코드): grade = f(severity,frequency)        │
│       하≤9 / 중10~15 / 상≥16  (LLM 등급과 불일치 시 코드 우선)│
│  7-4 경계셀: severity==4 AND frequency==4(곱16)              │
│       → boundary_cell_flag=true, human_review_required=true  │
│         grade="상"(보수적), critical_register="O (잠정)"     │
│  7-5 중점등록: critical_register = "O" iff grade=="상"        │
│       법정대상이나 등급 중/하 → legal_critical_candidate=true │
│  7-6 인용 의무 검증(legal_citation_matrix): 필수영역 누락     │
│       → 1회 재생성. 갭영역 → 조문표시+대책생성 차단          │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
[최종 응답 JSON] → frontend 렌더링 / ERP 등록 게이트
```

---

## 2. 베이스라인(BM25 단독) vs Dense 추가 시 변경점

본 PoC는 **STAGE 2를 BM25 단독으로 운영**한다. data-engineer 검증(`etl_pipeline.md §6`)에서 3개 샘플 쿼리 모두 의미적으로 정확한 top-5 회수 확인.

| 항목 | 현재 베이스라인 (BM25 단독) | Phase 4 Dense 추가 시 변경점 |
|------|---------------------------|------------------------------|
| 인덱스 | `bm25_index.pkl` (rank_bm25 BM25Okapi, kiwipiepy) | + BGE-M3 벡터 인덱스(Chroma PoC / Qdrant 운영). 전체 재인덱싱 동반 |
| 가중치 | BM25 1.0 | RRF BM25:Dense = 0.4:0.6 (eval 스윕으로 튜닝) |
| 스코어 의미 | BM25 raw score(비정규화, 쿼리별 스케일 상이) | RRF rank-based(정규화). **score_threshold 재정의 필요** |
| threshold | BM25는 절대 임계 부적합 → **상대 임계(top1 대비 비율) + 최소 토큰매칭** 사용 | cosine 0.5 등 절대 임계 사용 가능 |
| 비용 | 임베딩 비용 0, CPU only | BGE-M3 ~2.3GB 모델·GPU 권장. 인덱싱·쿼리 임베딩 비용 발생 |
| 도입 트리거 | — | eval에서 dense ON이 hazard coverage/citation recall에서 베이스라인 초과 입증 시 |
| 어댑터 | `retrieve_bm25()` | `embed_dense()` stub 활성화 + `retrieve_hybrid()` (data-engineer 협업·재인덱싱 task 필수) |

> **threshold 주의(BM25)**: BM25 score는 쿼리 길이·토큰빈도에 따라 절대값이 크게 달라(`타워크레인 해체`=15.92 vs `고소 용접`=8.72) 단일 절대 임계는 위험하다. PoC 베이스라인 게이트는 **(a) 검색 0건** + **(b) 상대 임계: top1 score가 최소 매칭 토큰 1개 이상 + top1 < 5.0이면 low_confidence** 로 운영하고, 절대 cosine 임계(0.5)는 dense 도입 후 적용한다. 정확 수치는 eval-engineer 스윕으로 확정(`rag_retrieval_spec.md §4`).

---

## 3. 모델 의존성 어댑터 인터페이스 (격리)

```
interface RetrieverAdapter:
    retrieve(query, filters, top_k) -> [(chunk_id, score, meta)]
      └ BM25RetrieverAdapter (현재)        : rank_bm25 + kiwipiepy
      └ HybridRetrieverAdapter (Phase 4)    : BM25 + DenseEmbedder, RRF

interface EmbedderAdapter:        # Phase 4 활성화
    embed(texts) -> vectors
      └ BGEM3Embedder (stub)

interface RerankerAdapter:        # 평가 입증 시
    rerank(query, candidates) -> reordered
      └ CrossEncoderReranker / CohereReranker / VoyageReranker

interface LLMAdapter:
    generate(system, fewshot, context, user, model, params) -> raw_json
      └ ClaudeAdapter (anthropic SDK)
```

교체 시 영향:
- Retriever/Embedder 교체 → **인덱스 재구축**(data-engineer, 비용 큼) + eval 회귀.
- LLM 교체 → 프롬프트 호환성 점검 + eval 회귀.
- Reranker 추가 → backend 함수 시그니처 합의 + eval +3pt 입증.

---

## 4. Claude API 설계 요약 (backend 송신)

| 항목 | 결정 |
|------|------|
| 기본 모델 | `claude-sonnet-4-6` (분류·추천 단순/대다수 케이스) |
| 모호 케이스 모델 | `claude-opus-4-7` (1차 confidence<0.7 또는 경계셀·갭 인접) |
| 평가 LLM-judge | `claude-opus-4-8` (최신 최상위, eval-engineer 사용) |
| temperature | **Sonnet 4.6 경로: `temperature=0`**(결정성). **Opus 4.7 경로: temperature 파라미터 미지원(400)** → 생략하고 adaptive thinking + `effort:"low"`로 결정성 확보 |
| thinking | Sonnet 4.6: 기본 off(단순). Opus 4.7: `thinking={"type":"adaptive"}` (모호 케이스 추론) |
| max_tokens | 4,000 (JSON 응답 충분, 스트리밍 불요). 평가 배치는 batches API 검토 |
| 출력 강제 | `output_config.format` json_schema (prefill 금지 — 4.6/4.7에서 prefill 400) |
| prompt caching | breakpoint 1 = system prompt 끝 / breakpoint 2 = few-shot 끝. 목표 적중률 >70% |
| tool use | **PoC 베이스라인 미사용**(single-shot). 분류 정확도 향상 입증 시 `search_jha_kb`/`classify_work`/`get_legal_citation` 도입(backend와 시그니처 합의) |

> **temperature=0 관련 정정(중요)**: 작업 지시의 "temperature=0"은 **Sonnet 4.6 기본 경로에 그대로 적용**한다. 그러나 `claude-opus-4-7`(및 4.8)은 `temperature`/`top_p`/`top_k`가 제거되어 전송 시 400 오류다. 따라서 **모호 케이스 Opus 경로는 temperature를 보내지 않고**, 결정성은 `output_config.effort:"low"` + adaptive thinking으로 확보한다. backend는 모델별 파라미터 분기를 둔다.

---

## 5. 컴포넌트별 송신 요약

| 대상 | 송신 |
|------|------|
| **data-engineer** | prefilter 인덱싱 키(major_type_id·sub_type_id·accident_type·risk_grade·critical_register) 확인. dense 도입 시 재인덱싱 task. is_classification_candidate 플래그 prefilter 반영 |
| **backend-engineer** | STAGE 6~7 호출 파라미터(§4), JSON 파싱·인용검증·등급 재계산·경계셀 플래그·refuse 분기 후처리 규약. 모델별 temperature 분기 |
| **eval-engineer** | 노출 hyperparameter(`rag_retrieval_spec.md §6`), 베이스라인=BM25 단독·rerank OFF·dense OFF, 실험 변형 정의 |
| **frontend-engineer** | 응답 JSON 스키마(`jha_generation_template.md`), 인용 표시·경계셀 배지·O(잠정) 표기 |

## 변경 이력
| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-10 | v1.0 최초 작성. BM25 단독 베이스라인 파이프라인, dense 변경점, 어댑터 격리, Claude API 설계(Opus temperature 미지원 분기 포함) | Phase 2 Foundation Wave 2 |
