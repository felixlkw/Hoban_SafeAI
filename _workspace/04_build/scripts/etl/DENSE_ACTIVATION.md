# DENSE_ACTIVATION.md — BGE-M3 Dense 임베딩 활성화 절차

- 문서 ID: 04_build / scripts / etl / DENSE_ACTIVATION.md
- 작성: data-engineer · Phase 4 (Build)
- 결정 근거: `_workspace/02_foundation/rag_embedding_choice.md` (rag-architect, **BGE-M3 선정**)
- 검색 설계: `_workspace/02_foundation/rag_retrieval_spec.md` (BM25 + Dense 하이브리드, RRF 병합)
- 현 상태: **PoC 베이스라인 = BM25 단독.** dense 는 `index.py` 에 stub(`embed_dense()`)으로만 존재.

> 본 문서는 dense 를 켤 때 그대로 따라 실행할 절차서다. dense 활성화는 청크 텍스트
> 포맷을 바꾸지 않으므로(임베딩만 추가) BM25 인덱스는 영향 없음. 단 **검색 결과가
> 바뀌므로 회귀 평가가 의무**다(§5).

---

## 1. 전제 조건 / 리소스

| 항목 | 요구 |
|------|------|
| 모델 | `BAAI/bge-m3` (MIT, 온프레미스) ~2.3GB 다운로드 |
| 라이브러리 | `FlagEmbedding`(또는 `sentence-transformers`), `torch`, `faiss-cpu`(또는 numpy) |
| 하드웨어 | GPU 권장(없으면 CPU 가능, 4,469건 인코딩 CPU ~수십 분 / GPU ~1~3분) |
| 차원 | 1024 (dense) |
| 보안 | 온프레미스 로컬 구동 → 안전 DB 외부 전송 없음(화이트리스트 정합). 외부 API 사용 금지 |
| 디스크 | 임베딩 행렬 4,469 × 1024 × 4B ≈ 18MB(npy) + faiss 인덱스 소량 |

설치 예:
```bash
pip install -U FlagEmbedding faiss-cpu        # GPU: faiss-gpu
# 모델은 최초 encode 시 자동 다운로드(HF 캐시). 폐쇄망은 사전 다운로드 후 로컬 경로 지정.
```

---

## 2. 활성화 절차 (단계별)

### 2.1 embed 스크립트 작성 — `scripts/etl/embed.py` (신규)
- 입력: `02_foundation/chunks.jsonl` (text + metadata)
- 처리: `index.py` stub 의 `embed_dense()` 본문을 실제 구현으로 교체:
  ```python
  from FlagEmbedding import BGEM3FlagModel
  model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)
  vecs = model.encode(texts, batch_size=32, max_length=512)["dense_vecs"]  # (N,1024)
  ```
- 출력:
  - `02_foundation/dense_vectors.npy` (N×1024, float32, chunk_ids 순서 보존)
  - `02_foundation/dense_index.faiss` (IndexFlatIP, 정규화 후 내적=코사인)
  - `02_foundation/dense_build_log.json` (모델·차원·건수·소요·정규화 여부)
- 실패 처리(기존 규약 유지): 모델 호출 실패 시 1회 재시도, 재실패 청크는 누락 + 누락 ID 로그.

### 2.2 인덱스 통합 — kb_client(dense 경로 추가)
- `INDEX_FORMAT.md` 의 BM25 로더 옆에 dense 로더 추가:
  - `dense_vectors.npy` + `dense_index.faiss` 로드, `chunk_ids` 는 BM25 와 **동일 순서**여야 함
    (둘 다 `chunks.jsonl` 순서 기준 → positional join 유지).
- 메타 prefilter 는 BM25 와 동일하게 적용(faiss 검색 후 메타 필터 또는 사전 후보 한정).

### 2.3 RRF 병합 (BM25 ⊕ Dense)
- `rag_retrieval_spec.md` 의 하이브리드 정의대로 Reciprocal Rank Fusion:
  ```
  score_rrf(d) = Σ_r  1 / (k + rank_r(d))        # k=60 권장(rag_retrieval_spec.md 값 확인)
  r ∈ {bm25, dense}
  ```
- 각 검색기에서 top-M(예: 50) 후보를 받아 rank 기반 융합 → 최종 top-K 반환.
- 동점·결측(한쪽 검색기에 미존재) 처리: 미존재는 해당 항의 기여 0(혹은 매우 큰 rank).

### 2.4 sync.py 부분 재임베딩 연동
- `sync.py` 가 산출하는 `chunks_diff.jsonl`(added/changed/removed)을 소비해
  **변경분만 재임베딩**:
  - added/changed: 해당 chunk_id 만 `model.encode` → npy/faiss 갱신(faiss 는 remove+add).
  - removed: faiss 에서 해당 벡터 제거.
- Dense 는 IDF 전역 의존이 없어 **진짜 부분 재인덱싱이 가능**(BM25 와 달리 전량 재빌드 불필요).
  → erp_etl_pipeline.md §4 "텍스트 포맷 변경 시 전체 재임베딩"은 포맷 변경에 한함.

---

## 3. 예상 소요 / 리소스 요약

| 작업 | GPU | CPU |
|------|-----|-----|
| 모델 1회 다운로드(~2.3GB) | 네트워크 의존(수 분) | 동일 |
| 전체 4,469건 인코딩 | ~1~3분 | ~20~60분 |
| 변경분 재임베딩(수십~수백 건) | 수 초 | 수십 초 |
| faiss IndexFlatIP 빌드/검색 | 즉시(소규모) | 즉시 |

---

## 4. alias-swap (blue/green, dense 포함)

- dense 활성화 후 인덱스 자산: `bm25_index.pkl` + `dense_vectors.npy` + `dense_index.faiss`.
- green 빌드 → 3종 모두 `.green` 접미 경로에 생성 → 스모크(하이브리드 검색 3 샘플) 통과 후
  atomic rename 으로 일괄 교체. 한 자산만 swap 되는 부분 교체 금지(정합 깨짐).

---

## 5. 활성화 시 회귀 평가 의무 (필수)

dense 추가는 검색 순위를 바꾸므로 **eval-engineer 회귀 평가 통과 전 운영 alias 교체 금지.**
- 트리거: rag-architect 합의 + eval-engineer 에게 회귀 요청(`04_build/eval/runner.py`).
- 비교: BM25 단독(baseline) vs BM25+Dense RRF. 메트릭은 검색 recall@k · citation precision/recall ·
  분류 정확도(rag_retrieval_spec.md / eval_plan.md 정의) 회귀 게이트(`regression_gates.yaml`) 충족.
- 게이트 미달 시: RRF 가중치·k·후보 M 재튜닝 또는 dense 보류(BM25 단독 유지).
- 본 절차는 erp_etl_pipeline.md §4 "텍스트 포맷 변경 = 부분 재인덱싱 예외 + 회귀 필수"와 정합.

---

## 6. 체크리스트

- [ ] `FlagEmbedding`/`torch`/`faiss` 설치, `BAAI/bge-m3` 로컬 확보(폐쇄망 사전 다운로드)
- [ ] `embed.py` 작성 → dense_vectors.npy / dense_index.faiss / dense_build_log.json 생성
- [ ] chunk_ids 순서 BM25 와 일치 검증(positional join)
- [ ] kb_client dense 로더 + RRF 병합 구현(`rag_retrieval_spec.md` k 값 적용)
- [ ] sync.py ↔ chunks_diff.jsonl 부분 재임베딩 경로 연결
- [ ] eval 회귀 통과 후 green→blue alias swap
