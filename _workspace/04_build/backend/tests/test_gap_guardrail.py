"""G3 갭영역 refuse 가드레일 회귀 테스트 (Phase 6 버그픽스).

배경: Phase 5 평가에서 gold set refuse 2건(GS-0005 밀폐공간→partial,
GS-0035 석면→full)이 Mock 경로에서 result_type=ok 로 미발동.
원인: rag_pipeline 에 G3 갭영역 감지 로직 미구현.
수정: gap_guardrail(결정적 키워드 매칭, LLM 비의존) + rag_pipeline G3 분기.

본 테스트는 LLM(Mock) 무관하게 결정적으로 발동해야 한다.
"""
from __future__ import annotations

import pytest

from app.services import gap_guardrail as gap
from app.services import rag_pipeline as rag


# ── 단위: 키워드 detector ───────────────────────────────────────────────────
@pytest.mark.parametrize("text,scope,area_id", [
    # GS-0005 원문(밀폐공간) → partial
    ("E/V PIT 내부 또는 맨홀 내 청소·점검 작업 (밀폐공간)", "partial", "confined_space"),
    ("맨홀 내부 청소", "partial", "confined_space"),
    ("산소결핍 위험 환기 작업", "partial", "confined_space"),
    # GS-0035 원문(석면) → full
    ("외벽 석면 함유 마감재 해체 및 폐기물 처리 작업", "full", "asbestos"),
    ("슬레이트 해체 작업", "full", "asbestos"),
    # 화학물질/MSDS → full
    ("MSDS 유기용제 취급 작업", "full", "chemical_msds"),
    # 작업환경측정 → partial
    ("작업환경측정 실시", "partial", "work_environment_measurement"),
])
def test_detect_gap_area_positive(text, scope, area_id):
    det = gap.detect_gap_area(text)
    assert det.is_gap is True
    assert det.scope == scope
    assert area_id in det.gap_area_ids()
    assert det.legal_refs()  # 조문 표시 의무


@pytest.mark.parametrize("text", [
    "타워크레인 마스트 해체 작업",
    "굴착 흙막이 지보공 설치 작업",
    "거푸집 동바리 조립 작업",
    "고소 철골 용접 작업",
    "콘크리트 타설 작업",
])
def test_detect_gap_area_negative_no_false_trigger(text):
    """정상 작업 입력에는 갭 발동 안 함(false-refuse 0)."""
    det = gap.detect_gap_area(text)
    assert det.is_gap is False
    assert det.scope is None


def test_full_priority_over_partial():
    """석면(full) + 밀폐공간(partial) 동시 입력 시 대표 scope=full."""
    det = gap.detect_gap_area("석면 해체 후 맨홀 내부 청소")
    assert det.scope == "full"


def test_normalize_variants():
    """표기 변형(슬래시·공백) 흡수."""
    assert gap.detect_gap_area("E/V PIT").is_gap is True
    assert gap.detect_gap_area("E / V  P I T".replace(" ", "")).is_gap is True


# ── 통합: rag_pipeline.run_assess G3 분기 ───────────────────────────────────
GS_0005 = "E/V PIT 내부 또는 맨홀 내 청소·점검 작업 (밀폐공간)"
GS_0035 = "외벽 석면 함유 마감재 해체 및 폐기물 처리 작업"


def test_assess_gs0005_refused_partial():
    """GS-0005 밀폐공간 → refused_partial, 조문 표시, 대책 차단 플래그."""
    out = rag.run_assess(GS_0005)
    assert out.result_type.value == "refused_partial"
    assert out.post is not None
    # §619 등 밀폐공간 조문 표시 의무
    assert any("§619" in lr for lr in out.post.legal_refs)
    assert "confined_space" in out.post.human_review_flags.gap_areas
    assert out.post.human_review_flags.data_gap is True
    assert out.post.human_review_flags.human_review_required is True
    # 갭 고유 위험(질식 계열)은 차단 — 남아있으면 안 됨
    assert all(h.accident_type not in gap.GAP_SPECIFIC_ACCIDENT_TYPES
               for h in out.post.hazards)


def test_assess_gs0035_refused_full():
    """GS-0035 석면 → refused_full, LLM 미호출, hazards 0, 조문 표시."""
    out = rag.run_assess(GS_0035)
    assert out.result_type.value == "refused_full"
    assert out.post is not None
    assert out.post.hazards == []                      # 대책 생성 금지(환각 방지 R3)
    assert out.model_used == "-(gap_refuse)"           # LLM 미호출
    assert any("석면" in lr for lr in out.post.legal_refs)
    assert "asbestos" in out.post.human_review_flags.gap_areas


def test_classify_gs0035_refused_full():
    """석면은 분류 단계에서도 full refuse(LLM 미호출)."""
    out = rag.run_classify(GS_0035)
    assert out.result_type.value == "refused_full"
    assert out.candidates == []
    assert out.model_used == "-(gap_refuse)"


@pytest.mark.parametrize("text", [
    "타워크레인 마스트 해체 작업",
    "굴착 흙막이 지보공 설치 작업",
    "거푸집 동바리 조립 작업",
])
def test_assess_normal_not_refused(text):
    """정상 3건 — 갭 오발동 없음(result_type != refused_*)."""
    out = rag.run_assess(text)
    assert out.result_type.value not in ("refused_partial", "refused_full")
    assert out.post is not None
    assert len(out.post.hazards) >= 1
