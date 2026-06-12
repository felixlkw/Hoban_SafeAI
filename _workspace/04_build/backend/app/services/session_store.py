"""세션 저장소 + 상태머신 — 인메모리 dict (PoC).

운영 전환: Redis(TTL 7일 활성) + PostgreSQL(audit) 로 교체. 본 인터페이스
(get/create/transition/save) 는 Redis 클라이언트와 호환되도록 동기 메서드로 설계.

session_state_machine.md §2 전이표를 코드로 강제. 허용되지 않은 전이는
InvalidStateTransition(409). 전이마다 audit 레코드 append.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.errors import InvalidStateTransition, SessionNotFound
from app.schemas.models import SessionState

# 허용 전이표 (session_state_machine.md §2). key=from, value=허용 to 집합
_ALLOWED: dict[SessionState, set[SessionState]] = {
    SessionState.CREATED: {SessionState.CLASSIFIED},
    SessionState.CLASSIFIED: {SessionState.CLASSIFIED, SessionState.ASSESSED,
                              SessionState.PENDING_REVIEW},
    SessionState.ASSESSED: {SessionState.ASSESSED, SessionState.PENDING_REVIEW,
                            SessionState.FINALIZED},
    SessionState.PENDING_REVIEW: {SessionState.REVIEWED, SessionState.PENDING_REVIEW,
                                  SessionState.ASSESSED},
    SessionState.REVIEWED: {SessionState.FINALIZED},
    SessionState.FINALIZED: {SessionState.REGISTERING},
    SessionState.REGISTERING: {SessionState.COMPLETED, SessionState.REGISTER_FAILED},
    SessionState.COMPLETED: set(),
    SessionState.REGISTER_FAILED: {SessionState.REGISTERING},  # 재시도 역방향 허용
}


@dataclass
class SessionRecord:
    session_id: str
    state: SessionState
    work_description: str
    owner_user_id: Optional[str] = None
    site_id: Optional[str] = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # 단계 결과(직렬화된 dict 로 저장 — Redis JSON 호환)
    classification: Optional[dict[str, Any]] = None
    assessment: Optional[dict[str, Any]] = None
    review: dict[str, Any] = field(default_factory=dict)
    erp: dict[str, Any] = field(default_factory=dict)
    audit: list[dict[str, Any]] = field(default_factory=list)
    idempotency_keys: dict[str, str] = field(default_factory=dict)


class SessionStore:
    """인메모리 세션 저장소 (Redis 인터페이스 호환 동기 메서드)."""

    def __init__(self) -> None:
        self._db: dict[str, SessionRecord] = {}

    def create(self, work_description: str, owner_user_id: Optional[str],
               site_id: Optional[str] = None) -> SessionRecord:
        sid = str(uuid.uuid4())
        rec = SessionRecord(session_id=sid, state=SessionState.CREATED,
                            work_description=work_description,
                            owner_user_id=owner_user_id, site_id=site_id)
        self._db[sid] = rec
        self._audit(rec, None, SessionState.CREATED, owner_user_id, "create")
        return rec

    def get(self, session_id: str) -> SessionRecord:
        rec = self._db.get(session_id)
        if rec is None:
            raise SessionNotFound(details={"session_id": session_id})
        return rec

    def get_or_none(self, session_id: str) -> Optional[SessionRecord]:
        return self._db.get(session_id)

    def can_transition(self, frm: SessionState, to: SessionState) -> bool:
        return to in _ALLOWED.get(frm, set())

    def transition(self, rec: SessionRecord, to: SessionState,
                   actor: Optional[str] = None, *, request_id: Optional[str] = None,
                   reason: str = "") -> SessionRecord:
        """상태 전이 — 비허용 시 409. audit 기록."""
        if to not in _ALLOWED.get(rec.state, set()):
            raise InvalidStateTransition(
                details={"current_state": rec.state.value, "attempted": to.value,
                         "reason": reason}
            )
        self._audit(rec, rec.state, to, actor, reason, request_id)
        rec.state = to
        return rec

    def save(self, rec: SessionRecord) -> None:
        """결과 저장 (Redis SET 대체). 인메모리는 참조 유지로 no-op 이지만 명시."""
        self._db[rec.session_id] = rec

    def _audit(self, rec: SessionRecord, frm: Optional[SessionState], to: SessionState,
               actor: Optional[str], reason: str, request_id: Optional[str] = None) -> None:
        rec.audit.append({
            "session_id": rec.session_id,
            "from_state": frm.value if frm else None,
            "to_state": to.value,
            "actor_user_id": actor,
            "reason": reason,
            "request_id": request_id,
            "ts": datetime.now(timezone.utc).isoformat(),
        })


# ── 싱글톤 ─────────────────────────────────────────────────────────────────
_store: Optional[SessionStore] = None


def get_store() -> SessionStore:
    global _store
    if _store is None:
        _store = SessionStore()
    return _store
