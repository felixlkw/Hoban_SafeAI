"""FastAPI 앱 조립 — 라우터·미들웨어·전역 예외 핸들러.

전역 예외 핸들러: JhaError(도메인 예외) → ErrorResponse(code/message/details/request_id).
RateLimited/LlmCircuitOpen → Retry-After 헤더. SecurityViolation → 사용자에 일반 메시지(상세 비노출).
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config
from app.adapters.erp_adapter import ErpError
from app.errors import JhaError, RateLimited, ValidationFailed
from app.errors import LlmCircuitOpen
from app.middleware.logging import RequestContextMiddleware, configure_logging
from app.routes import citations, dynamic_risk, feedback, health, kb, sessions
from app.schemas.models import ErrorBody, ErrorResponse

logger = logging.getLogger("jha.main")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    # ── startup ──
    # KB 운영 저장소 시드(최초 1회) + 재인덱서 초기화(시드 인덱스 버전 기준선).
    try:
        from app.services.kb_store import get_kb_store
        from app.services.reindex import get_reindexer
        get_kb_store()          # seed_if_empty 내부 호출
        get_reindexer()         # 시드 인덱스 버전 기준선 캡처
        logger.info("KB store/reindexer 초기화 완료")
    except Exception as exc:  # noqa: BLE001
        logger.error("KB store 초기화 실패(검색은 시드 인덱스로 계속): %s", exc)
    yield
    # ── shutdown ──
    # 재인덱싱 디바운스 타이머/워커 정리 — 미정리 스레드로 인한 종료 hang 방지.
    try:
        from app.services.reindex import get_reindexer, reset_reindexer
        get_reindexer().shutdown()
        reset_reindexer()
        logger.info("reindexer shutdown 완료")
    except Exception as exc:  # noqa: BLE001
        logger.error("shutdown 정리 실패: %s", exc)


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(
        title="Hoban JHA Agent API",
        version=config.APP_VERSION,
        description="호반그룹 LLM/RAG 기반 작업위험성평가(JHA) 지원 에이전트 PoC API.",
        lifespan=_lifespan,
    )
    app.add_middleware(RequestContextMiddleware)
    # CORS — frontend(3000) 실연동. Authorization 헤더·Idempotency-Key 노출 허용.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "Retry-After"],
    )

    # 라우터 등록
    app.include_router(health.router)
    app.include_router(sessions.router)
    app.include_router(citations.router)
    app.include_router(dynamic_risk.router)
    app.include_router(feedback.router)
    app.include_router(kb.router)

    _register_exception_handlers(app)
    return app


def _error_response(request: Request, exc: JhaError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)
    body = ErrorResponse(error=ErrorBody(
        code=exc.code, message=exc.message,
        details=exc.details, request_id=request_id))
    headers = {}
    # Retry-After 헤더(rate limit·circuit open)
    if isinstance(exc, (RateLimited, LlmCircuitOpen)):
        headers["Retry-After"] = str(exc.details.get("retry_after", 30))
    return JSONResponse(status_code=exc.http_status,
                        content=body.model_dump(), headers=headers)


def _register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(JhaError)
    async def _jha_handler(request: Request, exc: JhaError):
        # 보안 위반은 상세 로그만, 사용자엔 일반 메시지(errors.py 가 메시지 일반화)
        if exc.http_status >= 500:
            logger.error("JhaError %s: %s details=%s", exc.code, exc, exc.details)
        return _error_response(request, exc)

    @app.exception_handler(ErpError)
    async def _erp_handler(request: Request, exc: ErpError):
        # 동기 경로에서 ERP 예외가 새어나오면 502 로 변환(정상 경로는 Outbox 가 흡수)
        request_id = getattr(request.state, "request_id", None)
        body = ErrorResponse(error=ErrorBody(
            code=exc.code, message="ERP 연동 처리 중 오류가 발생했습니다.",
            details=exc.details, request_id=request_id))
        logger.error("ErpError %s: %s", exc.code, exc)
        return JSONResponse(status_code=502, content=body.model_dump())

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(request: Request, exc: RequestValidationError):
        request_id = getattr(request.state, "request_id", None)
        verr = ValidationFailed(details={"errors": _safe_errors(exc)})
        body = ErrorResponse(error=ErrorBody(
            code=verr.code, message=verr.message,
            details=verr.details, request_id=request_id))
        return JSONResponse(status_code=422, content=body.model_dump())

    @app.exception_handler(Exception)
    async def _unhandled_handler(request: Request, exc: Exception):
        request_id = getattr(request.state, "request_id", None)
        logger.exception("미처리 예외: %s", exc)
        body = ErrorResponse(error=ErrorBody(
            code="INTERNAL_ERROR", message="일시적인 오류가 발생했습니다.",
            details={}, request_id=request_id))
        return JSONResponse(status_code=500, content=body.model_dump())


def _safe_errors(exc: RequestValidationError) -> list[dict]:
    out = []
    for e in exc.errors():
        out.append({"loc": list(e.get("loc", [])), "msg": e.get("msg"),
                    "type": e.get("type")})
    return out


app = create_app()
