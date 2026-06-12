"""구조화 로깅 미들웨어 — request_id 트레이싱 + JSON 로그.

관측성(observability_plan.md):
  - 모든 요청에 request_id(X-Request-ID 헤더 또는 서버 생성) 부여, 응답 헤더 에코.
  - 구조화 로그(JSON 1줄/요청): request_id·method·path·status·duration_ms.
  - LLM 호출 비용 메타(토큰·캐시 적중·모델)는 라우터에서 별도 로깅(본 모듈은 HTTP 경계).
"""
from __future__ import annotations

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("jha.access")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """request_id 주입 + 접근 로그(구조화 JSON)."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:  # noqa: BLE001
            # 미처리 예외도 로그에 남기고 재던짐(전역 핸들러가 변환)
            duration_ms = (time.perf_counter() - start) * 1000
            logger.error(json.dumps({
                "request_id": request_id, "method": request.method,
                "path": request.url.path, "status": 500,
                "duration_ms": round(duration_ms, 1), "error": "unhandled",
            }, ensure_ascii=False))
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["X-Request-ID"] = request_id
        logger.info(json.dumps({
            "request_id": request_id, "method": request.method,
            "path": request.url.path, "status": response.status_code,
            "duration_ms": round(duration_ms, 1),
        }, ensure_ascii=False))
        return response


def configure_logging() -> None:
    """루트 로거 기본 설정(중복 핸들러 방지)."""
    root = logging.getLogger()
    if root.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
    root.addHandler(handler)
    root.setLevel(logging.INFO)
