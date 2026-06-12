"""도메인 후처리(G5~G8) 단위 테스트 — 등급 재계산·경계셀·인용검증."""
from __future__ import annotations

from app.schemas.models import CriticalRegister, RiskGrade
from app.services import domain_postprocess as dp


# ── G7 등급 재계산: 곱16 경계 ──────────────────────────────────────────────
def test_recompute_grade_boundaries():
    # 하 ≤ 9
    assert dp.recompute_grade(3, 3) == RiskGrade.LOW       # 9
    # 중 10~15
    assert dp.recompute_grade(2, 5) == RiskGrade.MEDIUM    # 10
    assert dp.recompute_grade(3, 5) == RiskGrade.MEDIUM    # 15
    # 상 ≥ 16
    assert dp.recompute_grade(4, 4) == RiskGrade.HIGH      # 16 경계셀
    assert dp.recompute_grade(5, 4) == RiskGrade.HIGH      # 20


def test_boundary_cell_only_4x4():
    assert dp.is_boundary_cell(4, 4) is True
    assert dp.is_boundary_cell(5, 4) is False   # 곱20이지만 경계셀 아님
    assert dp.is_boundary_cell(2, 5) is False   # 곱10


# ── 곱16 경계셀 → human_review + "O (잠정)" 강제 ───────────────────────────
def test_boundary_cell_triggers_tentative_and_review():
    parsed = {
        "hazards": [{
            "accident_type": "추락", "description": "test",
            "severity": 4, "frequency": 4, "risk_grade": "중",  # LLM 오답 → 코드가 덮어씀
            "controls": ["방호조치"], "citations": ["R00010"],
            "legal_refs": ["산업안전보건기준에 관한 규칙 §42"],
        }],
    }
    res = dp.postprocess(parsed, {"R00010"}, {"R00010": 10})
    h = res.hazards[0]
    assert h.risk_grade == RiskGrade.HIGH        # 4x4 → 상 고정
    assert h.boundary_cell is True
    assert res.critical_register == CriticalRegister.O_TENTATIVE   # 잠정 O
    assert res.human_review_flags.human_review_required is True
    assert res.source_rows == [10]


# ── 곱16 미만(상) → 확정 O ──────────────────────────────────────────────────
def test_high_non_boundary_gives_confirmed_o():
    parsed = {"hazards": [{
        "accident_type": "붕괴", "description": "t", "severity": 5, "frequency": 4,
        "risk_grade": "하", "citations": ["R00010"], "legal_refs": [],
    }]}
    res = dp.postprocess(parsed, {"R00010"}, {"R00010": 10})
    assert res.hazards[0].risk_grade == RiskGrade.HIGH
    assert res.hazards[0].boundary_cell is False
    assert res.critical_register == CriticalRegister.O   # 확정 O
    assert res.human_review_flags.human_review_required is False


# ── G5 인용검증: citations ⊆ retrieved ─────────────────────────────────────
def test_citation_subset_of_retrieved():
    parsed = {"hazards": [{
        "accident_type": "전도", "description": "t", "severity": 3, "frequency": 3,
        "risk_grade": "하",
        "citations": ["R00010", "R99999"],  # R99999 = retrieved 밖(환각)
        "legal_refs": [],
    }]}
    retrieved = {"R00010"}
    res = dp.postprocess(parsed, retrieved, {"R00010": 10})
    # 유효 인용만 남고 외부 인용 제거 + needs_regen 신호
    assert res.hazards[0].citations == ["R00010"]
    assert all(c in retrieved for c in res.hazards[0].citations)
    assert res.needs_regen is True
    assert 0 in res.dropped_citations and "R99999" in res.dropped_citations[0]


# ── G6 인용 누락 → needs_regen ─────────────────────────────────────────────
def test_citation_missing_triggers_regen():
    parsed = {"hazards": [{
        "accident_type": "협착", "description": "t", "severity": 2, "frequency": 2,
        "risk_grade": "하", "citations": [], "legal_refs": [],
    }]}
    res = dp.postprocess(parsed, {"R00010"}, {"R00010": 10})
    assert res.needs_regen is True
    assert res.regen_reason in ("citation_missing", "citation_out_of_scope")
