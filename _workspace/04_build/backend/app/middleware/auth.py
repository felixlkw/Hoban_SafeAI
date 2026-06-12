"""인증·권한 — PoC 간이 JWT(HS256).

역할(role claim): worker | safety_manager | admin.
운영 전환: 호반 SSO(OIDC) JWKS 검증으로 교체. 본 모듈 인터페이스는 동일 유지.

토큰 형식(PoC): HS256, payload = {sub, role, exp?}. config.JWT_SECRET 로 서명.
AUTH_ENABLED=false 시 인증 우회(테스트 편의) — 기본 worker 권한.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Optional

from fastapi import Header

from app import config
from app.errors import AuthInvalid, InsufficientRole

ROLE_RANK = {"worker": 1, "safety_manager": 2, "admin": 3}


@dataclass
class Principal:
    user_id: str
    role: str

    def rank(self) -> int:
        return ROLE_RANK.get(self.role, 0)

    def require_role(self, minimum: str) -> None:
        """최소 역할 미만이면 403."""
        if self.rank() < ROLE_RANK.get(minimum, 99):
            raise InsufficientRole(
                details={"required": minimum, "actual": self.role})


# ── 간이 JWT 인코드/디코드 (HS256) ──────────────────────────────────────────
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def encode_token(user_id: str, role: str, exp_in_s: Optional[int] = None) -> str:
    """PoC 토큰 발급(테스트·데모 헬퍼)."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload: dict[str, object] = {"sub": user_id, "role": role}
    if exp_in_s is not None:
        payload["exp"] = int(time.time()) + exp_in_s
    seg = (_b64url(json.dumps(header, separators=(",", ":")).encode())
           + "." + _b64url(json.dumps(payload, separators=(",", ":")).encode()))
    sig = hmac.new(config.JWT_SECRET.encode(), seg.encode(), hashlib.sha256).digest()
    return seg + "." + _b64url(sig)


def decode_token(token: str) -> Principal:
    try:
        h_seg, p_seg, sig_seg = token.split(".")
    except ValueError:
        raise AuthInvalid(details={"reason": "malformed_token"})
    signing_input = f"{h_seg}.{p_seg}"
    expected = hmac.new(config.JWT_SECRET.encode(), signing_input.encode(),
                        hashlib.sha256).digest()
    try:
        actual = _b64url_decode(sig_seg)
    except Exception:  # noqa: BLE001
        raise AuthInvalid(details={"reason": "bad_signature_encoding"})
    if not hmac.compare_digest(expected, actual):
        raise AuthInvalid(details={"reason": "signature_mismatch"})
    try:
        payload = json.loads(_b64url_decode(p_seg))
    except Exception:  # noqa: BLE001
        raise AuthInvalid(details={"reason": "bad_payload"})
    exp = payload.get("exp")
    if exp is not None and time.time() > float(exp):
        raise AuthInvalid(details={"reason": "expired"})
    role = payload.get("role")
    sub = payload.get("sub")
    if role not in ROLE_RANK or not sub:
        raise AuthInvalid(details={"reason": "missing_claims"})
    return Principal(user_id=str(sub), role=str(role))


# ── FastAPI 의존성 ──────────────────────────────────────────────────────────
def get_principal(authorization: Optional[str] = Header(default=None)) -> Principal:
    """Authorization: Bearer <jwt> 파싱 → Principal. 인증 비활성 시 기본 worker."""
    if not config.AUTH_ENABLED:
        return Principal(user_id="anonymous", role="worker")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthInvalid(details={"reason": "missing_bearer"})
    token = authorization.split(" ", 1)[1].strip()
    return decode_token(token)
