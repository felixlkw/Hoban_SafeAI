"""헬스 라우트 — GET /v1/health (의존성 포함, 인증 불필요)."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import config
from app.adapters.erp_adapter import get_erp_adapter
from app.adapters.kb_client import get_kb
from app.schemas.models import Health, HealthDeps

router = APIRouter(prefix="/v1", tags=["system"])


@router.get("/health")
def health_check():
    kb = get_kb()
    erp = get_erp_adapter()
    kb_status = "degraded" if kb.degraded else "ok"
    erp_status = erp.health()
    claude_status = "ok"  # Mock 또는 실 클라이언트 모두 응답 가능
    deps = HealthDeps(kb_index=kb_status, claude_api=claude_status,
                      session_store="ok", erp_adapter=erp_status)

    overall = "ok"
    if "down" in (kb_status, erp_status):
        overall = "down"
    elif "degraded" in (kb_status, erp_status):
        overall = "degraded"

    body = Health(status=overall, version=config.APP_VERSION, dependencies=deps)
    code = 503 if overall == "down" else 200
    return JSONResponse(status_code=code, content=body.model_dump())
