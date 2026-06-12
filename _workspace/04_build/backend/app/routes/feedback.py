"""피드백 라우트 — POST /v1/jha/feedback.

추천 결과에 대한 사용자 수정/거절/수락 피드백 수집. eval-engineer 회귀 데이터셋·
gold set 보강 신호. PoC 는 인메모리 저장 + 로그(운영 시 PostgreSQL/이벤트 버스).
"""
from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends

from app.errors import SessionNotFound
from app.middleware.auth import Principal, get_principal
from app.schemas.models import FeedbackAck, FeedbackCreate
from app.services.session_store import get_store

logger = logging.getLogger("jha.routes.feedback")
router = APIRouter(prefix="/v1/jha", tags=["feedback"])

# 인메모리 피드백 저장(eval 흡수용). 운영: 영속 스토어.
_FEEDBACK: list[dict] = []


@router.post("/feedback", status_code=201, response_model=FeedbackAck)
def submit_feedback(body: FeedbackCreate,
                    principal: Principal = Depends(get_principal)) -> FeedbackAck:
    store = get_store()
    # 세션 존재 확인(없으면 404)
    if store.get_or_none(body.session_id) is None:
        raise SessionNotFound(details={"session_id": body.session_id})

    fid = f"fb-{uuid.uuid4()}"
    record = {
        "feedback_id": fid,
        "session_id": body.session_id,
        "user_id": principal.user_id,
        "action": body.action,
        "target": body.target,
        "hazard_index": body.hazard_index,
        "corrected_value": body.corrected_value,
        "comment": body.comment,
    }
    _FEEDBACK.append(record)
    logger.info("feedback 수집: %s action=%s target=%s", fid, body.action, body.target)
    return FeedbackAck(feedback_id=fid, accepted=True)
