"""KB 검색 클라이언트 — BM25 인덱스(data-engineer 자산) 로드·검색 + 무중단 핫스왑.

- 시드 인덱스: _workspace/02_foundation/bm25_index.pkl
  {tokenizer, fallback_used, chunk_ids[], tokenized[], metadata[], texts[]}
- 토크나이저: kiwipiepy(인덱스와 동일). 미설치 시 graceful 공백 토큰화 경고 fallback.
- prefilter: taxonomy 메타(major/sub id) 기반 후보 제한.

핫스왑(무중단 재인덱싱):
  검색에 필요한 모든 상태를 불변 스냅샷(_IndexSnapshot)에 담고, KbClient 는 그
  스냅샷 1개를 참조한다. reindex 가 새 스냅샷을 만들어 `swap()` 으로 단일 참조를
  원자적 교체(Python 참조 대입은 GIL 하 원자적)하므로, 교체 직전에 시작된 검색은
  여전히 구 스냅샷을 끝까지 사용한다(읽기 일관성). 진행 중 검색 中断 없음.
"""
from __future__ import annotations

import logging
import pickle
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app import config

logger = logging.getLogger("jha.kb")


@dataclass
class RetrievedChunk:
    chunk_id: str
    text: str
    metadata: dict[str, Any]
    score: float = 0.0


# index.py make_tokenizer 와 동일 KEEP 품사셋(내용어 중심)
_KEEP_POS = {"NNG", "NNP", "NNB", "NR", "NP", "VV", "VA", "VX",
             "MAG", "SL", "SH", "SN", "XR"}

# Kiwi 인스턴스 캐시 — 초기화 ~0.9s 라 재인덱싱마다 재생성하면 비용 폭증.
# kiwipiepy.Kiwi 는 C++ 확장으로 동일 인스턴스에 대한 concurrent tokenize 가
# thread-safe 하지 않다(재인덱싱 스레드 + 다중 검색 스레드 동시 호출 시 네이티브
# 데드락 위험). 단일 Lock 으로 tokenize 호출을 직렬화한다(PoC 검색량 충분).
_KIWI = None
_KIWI_LOCK = threading.Lock()


def _get_kiwi():
    global _KIWI
    if _KIWI is None:
        with _KIWI_LOCK:
            if _KIWI is None:
                from kiwipiepy import Kiwi
                _KIWI = Kiwi()
    return _KIWI


# ── 토크나이저 빌더 (index.py make_tokenizer 와 동일 규칙) ─────────────────────
def build_tokenizer(name: str) -> Callable[[str], list[str]]:
    """인덱스 토크나이저 재현. kiwipiepy 미설치 시 graceful fallback.

    재인덱싱(reindex.py)도 동일 토크나이저를 써야 점수가 일치하므로 모듈 공개 함수.
    Kiwi 인스턴스는 캐시(_get_kiwi)하여 재인덱싱마다 재초기화 비용을 제거한다.
    """
    if name == "kiwipiepy":
        try:
            kiwi = _get_kiwi()

            def _kiwi_tok(s: str) -> list[str]:
                with _KIWI_LOCK:   # concurrent tokenize 직렬화(네이티브 데드락 방지)
                    toks = kiwi.tokenize(s)
                return [t.form for t in toks
                        if t.tag in _KEEP_POS and len(t.form) >= 1]
            _ = _kiwi_tok("타워크레인 해체")  # 로드 검증
            return _kiwi_tok
        except Exception:  # noqa: BLE001
            logger.warning(
                "kiwipiepy 미설치 — 공백 토큰화 fallback. 검색 품질이 인덱스와 "
                "불일치할 수 있습니다(데모/테스트 한정)."
            )
    return lambda s: s.replace("\n", " ").split()


def batch_tokenize(name: str, texts: list[str]) -> list[list[str]]:
    """문서 리스트 일괄 토큰화 — 재인덱싱 전용 고속 경로.

    kiwipiepy 는 리스트 입력 시 내부 병렬 배치 처리로 per-call 대비 ~100배 빠르다
    (150행 1.6s → 0.01s). 재인덱싱이 전체 활성행을 토큰화하므로 필수 최적화.
    fallback(미설치) 시 build_tokenizer 의 단건 토크나이저로 맵핑.
    """
    if not texts:
        return []
    if name == "kiwipiepy":
        try:
            kiwi = _get_kiwi()
            out: list[list[str]] = []
            with _KIWI_LOCK:   # 배치 토큰화도 동일 인스턴스 직렬화
                batched = list(kiwi.tokenize(texts))   # 리스트 입력 → 배치 처리
            for toks in batched:
                out.append([t.form for t in toks
                            if t.tag in _KEEP_POS and len(t.form) >= 1])
            return out
        except Exception:  # noqa: BLE001
            logger.warning("kiwipiepy 배치 토큰화 실패 — 단건 fallback")
    tok = build_tokenizer(name)
    return [tok(t) for t in texts]


# ── 불변 인덱스 스냅샷 (핫스왑 단위) ──────────────────────────────────────────
@dataclass(frozen=True)
class _IndexSnapshot:
    version: int
    tokenizer_name: str
    chunk_ids: tuple[str, ...]
    texts: tuple[str, ...]
    metadatas: tuple[dict[str, Any], ...]
    bm25: Any
    tokenize: Callable[[str], list[str]]
    by_row: dict[int, dict[str, Any]]
    by_chunk: dict[str, int]
    doc_count: int

    @classmethod
    def build(cls, version: int, tokenizer_name: str, chunk_ids: list[str],
              texts: list[str], metadatas: list[dict[str, Any]],
              tokenized: list[list[str]],
              tokenize: Optional[Callable[[str], list[str]]] = None) -> "_IndexSnapshot":
        from rank_bm25 import BM25Okapi  # 지연 import
        bm25 = BM25Okapi(tokenized) if tokenized else None
        by_chunk = {cid: i for i, cid in enumerate(chunk_ids)}
        by_row: dict[int, dict[str, Any]] = {}
        for m in metadatas:
            row = m.get("source_row")
            if row is not None:
                by_row[int(row)] = m
        return cls(
            version=version,
            tokenizer_name=tokenizer_name,
            chunk_ids=tuple(chunk_ids),
            texts=tuple(texts),
            metadatas=tuple(metadatas),
            bm25=bm25,
            tokenize=tokenize or build_tokenizer(tokenizer_name),
            by_row=by_row,
            by_chunk=by_chunk,
            doc_count=len(chunk_ids),
        )


@dataclass
class KbClient:
    """BM25 검색 클라이언트. 프로세스 1회 로드 후 인메모리 검색 + 핫스왑."""

    _snap: Optional[_IndexSnapshot] = None
    loaded: bool = False
    degraded: bool = False

    def load(self) -> "KbClient":
        """시드 인덱스(pkl) 적재. 실패 시 degraded 표시(헬스 체크 반영)."""
        try:
            with open(config.BM25_INDEX_PATH, "rb") as f:
                idx = pickle.load(f)
            snap = _IndexSnapshot.build(
                version=1,
                tokenizer_name=idx.get("tokenizer", "whitespace"),
                chunk_ids=list(idx["chunk_ids"]),
                texts=list(idx["texts"]),
                metadatas=list(idx["metadata"]),
                tokenized=list(idx["tokenized"]),
            )
            self._snap = snap
            self.loaded = True
            self.degraded = False
            logger.info("kb_index loaded: %d chunks (tokenizer=%s)",
                        snap.doc_count, snap.tokenizer_name)
        except Exception as exc:  # noqa: BLE001
            self.degraded = True
            logger.error("kb_index load 실패 — degraded 모드: %s", exc)
        return self

    # ── 핫스왑 ──────────────────────────────────────────────────────────
    def swap(self, snap: _IndexSnapshot) -> None:
        """새 스냅샷으로 원자적 교체(단일 참조 대입). 진행 중 검색은 구 스냅샷 유지."""
        prev = self._snap
        self._snap = snap          # ← 원자적 교체 지점
        self.loaded = True
        self.degraded = snap.bm25 is None
        logger.info("kb_index hot-swapped: v%s→v%s (docs=%d)",
                    getattr(prev, "version", "?"), snap.version, snap.doc_count)

    def build_snapshot(self, version: int, tokenizer_name: str,
                       chunk_ids: list[str], texts: list[str],
                       metadatas: list[dict[str, Any]],
                       tokenized: list[list[str]],
                       tokenize: Optional[Callable[[str], list[str]]] = None) -> _IndexSnapshot:
        return _IndexSnapshot.build(version, tokenizer_name, chunk_ids, texts,
                                    metadatas, tokenized, tokenize)

    @property
    def version(self) -> int:
        return self._snap.version if self._snap else 0

    @property
    def doc_count(self) -> int:
        return self._snap.doc_count if self._snap else 0

    @property
    def tokenizer_name(self) -> str:
        return self._snap.tokenizer_name if self._snap else "unloaded"

    # ── 검색 ────────────────────────────────────────────────────────────
    def search(self, query: str, top_k: int = 20,
               prefilter_sub_ids: Optional[list[str]] = None,
               prefilter_major_ids: Optional[list[str]] = None) -> list[RetrievedChunk]:
        """BM25 검색 + 메타 prefilter. degraded 시 빈 결과(가드레일 G1 no_match).

        스냅샷을 로컬 변수로 고정한 뒤 그 스냅샷만 사용 → 검색 도중 swap 이 일어나도
        일관된 결과 보장(무중단).
        """
        snap = self._snap
        if not self.loaded or snap is None or snap.bm25 is None:
            logger.warning("kb degraded — 빈 검색 결과 반환")
            return []

        tokens = snap.tokenize(query)
        if not tokens:
            return []
        scores = snap.bm25.get_scores(tokens)

        allow: Optional[set[int]] = None
        if prefilter_sub_ids or prefilter_major_ids:
            allow = set()
            sub_set = set(prefilter_sub_ids or [])
            maj_set = set(prefilter_major_ids or [])
            for i, m in enumerate(snap.metadatas):
                if (sub_set and m.get("sub_type_id") in sub_set) or \
                   (maj_set and m.get("major_type_id") in maj_set):
                    allow.add(i)

        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)
        out: list[RetrievedChunk] = []
        for i in ranked:
            if allow is not None and i not in allow:
                continue
            if scores[i] <= 0:
                break
            out.append(RetrievedChunk(snap.chunk_ids[i], snap.texts[i],
                                      snap.metadatas[i], float(scores[i])))
            if len(out) >= top_k:
                break
        return out

    # ── 인용 조회 ───────────────────────────────────────────────────────
    def get_by_source_row(self, source_row: int) -> Optional[dict[str, Any]]:
        snap = self._snap
        return snap.by_row.get(int(source_row)) if snap else None

    def get_text_by_chunk(self, chunk_id: str) -> Optional[str]:
        snap = self._snap
        if snap is None:
            return None
        i = snap.by_chunk.get(chunk_id)
        return snap.texts[i] if i is not None else None

    def get_meta_by_chunk(self, chunk_id: str) -> Optional[dict[str, Any]]:
        snap = self._snap
        if snap is None:
            return None
        i = snap.by_chunk.get(chunk_id)
        return snap.metadatas[i] if i is not None else None

    def chunk_to_source_row(self, chunk_id: str) -> Optional[int]:
        snap = self._snap
        if snap is None:
            return None
        i = snap.by_chunk.get(chunk_id)
        if i is None:
            return None
        return snap.metadatas[i].get("source_row")


# ── 싱글톤 ─────────────────────────────────────────────────────────────────
_kb: Optional[KbClient] = None


def get_kb() -> KbClient:
    global _kb
    if _kb is None:
        _kb = KbClient().load()
    return _kb


def reset_kb() -> None:
    """테스트·재시드용 싱글톤 리셋."""
    global _kb
    _kb = None
