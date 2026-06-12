"""도메인 예외 — 라우터에서 HTTP 코드로 매핑.

에러 코드 체계(api_openapi.yaml §Error):
  AUTH_* / VALIDATION_* / SESSION_* / RAG_* / LLM_* / ERP_* / SECURITY_* / INTERNAL_* / RATE_*
"""
from __future__ import annotations

from typing import Any


class JhaError(Exception):
    """베이스 도메인 예외."""

    http_status = 500
    code = "INTERNAL_ERROR"
    message = "일시적인 오류가 발생했습니다."

    def __init__(self, message: str | None = None, *, details: dict[str, Any] | None = None,
                 code: str | None = None, http_status: int | None = None):
        self.message = message or self.message
        self.details = details or {}
        if code:
            self.code = code
        if http_status:
            self.http_status = http_status
        super().__init__(self.message)


class SessionNotFound(JhaError):
    http_status = 404
    code = "SESSION_NOT_FOUND"
    message = "세션을 찾을 수 없습니다."


class InvalidStateTransition(JhaError):
    http_status = 409
    code = "SESSION_INVALID_STATE_TRANSITION"
    message = "현재 상태에서는 이 작업을 수행할 수 없습니다."


class ReviewRequired(JhaError):
    http_status = 409
    code = "SESSION_REVIEW_REQUIRED"
    message = ("경계셀(강도4×빈도4) 또는 필수인용 누락 항목이 안전관리자 확정 전입니다. "
               "ERP 등록이 차단되었습니다.")


class InsufficientRole(JhaError):
    http_status = 403
    code = "AUTH_INSUFFICIENT_ROLE"
    message = "이 작업을 수행할 권한이 없습니다."


class AuthInvalid(JhaError):
    http_status = 401
    code = "AUTH_TOKEN_INVALID"
    message = "인증 토큰이 유효하지 않습니다."


class ValidationFailed(JhaError):
    http_status = 422
    code = "VALIDATION_FIELD_INVALID"
    message = "입력 검증에 실패했습니다."


class SecurityViolation(JhaError):
    """화이트리스트 누락 — 외부 LLM 전송 중단. 사용자에 상세 비노출."""

    http_status = 500
    code = "SECURITY_WHITELIST_VIOLATION"
    message = "일시적인 오류가 발생했습니다."  # 사용자에게는 일반 메시지(보안 상세 비노출)


class LlmUpstreamError(JhaError):
    http_status = 502
    code = "LLM_UPSTREAM_ERROR"
    message = "AI 추천 엔진 일시 오류입니다. 다시 시도해 주세요."


class LlmCircuitOpen(JhaError):
    http_status = 503
    code = "LLM_CIRCUIT_OPEN"
    message = "AI 추천 엔진 점검 중입니다."


class RateLimited(JhaError):
    http_status = 429
    code = "RATE_LIMIT_EXCEEDED"
    message = "요청이 너무 많습니다. 잠시 후 다시 시도하세요."
