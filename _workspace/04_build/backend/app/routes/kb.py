"""KB CRUD 라우트 — 안전관리자·admin 전용 지식베이스 관리.

  GET    /v1/kb/rows            검색·필터·페이징·정렬
  GET    /v1/kb/rows/{chunk_id} 단건
  POST   /v1/kb/rows            생성(→ 자동 재인덱싱 스케줄)
  PUT    /v1/kb/rows/{chunk_id} 수정(→ 자동 재인덱싱)
  DELETE /v1/kb/rows/{chunk_id} soft delete(→ 자동 재인덱싱)
  GET    /v1/kb/stats           행수·분류 카운트·재인덱싱 상태
  POST   /v1/kb/reindex         수동 전체 재인덱싱(동기)

권한: 모든 엔드포인트 safety_manager 이상(worker 403). RoleGate = principal.require_role.
도메인 규칙(등급·중점등록)은 kb_store 가 서버 강제. 변이 후 reindexer.schedule().
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Body, Depends, Path, Query

from app.errors import SessionNotFound, ValidationFailed
from app.middleware.auth import Principal, get_principal
from app.schemas.models import (KbRow, KbRowList, KbRowWrite, KbStats,
                                ReindexAck)
from app.services.kb_store import get_kb_store
from app.services.reindex import get_reindexer

logger = logging.getLogger("jha.routes.kb")
router = APIRouter(prefix="/v1/kb", tags=["kb"])


def _require_manager(principal: Principal) -> None:
    """RoleGate — safety_manager 이상(worker 403)."""
    principal.require_role("safety_manager")


def _to_row(m: dict) -> KbRow:
    return KbRow(
        chunk_id=m.get("chunk_id"),
        source_row=m.get("source_row"),
        major_type=m.get("major_type"), sub_type=m.get("sub_type"),
        detail_item=m.get("detail_item"), accident_type=m.get("accident_type"),
        severity=m.get("severity"), frequency=m.get("frequency"),
        risk_product=m.get("risk_product"), risk_grade=m.get("risk_grade"),
        critical_register=m.get("critical_register"),
        boundary_cell=bool(m.get("boundary_cell")),
        is_new_detail=bool(m.get("is_new_detail")),
        hazard_text=m.get("hazard_text"), hazard_items=m.get("hazard_items") or [],
        controls=m.get("controls"), controls_items=m.get("controls_items") or [],
        legal_refs=m.get("legal_refs") or [],
        row_status=m.get("row_status", "active"),
        updated_at=m.get("updated_at"), updated_by=m.get("updated_by"),
    )


# ── GET /rows ─────────────────────────────────────────────────────────────
@router.get("/rows", response_model=KbRowList)
def list_rows(
    q: Optional[str] = Query(None, description="위험요인·대책·세부항목 텍스트 검색"),
    major_type: Optional[str] = None, sub_type: Optional[str] = None,
    accident_type: Optional[str] = None, risk_grade: Optional[str] = None,
    critical_register: Optional[str] = None,
    include_deleted: bool = False,
    offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=500),
    sort: str = "chunk_id",
    principal: Principal = Depends(get_principal),
) -> KbRowList:
    _require_manager(principal)
    store = get_kb_store()
    rows, total = store.list_rows(
        q=q, major_type=major_type, sub_type=sub_type,
        accident_type=accident_type, risk_grade=risk_grade,
        critical_register=critical_register, include_deleted=include_deleted,
        offset=offset, limit=limit, sort=sort)
    return KbRowList(rows=[_to_row(m) for m in rows], total=total,
                     offset=offset, limit=limit)


# ── GET /rows/{chunk_id} ──────────────────────────────────────────────────
@router.get("/rows/{chunk_id}", response_model=KbRow)
def get_row(chunk_id: str = Path(...),
            principal: Principal = Depends(get_principal)) -> KbRow:
    _require_manager(principal)
    m = get_kb_store().get(chunk_id)
    if m is None:
        raise SessionNotFound(code="KB_ROW_NOT_FOUND",
                              message="해당 KB 행을 찾을 수 없습니다.",
                              details={"chunk_id": chunk_id})
    return _to_row(m)


# ── POST /rows ────────────────────────────────────────────────────────────
@router.post("/rows", status_code=201, response_model=KbRow)
def create_row(body: KbRowWrite = Body(...),
               principal: Principal = Depends(get_principal)) -> KbRow:
    _require_manager(principal)
    store = get_kb_store()
    payload = body.model_dump()
    if body.critical_register is not None:
        payload["critical_register"] = body.critical_register.value
    try:
        m = store.create(payload, actor=principal.user_id)
    except ValueError as exc:
        raise ValidationFailed(code="KB_VALIDATION_FAILED", message=str(exc),
                               details={"field_error": str(exc)})
    get_reindexer().schedule()
    return _to_row(m)


# ── PUT /rows/{chunk_id} ──────────────────────────────────────────────────
@router.put("/rows/{chunk_id}", response_model=KbRow)
def update_row(chunk_id: str = Path(...), body: KbRowWrite = Body(...),
               principal: Principal = Depends(get_principal)) -> KbRow:
    _require_manager(principal)
    store = get_kb_store()
    payload = body.model_dump()
    if body.critical_register is not None:
        payload["critical_register"] = body.critical_register.value
    try:
        m = store.update(chunk_id, payload, actor=principal.user_id)
    except KeyError:
        raise SessionNotFound(code="KB_ROW_NOT_FOUND",
                              message="수정 대상 KB 행이 없습니다(삭제됨 포함).",
                              details={"chunk_id": chunk_id})
    except ValueError as exc:
        raise ValidationFailed(code="KB_VALIDATION_FAILED", message=str(exc),
                               details={"field_error": str(exc)})
    get_reindexer().schedule()
    return _to_row(m)


# ── DELETE /rows/{chunk_id} ───────────────────────────────────────────────
@router.delete("/rows/{chunk_id}", response_model=KbRow)
def delete_row(chunk_id: str = Path(...),
               principal: Principal = Depends(get_principal)) -> KbRow:
    _require_manager(principal)
    store = get_kb_store()
    try:
        m = store.soft_delete(chunk_id, actor=principal.user_id)
    except KeyError:
        raise SessionNotFound(code="KB_ROW_NOT_FOUND",
                              message="삭제 대상 KB 행이 없습니다.",
                              details={"chunk_id": chunk_id})
    get_reindexer().schedule()
    return _to_row(m)


# ── GET /stats ────────────────────────────────────────────────────────────
@router.get("/stats", response_model=KbStats)
def kb_stats(principal: Principal = Depends(get_principal)) -> KbStats:
    _require_manager(principal)
    s = get_kb_store().stats()
    rs = get_reindexer().state
    return KbStats(
        active_rows=s["active_rows"], deleted_rows=s["deleted_rows"],
        new_rows=s["new_rows"], by_major_type=s["by_major_type"],
        by_risk_grade=s["by_risk_grade"],
        reindex_status=rs.status, index_version=rs.index_version,
        last_reindex_at=rs.last_reindex_at, doc_count=rs.doc_count,
        last_change_ratio=rs.last_change_ratio,
        regression_recommended=rs.regression_recommended)


# ── POST /reindex ─────────────────────────────────────────────────────────
@router.post("/reindex", response_model=ReindexAck)
def reindex(principal: Principal = Depends(get_principal)) -> ReindexAck:
    _require_manager(principal)
    rs = get_reindexer().reindex_now()
    return ReindexAck(
        status=rs.status, index_version=rs.index_version, doc_count=rs.doc_count,
        last_reindex_at=rs.last_reindex_at, last_duration_ms=rs.last_duration_ms,
        regression_recommended=rs.regression_recommended)
