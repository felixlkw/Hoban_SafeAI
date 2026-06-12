"""Outbox 패턴 — 인메모리 큐 + 백오프 재시도.

erp_register_flow.md §1·§3·§4 정합:
  - finalize → Outbox 적재(원자, status=PENDING). idempotency_key = outbox_entry_id.
  - 워커가 비동기로 ErpAdapter.register_jha 호출. 결과 분기별 처리.
  - 지수 백오프 1·2·4·8s, 최대 N=5(config.OUTBOX_MAX_ATTEMPTS). 초과 시 FAILED.
  - 동일 idem 키는 재시도 전반에 동일 사용(중복 등록 방지).

운영 전환: 인메모리 → PostgreSQL outbox 테이블 + 별도 워커 프로세스(SKIP LOCKED 폴링).
본 PoC 는 동기 process_once()/drain() 로 테스트·데모 가능하게 한다.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from app import config
from app.adapters.erp_adapter import (ErpAdapter, ErpAuthError, ErpConflict,
                                     ErpFatal, ErpRetryable, get_erp_adapter)

logger = logging.getLogger("jha.outbox")


class OutboxStatus(str, Enum):
    PENDING = "PENDING"
    RETRYING = "RETRYING"
    REGISTERED = "REGISTERED"
    FAILED = "FAILED"


@dataclass
class OutboxEntry:
    entry_id: str
    session_id: str
    payload: dict[str, Any]
    status: OutboxStatus = OutboxStatus.PENDING
    attempts: int = 0
    erp_jha_id: Optional[str] = None
    last_error: Optional[str] = None
    next_attempt_after_s: float = 0.0   # 백오프 누적(관측용)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    @property
    def idempotency_key(self) -> str:
        """idempotency_key = outbox_entry_id (재시도 전반 동일)."""
        return self.entry_id


def _backoff_seconds(attempt: int) -> float:
    """지수 백오프 1·2·4·8s ... (attempt 0-indexed)."""
    return config.OUTBOX_BACKOFF_BASE_S * (2 ** attempt)


class OutboxWorker:
    """인메모리 Outbox + 동기 워커(PoC). 적재·처리·재시도를 한 클래스에 둔다."""

    def __init__(self, adapter: Optional[ErpAdapter] = None):
        self._adapter = adapter or get_erp_adapter()
        self._entries: dict[str, OutboxEntry] = {}
        self._queue: list[str] = []   # 처리 대기 entry_id (FIFO)

    # ── 적재 (finalize 단일 트랜잭션) ───────────────────────────────────────
    def enqueue(self, session_id: str, payload: dict[str, Any]) -> OutboxEntry:
        entry_id = f"outbox-{uuid.uuid4()}"
        entry = OutboxEntry(entry_id=entry_id, session_id=session_id, payload=payload)
        # payload 에 idempotency_key 주입(어댑터/ERP 가 소비)
        entry.payload = {**payload, "idempotency_key": entry_id}
        self._entries[entry_id] = entry
        self._queue.append(entry_id)
        logger.info("outbox enqueue: %s (session=%s)", entry_id, session_id)
        return entry

    def get(self, entry_id: str) -> Optional[OutboxEntry]:
        return self._entries.get(entry_id)

    def queue_position(self, entry_id: str) -> Optional[int]:
        """대기열 내 위치(1-indexed). 큐에 없으면 None."""
        try:
            return self._queue.index(entry_id) + 1
        except ValueError:
            return None

    # ── 단일 처리 ───────────────────────────────────────────────────────────
    def process_once(self, entry_id: str) -> OutboxEntry:
        """엔트리 1건을 1회 시도. 결과 분기별 status 갱신.

        Retryable → attempts++ , 한도 내면 RETRYING(재큐잉) / 초과면 FAILED.
        Conflict  → REGISTERED(기존 erp_jha_id 회수, 정상).
        Fatal/Auth→ FAILED(재시도 금지).
        """
        entry = self._entries[entry_id]
        if entry.status in (OutboxStatus.REGISTERED, OutboxStatus.FAILED):
            return entry  # 종료 상태 — 멱등

        entry.attempts += 1
        try:
            result = self._adapter.register_jha(entry.payload, entry.idempotency_key)
            entry.status = OutboxStatus.REGISTERED
            entry.erp_jha_id = result.erp_jha_id
            entry.last_error = None
            self._dequeue(entry_id)
            logger.info("outbox REGISTERED: %s → %s", entry_id, result.erp_jha_id)

        except ErpConflict as exc:
            # 정상 경로 — 기존 ID 회수
            entry.status = OutboxStatus.REGISTERED
            entry.erp_jha_id = exc.erp_jha_id
            entry.last_error = None
            self._dequeue(entry_id)
            logger.info("outbox CONFLICT(정상): %s → 기존 %s", entry_id, exc.erp_jha_id)

        except ErpRetryable as exc:
            entry.last_error = f"{exc.code}: {exc}"
            if entry.attempts >= config.OUTBOX_MAX_ATTEMPTS:
                entry.status = OutboxStatus.FAILED
                self._dequeue(entry_id)
                logger.error("outbox FAILED(재시도 한도 초과 N=%d): %s",
                             config.OUTBOX_MAX_ATTEMPTS, entry_id)
            else:
                entry.status = OutboxStatus.RETRYING
                entry.next_attempt_after_s += _backoff_seconds(entry.attempts - 1)
                logger.warning("outbox RETRYING(%d/%d, +%.0fs): %s",
                               entry.attempts, config.OUTBOX_MAX_ATTEMPTS,
                               _backoff_seconds(entry.attempts - 1), entry_id)

        except (ErpFatal, ErpAuthError) as exc:
            # 재시도 금지 — 즉시 FAILED + (운영팀 알림 hook 자리)
            entry.status = OutboxStatus.FAILED
            entry.last_error = f"{exc.code}: {exc}"
            self._dequeue(entry_id)
            logger.error("outbox FAILED(재시도 금지 %s): %s — %s",
                         exc.code, entry_id, exc)
        return entry

    # ── drain (재시도 한도까지 동기 반복 — 테스트/데모용) ────────────────────
    def drain(self, entry_id: str) -> OutboxEntry:
        """종료 상태(REGISTERED/FAILED)까지 동기 재시도.

        PoC 동기 모델: 실제 sleep 없이 백오프를 누적 기록만 하고 즉시 재시도.
        운영에서는 스케줄러가 next_attempt_after_s 만큼 지연 후 process_once.
        """
        entry = self._entries[entry_id]
        while entry.status not in (OutboxStatus.REGISTERED, OutboxStatus.FAILED):
            self.process_once(entry_id)
            if entry.attempts > config.OUTBOX_MAX_ATTEMPTS + 1:
                break  # 안전 가드(무한 루프 방지)
        return entry

    def _dequeue(self, entry_id: str) -> None:
        if entry_id in self._queue:
            self._queue.remove(entry_id)


# ── 싱글톤 ─────────────────────────────────────────────────────────────────
_worker: Optional[OutboxWorker] = None


def get_outbox() -> OutboxWorker:
    global _worker
    if _worker is None:
        _worker = OutboxWorker()
    return _worker
