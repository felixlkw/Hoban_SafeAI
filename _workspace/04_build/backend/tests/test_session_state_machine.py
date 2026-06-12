"""세션 상태머신 전이 + finalize 409 차단 테스트."""
from __future__ import annotations

import pytest

from app.errors import InvalidStateTransition
from app.schemas.models import SessionState
from app.services.session_store import SessionStore


def test_allowed_transition_path():
    store = SessionStore()
    rec = store.create("test work", "u1")
    assert rec.state == SessionState.CREATED
    store.transition(rec, SessionState.CLASSIFIED, "u1")
    store.transition(rec, SessionState.ASSESSED, "u1")
    store.transition(rec, SessionState.FINALIZED, "u1")
    store.transition(rec, SessionState.REGISTERING, "u1")
    store.transition(rec, SessionState.COMPLETED, "u1")
    assert rec.state == SessionState.COMPLETED
    # audit 기록 누적(create + 5 전이)
    assert len(rec.audit) == 6


def test_disallowed_transition_raises_409():
    store = SessionStore()
    rec = store.create("test", "u1")
    # CREATED → FINALIZED 직행 금지
    with pytest.raises(InvalidStateTransition) as ei:
        store.transition(rec, SessionState.FINALIZED, "u1")
    assert ei.value.http_status == 409


def test_pending_review_to_reviewed():
    store = SessionStore()
    rec = store.create("t", "u1")
    store.transition(rec, SessionState.CLASSIFIED, "u1")
    store.transition(rec, SessionState.PENDING_REVIEW, "u1")
    # PENDING_REVIEW → FINALIZED 직행 금지(REVIEWED 거쳐야)
    with pytest.raises(InvalidStateTransition):
        store.transition(rec, SessionState.FINALIZED, "u1")
    store.transition(rec, SessionState.REVIEWED, "u1")
    store.transition(rec, SessionState.FINALIZED, "u1")
    assert rec.state == SessionState.FINALIZED
