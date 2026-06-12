"""세션 라우트 — 다단계 워크플로우(분류→평가→검토→확정).

엔드포인트:
  POST /v1/jha/sessions                  세션 생성(CREATED)
  POST /v1/jha/sessions/{id}/classify    분류 추천(→CLASSIFIED)
  POST /v1/jha/sessions/{id}/assess      위험성평가(→ASSESSED|PENDING_REVIEW)
  POST /v1/jha/sessions/{id}/review      안전관리자 확정(PENDING_REVIEW→REVIEWED) [safety_manager 전용]
  POST /v1/jha/sessions/{id}/finalize    ERP 등록 큐잉(→FINALIZED→REGISTERING) [human_review 미해소 409]
  GET  /v1/jha/sessions/{id}             세션 통합 조회

상태머신은 session_store 가 강제(비허용 전이 409). finalize 전 human_review 게이트(G1).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, Path

from app.errors import ReviewRequired, ValidationFailed
from app.middleware.auth import Principal, get_principal
from app.outbox.worker import get_outbox
from app.schemas.models import (AssessmentResult, AssessRequest,
                                ClassificationResult, CriticalRegister,
                                ErpStatus, FinalizationResult, FinalizeRequest,
                                Hazard, HumanReviewFlags, ReviewRequest,
                                RiskGrade, Session, SessionCreate, SessionDetail,
                                SessionState)
from app.services import rag_pipeline as rag
from app.services.session_store import SessionRecord, get_store

logger = logging.getLogger("jha.routes.sessions")
router = APIRouter(prefix="/v1/jha", tags=["sessions"])


# ── 직렬화 헬퍼 ─────────────────────────────────────────────────────────────
def _classification_result(rec: SessionRecord) -> ClassificationResult:
    c = rec.classification or {}
    return ClassificationResult(
        session_id=rec.session_id, state=rec.state,
        result_type=c.get("result_type", "ok"),
        classification=c.get("classification", {}),
        candidates=c.get("candidates", []),
        warnings=c.get("warnings", []),
        model_used=c.get("model_used"),
        extended_thinking_used=c.get("extended_thinking_used", False),
    )


def _assessment_result(rec: SessionRecord) -> AssessmentResult:
    a = rec.assessment or {}
    return AssessmentResult(
        session_id=rec.session_id, state=rec.state,
        result_type=a.get("result_type", "ok"),
        classification=a.get("classification", {}),
        hazards=[Hazard(**h) for h in a.get("hazards", [])],
        critical_register=a.get("critical_register", CriticalRegister.X),
        critical_register_reasons=a.get("critical_register_reasons", []),
        legal_refs=a.get("legal_refs", []),
        human_review_flags=HumanReviewFlags(**a.get("human_review_flags", {})),
        warnings=a.get("warnings", []),
        source_rows=a.get("source_rows", []),
        model_used=a.get("model_used"),
        parse_error=a.get("parse_error", False),
        raw_text=a.get("raw_text"),
    )


def _human_review_pending(rec: SessionRecord) -> bool:
    """human_review_required 가 true 이고 아직 REVIEWED 안 됨(=PENDING_REVIEW)."""
    a = rec.assessment or {}
    flags = a.get("human_review_flags", {})
    return bool(flags.get("human_review_required")) and rec.state == SessionState.PENDING_REVIEW


# ── POST /sessions ──────────────────────────────────────────────────────────
@router.post("/sessions", status_code=201, response_model=Session)
def create_session(body: SessionCreate,
                   principal: Principal = Depends(get_principal)) -> Session:
    store = get_store()
    rec = store.create(body.work_description, principal.user_id, body.site_id)
    return Session(session_id=rec.session_id, state=rec.state,
                   work_description=rec.work_description,
                   created_at=rec.created_at, owner_user_id=rec.owner_user_id)


# ── POST /sessions/{id}/classify ────────────────────────────────────────────
@router.post("/sessions/{id}/classify", response_model=ClassificationResult)
def classify_session(id: str = Path(...),
                     principal: Principal = Depends(get_principal)) -> ClassificationResult:
    store = get_store()
    rec = store.get(id)
    out = rag.run_classify(rec.work_description)
    rec.classification = {
        "result_type": out.result_type.value,
        "classification": out.classification,
        "candidates": out.candidates,
        "warnings": out.warnings,
        "model_used": out.model_used,
        "extended_thinking_used": out.extended_thinking_used,
        "retrieved_chunk_ids": out.retrieved_chunk_ids,
    }
    store.transition(rec, SessionState.CLASSIFIED, principal.user_id, reason="classify")
    store.save(rec)
    return _classification_result(rec)


# ── POST /sessions/{id}/assess ──────────────────────────────────────────────
@router.post("/sessions/{id}/assess", response_model=AssessmentResult)
def assess_session(id: str = Path(...),
                   body: AssessRequest = Body(default=AssessRequest()),
                   principal: Principal = Depends(get_principal)) -> AssessmentResult:
    store = get_store()
    rec = store.get(id)
    confirmed = (body.confirmed_classification.model_dump()
                 if body.confirmed_classification else None)
    out = rag.run_assess(rec.work_description, confirmed)

    if out.post is not None:
        post = out.post
        hazards = [h.model_dump() for h in post.hazards]
        flags = post.human_review_flags.model_dump()
        critical = post.critical_register.value
        critical_reasons = post.critical_register_reasons
        legal = post.legal_refs
        source_rows = post.source_rows
    else:
        hazards, flags, critical_reasons, legal, source_rows = [], {}, [], [], []
        critical = CriticalRegister.X.value

    rec.assessment = {
        "result_type": out.result_type.value,
        "classification": out.classification,
        "hazards": hazards,
        "critical_register": critical,
        "critical_register_reasons": critical_reasons,
        "legal_refs": legal,
        "human_review_flags": flags,
        "warnings": out.warnings,
        "source_rows": source_rows,
        "model_used": out.model_used,
        "parse_error": out.parse_error,
        "raw_text": out.raw_text,
        "retrieved_chunk_ids": out.retrieved_chunk_ids,
    }

    # human_review_required(곱16 경계셀 등) → PENDING_REVIEW, 아니면 ASSESSED
    target = (SessionState.PENDING_REVIEW if flags.get("human_review_required")
              else SessionState.ASSESSED)
    store.transition(rec, target, principal.user_id, reason="assess")
    store.save(rec)
    return _assessment_result(rec)


# ── POST /sessions/{id}/review  [safety_manager 전용] ───────────────────────
@router.post("/sessions/{id}/review", response_model=AssessmentResult)
def review_session(id: str = Path(...),
                   body: ReviewRequest = Body(...),
                   principal: Principal = Depends(get_principal)) -> AssessmentResult:
    # 권한: safety_manager 이상 (worker 403)
    principal.require_role("safety_manager")
    store = get_store()
    rec = store.get(id)
    a = rec.assessment or {}
    hazards = a.get("hazards", [])

    # 안전관리자 확정 반영 — 경계셀 등급/중점등록 최종 결정
    final_critical = a.get("critical_register")
    for d in body.decisions:
        hi = d.hazard_index
        if hi < 0 or hi >= len(hazards):
            raise ValidationFailed(details={"reason": "hazard_index 범위 초과",
                                            "hazard_index": hi})
        hazards[hi]["risk_grade"] = d.confirmed_grade.value
        hazards[hi]["boundary_cell"] = False  # 확정으로 경계셀 해소
        if d.confirmed_critical_register is not None:
            final_critical = d.confirmed_critical_register.value

    # "O (잠정)" → 확정 O/X. 미지정 시 등급 상 존재 여부로 결정.
    if final_critical == CriticalRegister.O_TENTATIVE.value:
        any_high = any(h.get("risk_grade") == RiskGrade.HIGH.value for h in hazards)
        final_critical = (CriticalRegister.O.value if any_high
                          else CriticalRegister.X.value)

    flags = a.get("human_review_flags", {})
    flags["human_review_required"] = False
    flags["boundary_cell"] = False
    a["hazards"] = hazards
    a["critical_register"] = final_critical
    a["human_review_flags"] = flags
    a["human_review"] = {
        "resolved_by": principal.user_id,
        "resolved_at": rec.created_at.isoformat(),
        "decisions": [d.model_dump() for d in body.decisions],
        "note": body.reviewer_note,
    }
    rec.assessment = a
    rec.review = {"reviewed_by": principal.user_id, "note": body.reviewer_note}

    store.transition(rec, SessionState.REVIEWED, principal.user_id, reason="review")
    store.save(rec)
    return _assessment_result(rec)


# ── POST /sessions/{id}/finalize ────────────────────────────────────────────
@router.post("/sessions/{id}/finalize", status_code=202,
             response_model=FinalizationResult)
def finalize_session(id: str = Path(...),
                     body: FinalizeRequest = Body(default=FinalizeRequest()),
                     principal: Principal = Depends(get_principal)) -> FinalizationResult:
    store = get_store()
    rec = store.get(id)

    # ── G1 게이트: human_review 미해소(=PENDING_REVIEW) → 409 차단 ──────────
    if _human_review_pending(rec):
        a = rec.assessment or {}
        pending = [i for i, h in enumerate(a.get("hazards", []))
                   if h.get("boundary_cell")]
        raise ReviewRequired(details={"human_review_required": True,
                                      "pending_hazards": pending})

    # 상태 전이(ASSESSED|REVIEWED → FINALIZED). 비허용 시 store 가 409.
    store.transition(rec, SessionState.FINALIZED, principal.user_id, reason="finalize")

    # ERP 등록 페이로드 구성(erp_register_flow §2 스키마) + Outbox 적재
    payload = _build_erp_payload(rec, body)
    outbox = get_outbox()
    entry = outbox.enqueue(rec.session_id, payload)

    # 세션 erp 상태 갱신 + REGISTERING 전이(즉시)
    rec.erp = {"status": "queued", "erp_id": None,
               "queue_position": outbox.queue_position(entry.entry_id),
               "register_state": "PENDING", "attempts": 0, "outbox_id": entry.entry_id}
    store.transition(rec, SessionState.REGISTERING, principal.user_id, reason="enqueue")
    store.save(rec)

    return FinalizationResult(session_id=rec.session_id, state=rec.state,
                              outbox_id=entry.entry_id, status="queued")


def _build_erp_payload(rec: SessionRecord, body: FinalizeRequest) -> dict:
    """세션 평가 결과 → ERP 등록 페이로드(erp_register_flow §2). PoC 최소 매핑."""
    a = rec.assessment or {}
    flags = a.get("human_review_flags", {})
    hazards = a.get("hazards", [])
    top_sev = max((h.get("severity", 1) for h in hazards), default=1)
    top_freq = max((h.get("frequency", 1) for h in hazards), default=1)
    return {
        "schema_version": "1.0",
        "context": {
            "site_code": body.site_id or rec.site_id or "HB-DEMO-001",
            "requested_by": rec.owner_user_id,
            "approved_by": (rec.review or {}).get("reviewed_by", rec.owner_user_id),
            "approved_at": rec.created_at.isoformat(),
        },
        "classification": {
            # PoC: 명칭→코드 매핑은 erp-integration 어댑터 담당. 데모는 코드 직주입.
            "major_type_code": "HBC-MJ-001",
            "sub_type_code": "HBC-SB-001",
            "detail_text": (a.get("classification") or {}).get("detail_item", ""),
        },
        "assessment": {
            "hazards": hazards,
            "severity": top_sev,
            "frequency": top_freq,
            "risk_grade": _top_grade(hazards),
            "critical_register": a.get("critical_register", "X"),
            "human_review_required": bool(flags.get("human_review_required")),
            "human_review_resolved": rec.state in (SessionState.REVIEWED,
                                                   SessionState.FINALIZED,
                                                   SessionState.REGISTERING)
                                     or not flags.get("human_review_required"),
            "human_review": a.get("human_review"),
        },
        "citations": [{"law": lr, "article": "", "level": "MUST",
                       "source_row": None} for lr in a.get("legal_refs", [])]
                     or [{"law": "표준 데이터 근거", "article": "", "level": "MUST",
                          "source_row": r} for r in a.get("source_rows", [])[:1]],
        "controls": [{"text": c} for h in hazards for c in h.get("controls", [])],
        "worker_edits": body.worker_edits,
    }


def _top_grade(hazards: list) -> str:
    order = {"상": 3, "중": 2, "하": 1}
    best = "하"
    for h in hazards:
        g = h.get("risk_grade", "하")
        if order.get(g, 0) > order.get(best, 0):
            best = g
    return best


# ── GET /sessions/{id} ──────────────────────────────────────────────────────
@router.get("/sessions/{id}", response_model=SessionDetail)
def get_session(id: str = Path(...),
                principal: Principal = Depends(get_principal)) -> SessionDetail:
    store = get_store()
    rec = store.get(id)
    erp = rec.erp or {}
    detail = SessionDetail(
        session=Session(session_id=rec.session_id, state=rec.state,
                        work_description=rec.work_description,
                        created_at=rec.created_at, owner_user_id=rec.owner_user_id),
        classification=_classification_result(rec) if rec.classification else None,
        assessment=_assessment_result(rec) if rec.assessment else None,
        review=rec.review or {},
        erp=ErpStatus(
            status=erp.get("status", "none"),
            erp_id=erp.get("erp_id"),
            queue_position=erp.get("queue_position"),
            register_state=erp.get("register_state"),
            attempts=erp.get("attempts", 0),
            last_error=erp.get("last_error"),
        ),
    )
    return detail
