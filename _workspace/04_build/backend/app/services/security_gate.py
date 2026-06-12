"""데이터 보안 게이트 — 외부 LLM 호출 전 화이트리스트 필터 + PII 마스킹.

data_security_policy.md §3 단일 출처(SSOT) 미러.
- 화이트리스트 외 필드가 LLM 컨텍스트로 들어가면 SecurityViolation → 500(외부 미전송).
- PII 의심 패턴(주민번호·연락처·이메일) 마스킹 강제.
"""
from __future__ import annotations

import re
from typing import Any

from app.errors import SecurityViolation

# data_security_policy.md §3 허용(전송 가능) 필드 — SSOT
WHITELIST_FIELDS: frozenset[str] = frozenset({
    "major_type", "sub_type", "detail_item",
    "accident_type",
    "severity", "frequency", "risk_product", "risk_grade",
    "critical_register",
    "hazard_text", "hazard_items",
    "controls", "controls_items",
    "legal_refs",
})

# 차단(내부 전용) 필드 — 외부 전송 절대 금지
BLOCKED_FIELDS: frozenset[str] = frozenset({
    "source_row", "chunk_id", "content_hash",
    "major_type_id", "sub_type_id", "detail_item_id",
    "dup_group", "dup_content_of", "last_modified",
    "expected_grade", "grade_inconsistent",
    # KB 운영·감사 필드(내부 전용 — 외부 LLM 전송 금지, 인용 메타에서도 제거)
    "row_status", "is_new_detail", "boundary_cell", "updated_at", "updated_by",
    # ERP 연동 시 무조건 차단
    "site_code", "worker_id", "worker_name", "dept_code", "requested_by",
})

# PII 패턴 (잠재 재유입 방어)
_PII_PATTERNS = [
    (re.compile(r"\d{6}[-\s]?\d{7}"), "******-*******"),                  # 주민번호
    (re.compile(r"01[016789][-\s]?\d{3,4}[-\s]?\d{4}"), "010-****-****"),  # 휴대전화
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "***@***"),                  # 이메일
]


def mask_pii(text: str) -> str:
    """PII 의심 패턴 마스킹. 마스킹 실패 가능성 없음(정규식 치환)."""
    if not isinstance(text, str):
        return text
    out = text
    for pat, repl in _PII_PATTERNS:
        out = pat.sub(repl, out)
    return out


def whitelist_filter(meta: dict[str, Any]) -> dict[str, Any]:
    """메타 dict 에서 화이트리스트 필드만 추출 + PII 마스킹.

    차단 필드는 조용히 제거(내부 키이므로 정상). 화이트리스트·차단 어디에도
    없는 '미지' 필드가 발견되면 SecurityViolation(500, 외부 미전송).
    """
    safe: dict[str, Any] = {}
    for key, val in meta.items():
        if key in WHITELIST_FIELDS:
            if isinstance(val, str):
                safe[key] = mask_pii(val)
            elif isinstance(val, list):
                safe[key] = [mask_pii(v) if isinstance(v, str) else v for v in val]
            else:
                safe[key] = val
        elif key in BLOCKED_FIELDS:
            continue  # 내부 키 — 정상 제거
        else:
            # 화이트리스트에도 차단목록에도 없는 미지 필드 — 보안 위반(즉시 차단)
            raise SecurityViolation(
                details={"unknown_field": key, "reason": "화이트리스트 미등록 필드"}
            )
    return safe


def sanitize_user_input(text: str) -> str:
    """사용자 입력(work_description)도 동일 게이트 통과 — PII 마스킹."""
    return mask_pii(text)
