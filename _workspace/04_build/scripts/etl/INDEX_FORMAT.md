# bm25_index.pkl 인덱스 포맷 명세 (data-engineer → backend kb_client 계약)

- 문서 ID: 04_build / scripts / etl / INDEX_FORMAT.md
- 작성: data-engineer · Phase 4 (Build)
- 대상 소비자: `backend/app/adapters/kb_client.py` (backend-engineer, 병렬 작업 중)
- 생성 스크립트: `_workspace/04_build/scripts/etl/index.py`
- 인덱스 경로: `_workspace/02_foundation/bm25_index.pkl`
- 빌드 로그: `_workspace/02_foundation/index_build_log.json`

> 작성 시점 backend `app/adapters/` 디렉토리 및 `kb_client.py` 부재 → 정합 확인 대신 본 명세를
> 단일 계약(source of truth)으로 제공. kb_client 구현 시 본 문서의 구조·시그니처를 따를 것.

---

## 1. 핵심 주의 — pkl 은 "토큰화된 코퍼스"이지 BM25 객체가 아니다

`index.py` 는 `BM25Okapi` 인스턴스를 **직렬화하지 않는다.** 대신 토큰화된 코퍼스(`tokenized`)와
메타/텍스트를 저장한다. **로딩 측(kb_client)이 `BM25Okapi(tokenized)` 를 재구성**해야 한다.
이유: (a) rank_bm25 객체 pickle 은 버전 의존성이 크고, (b) IDF 통계는 `tokenized` 로부터
결정적으로 재계산되므로 토큰만 보존하면 무손실 복원 가능.

쿼리도 **인덱스와 동일한 토크나이저**로 토큰화해야 점수가 일치한다(`tokenizer` 필드 확인).

---

## 2. pickle 최상위 구조 (dict)

```python
payload = {
    "tokenizer":     str,          # "kiwipiepy" | "fallback(whitespace+char_bigram)"
    "fallback_used": bool,         # kiwipiepy 로드 실패로 fallback 사용 시 True
    "chunk_ids":     list[str],    # 길이 N. 예: ["R00002", "R00003", ...]  (코퍼스 순서)
    "tokenized":     list[list[str]],  # 길이 N. 각 청크 text 의 토큰 리스트 (BM25 입력)
    "metadata":      list[dict],   # 길이 N. chunk_ids 와 동일 순서. §3 메타 필드
    "texts":         list[str],    # 길이 N. 청크 inline 텍스트 원문(인용·하이라이트용)
}
```

- 네 리스트(`chunk_ids` / `tokenized` / `metadata` / `texts`)는 **동일 길이·동일 순서**(positional join).
  i 번째 원소들이 같은 청크에 속한다.
- 현재 빌드: N = 4469, tokenizer = `kiwipiepy`, fallback_used = `False`.

---

## 3. metadata[i] 필드 (chunk.py §build 와 동기)

| 필드 | 타입 | 비고 |
|------|------|------|
| `chunk_id` | str | `R{source_row:05d}` (예: R00002). chunk_ids[i] 와 동일 |
| `content_hash` | str | SHA-256(text). 변경분 감지·중복 추적 키 (sync.py 가 소비) |
| `source_row` | int | 원본 Excel 행 번호 (lineage·인용 역추적) |
| `major_type_id` / `major_type` | str | 대공종 ID(MJ###) / 정규명 |
| `sub_type_id` / `sub_type` | str | 중공종 ID(SB###) / 정규명 |
| `detail_item_id` / `detail_item` | str | 세부항목 ID(DT####) / 정규명 |
| `accident_type` | str | 재해형태 |
| `severity` / `frequency` | int | 강도 1~5 / 빈도 1~5 |
| `risk_product` | int | severity × frequency |
| `risk_grade` | str | 상 / 중 / 하 (원본값) |
| `expected_grade` | str | 임계곱 역산 등급 |
| `grade_inconsistent` | bool | 원본 등급과 역산 등급 불일치 플래그(보정 안 함) |
| `critical_register` | str | 중점등록 O / X |
| `hazard_text` | str | 정규화 위험요인 |
| `hazard_items` | list[str] | 위험요인 분할 항목 |
| `controls` | str | 정규화 개선대책 |
| `controls_items` | list[str] | 개선대책 분할 항목 |
| `legal_refs` | list | 법령 매핑(Phase 후속에서 채움, 현재 []) |
| `dup_group` | str | 트리플 중복 그룹 ID(DG###) 또는 "" |
| `dup_content_of` | str | content_hash 동일 시 최초 chunk_id, 아니면 "" |
| `last_modified` | str | ISO8601 (원본 파일 기준일) |

메타 prefilter(대/중/세부/재해형태/등급/중점등록)는 위 필드로 수행한다(rag_retrieval_spec.md 정합).

---

## 4. kb_client 로딩·검색 예시 코드 (권장 구현)

```python
import pickle
from rank_bm25 import BM25Okapi

class Bm25KnowledgeBase:
    def __init__(self, index_path: str):
        with open(index_path, "rb") as fh:
            p = pickle.load(fh)
        self.tokenizer_name = p["tokenizer"]
        self.fallback_used  = p["fallback_used"]
        self.chunk_ids = p["chunk_ids"]
        self.metadata  = p["metadata"]
        self.texts     = p["texts"]
        self.bm25 = BM25Okapi(p["tokenized"])      # ★ 객체 재구성
        self._tok = self._make_tokenizer(self.tokenizer_name)

    def _make_tokenizer(self, name):
        # index.py 의 make_tokenizer() 와 동일 규칙을 사용해야 점수 일치.
        # name == "kiwipiepy" 이면 동일 KEEP 품사셋으로 kiwi 토큰화,
        # 아니면 fallback(정규식 단어 + 한글 bigram).  (index.py §make_tokenizer 복제)
        ...

    def search(self, query: str, k: int = 5, prefilter: dict | None = None):
        """
        반환: list[dict] = {chunk_id, score, text, metadata}
        prefilter: {"major_type": "...", "risk_grade": "상", ...} 메타 동치 필터(선택).
        """
        qtok = self._tok(query)
        scores = self.bm25.get_scores(qtok)
        idxs = range(len(scores))
        if prefilter:
            idxs = [i for i in idxs
                    if all(self.metadata[i].get(kk) == vv for kk, vv in prefilter.items())]
        ranked = sorted(idxs, key=lambda i: scores[i], reverse=True)[:k]
        return [{
            "chunk_id": self.chunk_ids[i],
            "score": float(scores[i]),
            "text": self.texts[i],
            "metadata": self.metadata[i],
        } for i in ranked]
```

검색 함수 시그니처 계약:
`search(query: str, k: int = 5, prefilter: dict | None = None) -> list[{chunk_id, score, text, metadata}]`

---

## 5. blue/green 교체 (sync.py 정합)

- PoC: `sync.py` 가 변경 발생 시 `index.py` 로 `bm25_index.pkl` 을 전량 재빌드.
- kb_client 는 인덱스 파일 mtime 변경을 감지해 핫 리로드하거나, backend 가 webhook
  으로 리로드 신호를 받는 구조를 권장(backend-engineer 결정). 로딩이 5초 미만(4,469건,
  BM25Okapi 재구성 포함)이라 PoC 에서는 프로세스 재시작 리로드로도 충분.
- 운영 alias-swap: green 을 `bm25_index.green.pkl` 로 빌드 → 스모크 통과 후 atomic rename.
  (DENSE_ACTIVATION.md 및 erp_etl_pipeline.md §4 참조)

---

## 6. 버전·호환 주의

- `tokenized` 만 보존하므로 rank_bm25 마이너 버전 차이에 강함. 단, BM25 파라미터
  (k1=1.5, b=0.75 기본)는 양측 동일해야 점수 재현. index.py 는 기본값 사용 → kb_client 도
  `BM25Okapi(tokenized)` 기본 생성자 사용(파라미터 미지정).
- kiwipiepy 미설치 환경에서 인덱스(`fallback_used=True`)를 빌드했다면 kb_client 도 동일
  fallback 토크나이저를 써야 한다. `tokenizer` 필드로 분기.
