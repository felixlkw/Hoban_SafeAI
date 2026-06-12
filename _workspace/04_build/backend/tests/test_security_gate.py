"""데이터 보안 게이트 — 화이트리스트 필터 + PII 마스킹 테스트."""
from __future__ import annotations

import pytest

from app.errors import SecurityViolation
from app.services import security_gate as sg


# ── 화이트리스트: 허용 필드 통과 ────────────────────────────────────────────
def test_whitelist_keeps_allowed_fields():
    meta = {"major_type": "가설공사", "severity": 4, "frequency": 4,
            "accident_type": "추락", "controls": ["방호조치"]}
    safe = sg.whitelist_filter(meta)
    assert safe["major_type"] == "가설공사"
    assert safe["severity"] == 4
    assert safe["controls"] == ["방호조치"]


# ── 화이트리스트: 차단(내부) 필드는 조용히 제거 ────────────────────────────
def test_whitelist_drops_blocked_fields():
    meta = {"major_type": "가설공사", "source_row": 42, "chunk_id": "R00042",
            "content_hash": "abc", "worker_name": "홍길동"}
    safe = sg.whitelist_filter(meta)
    assert "source_row" not in safe
    assert "chunk_id" not in safe
    assert "worker_name" not in safe   # PII 내부키 — 외부 미전송
    assert safe == {"major_type": "가설공사"}


# ── 화이트리스트: 미지 필드 → SecurityViolation(500, 외부 미전송) ──────────
def test_whitelist_unknown_field_blocks():
    meta = {"major_type": "가설공사", "mystery_field": "leak"}
    with pytest.raises(SecurityViolation) as ei:
        sg.whitelist_filter(meta)
    assert ei.value.http_status == 500
    # 사용자에겐 일반 메시지(보안 상세 비노출)
    assert "일시적인 오류" in ei.value.message
    assert ei.value.details["unknown_field"] == "mystery_field"


# ── PII 마스킹: 주민번호·연락처·이메일 ──────────────────────────────────────
def test_pii_masking():
    assert sg.mask_pii("주민 901201-1234567 입니다") == "주민 ******-******* 입니다"
    assert "010-****-****" in sg.mask_pii("연락처 010-1234-5678")
    assert "***@***" in sg.mask_pii("메일 hong@hoban.com")


def test_whitelist_masks_pii_in_string_values():
    # 화이트리스트 필드 안에 PII 가 섞여도 마스킹
    meta = {"hazard_text": "작업자 010-1111-2222 추락 위험"}
    safe = sg.whitelist_filter(meta)
    assert "010-****-****" in safe["hazard_text"]
    assert "010-1111-2222" not in safe["hazard_text"]
