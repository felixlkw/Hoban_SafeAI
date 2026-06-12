"""인용 라우트 — GET /v1/jha/citations/{source_row}.

Excel 원본 행(source_row) 단위 표준 데이터 원문을 조회. frontend 인용 사이드 패널·검증용.
화이트리스트 필드만 반환(security_gate). 응답 {text, meta, score} 포함(frontend 합의).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Path

from app.adapters.kb_client import get_kb
from app.errors import SessionNotFound
from app.middleware.auth import Principal, get_principal
from app.schemas.models import Citation
from app.services.kb_store import build_chunk_text, get_kb_store
from app.services.security_gate import whitelist_filter

router = APIRouter(prefix="/v1/jha", tags=["citations"])


@router.get("/citations/{source_row}", response_model=Citation)
def get_citation(source_row: int = Path(...),
                 principal: Principal = Depends(get_principal)) -> Citation:
    """source_row 인용 원문 조회.

    1) 핫스왑된 라이브 인덱스(kb_client) 우선 — 활성 행(신규 N{seq} 포함).
    2) 인덱스 미적중 시 KB 저장소 fallback — 삭제 행이면 "삭제된 행" 표기.
    신규 행은 source_row 가 음수(N{seq} ⇒ -seq)이므로 ge 제약을 두지 않는다.
    """
    kb = get_kb()
    text = None
    deleted = False
    meta = kb.get_by_source_row(source_row)

    if meta is None:
        # 인덱스에 없음 → 저장소 fallback(삭제 행 또는 재인덱싱 전 신규 행)
        store = get_kb_store()
        srows, _ = store.list_rows(include_deleted=True, limit=10000)
        match = next((r for r in srows if r.get("source_row") == source_row), None)
        if match is None:
            raise SessionNotFound(
                code="CITATION_NOT_FOUND",
                message="해당 source_row 표준 데이터를 찾을 수 없습니다.",
                details={"source_row": source_row})
        meta = match
        deleted = (match.get("row_status") == "deleted")
        text = build_chunk_text(match)
    else:
        chunk_id = meta.get("chunk_id")
        text = kb.get_text_by_chunk(chunk_id) if chunk_id else None

    # 화이트리스트 메타만 노출(내부키 제거 + PII 마스킹)
    safe_meta = whitelist_filter(dict(meta))
    if deleted:
        safe_meta["row_status"] = "deleted"
        text = "[삭제된 행] " + (text or "")

    return Citation(
        source_row=source_row,
        major_type=meta.get("major_type"),
        sub_type=meta.get("sub_type"),
        detail_item=meta.get("detail_item"),
        accident_type=meta.get("accident_type"),
        hazard_text=meta.get("hazard_text"),
        control_text=meta.get("controls"),
        severity=meta.get("severity"),
        frequency=meta.get("frequency"),
        legal_refs=meta.get("legal_refs", []),
        # frontend 합의 추가
        text=text,
        meta=safe_meta,
        score=None,  # 직접 조회는 검색 맥락 없음 → score None
    )
