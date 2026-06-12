"""자동 재인덱싱 파이프라인 — 변이 → 디바운스 → 백그라운드 재빌드 → 핫스왑.

흐름(INDEX_FORMAT.md · sync.py 정합):
  KB 변이 발생 → schedule()(디바운스 타이머 reset) → 타이머 만료 시
  활성 행 전체 조회 → chunk.py 동일 포맷 텍스트 재생성 → kiwipiepy 토큰화
  → BM25Okapi 재구축(_IndexSnapshot.build) → kb_client.swap()(원자적 핫스왑).

원자적 교체이므로 진행 중 검색은 구 인덱스를 끝까지 사용(무중단). 실패 시 구 인덱스
유지(다운 없음) + 에러 로그. 변경 비율 >5% 시 regression_recommended=true(sync.py 정합).

상태: idle / pending(디바운스 대기) / running. index_version 증가 카운터.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

from app import config
from app.adapters.kb_client import batch_tokenize, build_tokenizer, get_kb
from app.services import kb_store
from app.services.kb_store import build_chunk_text, get_kb_store

logger = logging.getLogger("jha.reindex")


@dataclass
class ReindexState:
    status: str = "idle"                 # idle | pending | running
    index_version: int = 0
    last_reindex_at: Optional[str] = None
    doc_count: int = 0
    last_duration_ms: Optional[float] = None
    last_change_ratio: float = 0.0
    regression_recommended: bool = False
    last_error: Optional[str] = None
    reindex_count: int = 0


class Reindexer:
    """디바운스 + 백그라운드 재인덱싱 오케스트레이터(스레드 기반, PoC)."""

    def __init__(self, debounce_s: Optional[float] = None) -> None:
        self.debounce_s = (config.REINDEX_DEBOUNCE_S if debounce_s is None
                           else debounce_s)
        self._lock = threading.RLock()
        self._timer: Optional[threading.Timer] = None
        self._stopped = False               # shutdown 후 신규 스케줄 차단
        self.state = ReindexState()
        # 시드 인덱스 버전을 기준선으로
        kb = get_kb()
        self.state.index_version = kb.version
        self.state.doc_count = kb.doc_count

    # ── 디바운스 스케줄 ──────────────────────────────────────────────────
    def schedule(self) -> None:
        """변이 발생 시 호출. 디바운스 타이머 reset(연속 변이 묶음).

        threading.Timer 는 daemon 으로 띄워 프로세스 종료를 막지 않는다(테스트/CLI
        에서 미정리 타이머가 남아도 인터프리터 종료 hang 없음). busy-wait 없음 —
        Timer 내부가 Event.wait(interval) 기반이라 CPU spinning 도 없다.
        """
        with self._lock:
            if self._stopped:
                logger.info("reindexer stopped — schedule 무시")
                return
            if self._timer is not None:
                self._timer.cancel()
            self.state.status = "pending"
            self._timer = threading.Timer(self.debounce_s, self._run_safe)
            self._timer.daemon = True
            self._timer.name = "jha-reindex-debounce"
            self._timer.start()
        logger.info("reindex scheduled (debounce=%.1fs)", self.debounce_s)

    def flush(self, timeout: float = 30.0) -> None:
        """대기 중 재인덱싱을 즉시 실행하고 완료까지 대기(테스트·수동 트리거)."""
        with self._lock:
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
        self._run_safe()

    def shutdown(self) -> None:
        """워커/타이머 정리 — FastAPI lifespan(shutdown)·테스트 teardown 에서 호출.

        대기 중 디바운스 타이머를 취소하고 신규 스케줄을 차단한다. 이미 실행 중인
        재인덱싱(daemon 스레드)은 짧게 완료되며 종료를 막지 않는다.
        """
        with self._lock:
            self._stopped = True
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
            self.state.status = "idle"
        logger.info("reindexer shutdown — 타이머 취소·신규 스케줄 차단")

    def reindex_now(self) -> ReindexState:
        """디바운스 없이 동기 재인덱싱(수동 트리거 POST /reindex)."""
        self._run_safe()
        return self.state

    # ── 재인덱싱 본체 ────────────────────────────────────────────────────
    def _run_safe(self) -> None:
        try:
            self._run()
            self.state.last_error = None
        except Exception as exc:  # noqa: BLE001
            # 실패 시 구 인덱스 유지(swap 안 함) — 다운 없음
            self.state.status = "idle"
            self.state.last_error = str(exc)
            logger.error("reindex 실패 — 구 인덱스 유지: %s", exc)

    def _run(self) -> None:
        with self._lock:
            self.state.status = "running"
        t0 = time.time()

        store = get_kb_store()
        kb = get_kb()
        prev_count = kb.doc_count

        rows = store.active_rows()
        chunk_ids = [r["chunk_id"] for r in rows]
        texts = [build_chunk_text(r) for r in rows]
        # 메타: 재인덱싱은 content_hash 갱신(텍스트 기준) 보장
        metadatas = []
        for r, txt in zip(rows, texts):
            m = dict(r)
            m["content_hash"] = kb_store.sha256(txt)
            metadatas.append(m)

        tokenizer_name = kb.tokenizer_name if kb.tokenizer_name != "unloaded" \
            else "kiwipiepy"
        tokenize = build_tokenizer(tokenizer_name)
        # 배치 토큰화(전체 활성행) — per-call 대비 ~100배(재인덱싱 핵심 최적화)
        tokenized = batch_tokenize(tokenizer_name, texts)

        new_version = self.state.index_version + 1
        snap = kb.build_snapshot(new_version, tokenizer_name, chunk_ids, texts,
                                 metadatas, tokenized, tokenize=tokenize)

        # ── 핫스왑(원자적) ──
        kb.swap(snap)

        # 변경 비율(직전 doc_count 대비 행수 변동 근사 — sync.py change_ratio 정합)
        denom = max(prev_count, 1)
        change = abs(len(chunk_ids) - prev_count) / denom

        dur_ms = round((time.time() - t0) * 1000, 1)
        with self._lock:
            self.state.status = "idle"
            self.state.index_version = new_version
            self.state.doc_count = len(chunk_ids)
            self.state.last_reindex_at = kb_store.now_iso()
            self.state.last_duration_ms = dur_ms
            self.state.last_change_ratio = round(change, 4)
            self.state.regression_recommended = change > config.CHANGE_RATIO_THRESHOLD
            self.state.reindex_count += 1
        logger.info("reindex 완료: v%d docs=%d %.1fms change_ratio=%.4f regression=%s",
                    new_version, len(chunk_ids), dur_ms, change,
                    self.state.regression_recommended)


# ── 싱글톤 ─────────────────────────────────────────────────────────────────────
_reindexer: Optional[Reindexer] = None


def get_reindexer() -> Reindexer:
    global _reindexer
    if _reindexer is None:
        _reindexer = Reindexer()
    return _reindexer


def reset_reindexer() -> None:
    global _reindexer
    if _reindexer is not None:
        # 타이머 취소 + 신규 스케줄 차단(미정리 daemon 타이머가 다음 테스트로 누수 방지)
        _reindexer.shutdown()
    _reindexer = None
