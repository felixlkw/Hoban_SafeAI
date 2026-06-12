# -*- coding: utf-8 -*-
"""
index.py - 호반 JHA PoC 인덱스 구축 스크립트 (data-engineer / Phase 2 Foundation)

입력 : _workspace/02_foundation/chunks.jsonl
출력 :
  - _workspace/02_foundation/bm25_index.pkl   (BM25 인덱스 + 토큰·메타)
  - _workspace/02_foundation/index_build_log.json  (토크나이저·통계·검색테스트 결과)

토크나이저 우선순위:
  1) kiwipiepy (한국어 형태소) — 설치/로드 성공 시 사용
  2) fallback: 공백 토큰 + 문자 bigram  (fallback 사용 시 로그에 명시)

Dense 임베딩(BGE-M3):
  - 인터페이스 stub 만 제공. 로컬 모델 다운로드(2GB+)가 무거워 Phase 2에서는 skip.
  - Phase 4 환경 구비 시 embed_dense() 활성화. skip 사유는 index_build_log.json 기록.

샘플 쿼리 3건 검색 테스트 후 top-5 를 로그에 기록.
재현: python _workspace/04_build/scripts/etl/index.py  (chunk.py 선행 필요)
"""
import io
import os
import re
import sys
import json
import pickle

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "_workspace", "02_foundation")
CHUNKS = os.path.join(OUT_DIR, "chunks.jsonl")
INDEX_PKL = os.path.join(OUT_DIR, "bm25_index.pkl")
LOG = os.path.join(OUT_DIR, "index_build_log.json")

SAMPLE_QUERIES = ["타워크레인 해체", "굴착 흙막이", "고소 용접"]


# ---------------- 토크나이저 ----------------
def make_tokenizer():
    """반환: (tokenizer_fn, name)"""
    try:
        from kiwipiepy import Kiwi
        kiwi = Kiwi()
        # 내용어 중심 품사만 추출 (명사/동사/형용사/외국어/한자/숫자)
        KEEP = {"NNG", "NNP", "NNB", "NR", "NP", "VV", "VA", "VX",
                "MAG", "SL", "SH", "SN", "XR"}

        def tok(text):
            toks = []
            for token in kiwi.tokenize(text):
                if token.tag in KEEP and len(token.form) >= 1:
                    toks.append(token.form)
            return toks

        # 로드 검증
        _ = tok("타워크레인 해체 작업")
        return tok, "kiwipiepy"
    except Exception as e:
        print(f"[WARN] kiwipiepy 사용 불가 ({e}) -> fallback(공백+bigram) 토크나이저 사용")

        def tok(text):
            # 공백/구두점 분리 + 한글 문자 bigram 보강
            words = re.findall(r"[가-힣A-Za-z0-9]+", text)
            out = []
            for w in words:
                out.append(w)
                if len(w) >= 2:
                    for i in range(len(w) - 1):
                        out.append(w[i:i+2])
            return out

        return tok, "fallback(whitespace+char_bigram)"


# ---------------- Dense 임베딩 stub ----------------
def embed_dense(texts, model_name="BAAI/bge-m3"):
    """
    Phase 2 STUB. Phase 4 에서 아래 주석 해제하여 활성화.
        from FlagEmbedding import BGEM3FlagModel
        model = BGEM3FlagModel(model_name, use_fp16=True)
        return model.encode(texts, batch_size=32)['dense_vecs']
    현재는 NotImplemented 로 skip 사유를 명확히 한다.
    """
    raise NotImplementedError(
        "BGE-M3 dense embedding은 Phase 2에서 skip (로컬 모델 ~2.3GB 다운로드 비용). "
        "Phase 4 온프레미스 GPU 환경 구비 시 embed_dense() 활성화 예정."
    )


def load_chunks():
    chunks = []
    with open(CHUNKS, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                chunks.append(json.loads(line))
    return chunks


def main():
    chunks = load_chunks()
    tok, tok_name = make_tokenizer()
    fallback_used = not tok_name.startswith("kiwipiepy")

    # BM25 토큰화 — 검색 대상은 메타 inline 텍스트 전체
    try:
        from rank_bm25 import BM25Okapi
    except Exception as e:
        raise SystemExit(f"[FATAL] rank_bm25 미설치: {e}. pip install rank_bm25")

    corpus_ids = [c["chunk_id"] for c in chunks]
    corpus_meta = [c["metadata"] for c in chunks]
    tokenized = [tok(c["text"]) for c in chunks]

    bm25 = BM25Okapi(tokenized)

    # ---- 인덱스 저장 ----
    payload = {
        "tokenizer": tok_name,
        "fallback_used": fallback_used,
        "chunk_ids": corpus_ids,
        "tokenized": tokenized,
        "metadata": corpus_meta,
        "texts": [c["text"] for c in chunks],
    }
    with open(INDEX_PKL, "wb") as fh:
        pickle.dump(payload, fh)

    # ---- 샘플 쿼리 검색 테스트 (top-5) ----
    def search(q, k=5):
        qtok = tok(q)
        scores = bm25.get_scores(qtok)
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
        res = []
        for rank, i in enumerate(ranked, 1):
            m = corpus_meta[i]
            res.append({
                "rank": rank,
                "chunk_id": corpus_ids[i],
                "score": round(float(scores[i]), 4),
                "source_row": m["source_row"],
                "major_type": m["major_type"],
                "sub_type": m["sub_type"],
                "detail_item": m["detail_item"],
                "accident_type": m["accident_type"],
                "risk_grade": m["risk_grade"],
                "hazard_preview": m["hazard_text"][:50],
            })
        return res

    search_results = {q: search(q, 5) for q in SAMPLE_QUERIES}

    # Dense stub 상태 기록
    dense_status = {"enabled": False}
    try:
        embed_dense(["test"])
        dense_status["enabled"] = True
    except NotImplementedError as e:
        dense_status["skip_reason"] = str(e)
    except Exception as e:
        dense_status["skip_reason"] = f"기타 오류: {e}"

    log = {
        "index_path": INDEX_PKL,
        "n_documents": len(chunks),
        "tokenizer": tok_name,
        "fallback_used": fallback_used,
        "avg_tokens_per_doc": round(sum(len(t) for t in tokenized) / len(tokenized), 1),
        "dense_embedding": dense_status,
        "sample_queries": SAMPLE_QUERIES,
        "search_results": search_results,
    }
    with open(LOG, "w", encoding="utf-8") as fh:
        json.dump(log, fh, ensure_ascii=False, indent=2)

    # ---- 콘솔 요약 ----
    print("=== INDEX SUMMARY ===")
    print(f"documents      = {len(chunks)}")
    print(f"tokenizer      = {tok_name}  (fallback={fallback_used})")
    print(f"avg_tokens/doc = {log['avg_tokens_per_doc']}")
    print(f"dense          = SKIP ({'enabled' if dense_status['enabled'] else 'stub'})")
    print(f"index          = {INDEX_PKL}")
    print(f"log            = {LOG}")
    print()
    for q in SAMPLE_QUERIES:
        print(f"--- query: '{q}' top-5 ---")
        for r in search_results[q]:
            print(f"  {r['rank']}. {r['chunk_id']} score={r['score']} "
                  f"[{r['major_type']}/{r['sub_type']}/{r['detail_item']}] "
                  f"({r['accident_type']},{r['risk_grade']}) :: {r['hazard_preview']}")
        print()


if __name__ == "__main__":
    main()
