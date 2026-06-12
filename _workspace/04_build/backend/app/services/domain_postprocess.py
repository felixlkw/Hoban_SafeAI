"""도메인 후처리 — G4~G8 (코드가 권위).

LLM 응답을 신뢰하지 않고 코드가 등급·중점등록·human_review·source_rows 를 재계산/재검증.

  G4: JSON 스키마 검증(상위 rag_pipeline 에서 파싱, 여기선 필드 정규화)
  G5: 인용검증 citations ⊆ retrieved chunk_ids (위반 시 needs_regen 신호)
  G6: 인용 의무(필수 조문 누락) — 신호 부착
  G7: 등급 결정적 재계산 (하≤9 / 중10~15 / 상≥16) + 곱16 경계셀 3중 강제
  G8: 중점등록 = 상 1:1, 곱16 → "O (잠정)"
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.schemas.models import (CriticalRegister, Hazard, HumanReviewFlags,
                                RiskGrade)


# ── G7 등급 재계산 ──────────────────────────────────────────────────────────
def recompute_grade(severity: int, frequency: int) -> RiskGrade:
    """강도×빈도 곱으로 등급 결정적 재계산. 하≤9 / 중10~15 / 상≥16."""
    product = severity * frequency
    if product >= 16:
        return RiskGrade.HIGH
    if product >= 10:
        return RiskGrade.MEDIUM
    return RiskGrade.LOW


def is_boundary_cell(severity: int, frequency: int) -> bool:
    """곱16 경계셀: 강도4 × 빈도4 (정확히)."""
    return severity == 4 and frequency == 4


@dataclass
class PostprocessResult:
    hazards: list[Hazard]
    critical_register: CriticalRegister
    critical_register_reasons: list[str]
    human_review_flags: HumanReviewFlags
    source_rows: list[int]
    legal_refs: list[str]
    warnings: list[str] = field(default_factory=list)
    needs_regen: bool = False           # G5/G6 위반 → 1회 재생성 트리거
    regen_reason: str = ""
    dropped_citations: dict[int, list[str]] = field(default_factory=dict)


def postprocess(parsed: dict[str, Any], retrieved_chunk_ids: set[str],
                chunk_to_row: dict[str, int]) -> PostprocessResult:
    """LLM 파싱 결과(dict) → 코드 권위 후처리.

    retrieved_chunk_ids: STAGE2~3 검색으로 LLM 에 제공된 chunk_id 집합(G5 기준).
    chunk_to_row: chunk_id → source_row 역추적(ERP 등록 키 재산출).
    """
    raw_hazards = parsed.get("hazards") or []
    out_hazards: list[Hazard] = []
    all_source_rows: set[int] = set()
    all_legal: list[str] = []
    warnings: list[str] = list(parsed.get("warnings") or [])
    dropped: dict[int, list[str]] = {}

    any_boundary = False
    any_high = False
    needs_regen = False
    regen_reason = ""

    for hi, h in enumerate(raw_hazards):
        sev = int(h.get("severity", 1))
        freq = int(h.get("frequency", 1))
        sev = max(1, min(5, sev))
        freq = max(1, min(5, freq))

        boundary = is_boundary_cell(sev, freq)
        grade = RiskGrade.HIGH if boundary else recompute_grade(sev, freq)
        if boundary:
            any_boundary = True
        if grade == RiskGrade.HIGH:
            any_high = True

        # G5 인용검증: citations ⊆ retrieved. 외부 인용 제거 + 재생성 신호.
        raw_cites = h.get("citations") or []
        valid_cites = [c for c in raw_cites if c in retrieved_chunk_ids]
        invalid = [c for c in raw_cites if c not in retrieved_chunk_ids]
        if invalid:
            dropped[hi] = invalid
            needs_regen = True
            regen_reason = "citation_out_of_scope"
        # G6 인용 누락: hazard 에 유효 인용이 0건이면 재생성 트리거(인용 의무)
        if not valid_cites:
            needs_regen = True
            regen_reason = regen_reason or "citation_missing"

        # source_row 역추적(코드 재산출 — LLM source_rows 무시)
        for c in valid_cites:
            row = chunk_to_row.get(c)
            if row is not None:
                all_source_rows.add(int(row))

        legal = list(h.get("legal_refs") or [])
        all_legal.extend(legal)

        out_hazards.append(Hazard(
            accident_type=str(h.get("accident_type", "기타")),
            description=str(h.get("description", "")),
            severity=sev, frequency=freq,
            risk_grade=grade,
            boundary_cell=boundary,
            controls=list(h.get("controls") or []),
            citations=valid_cites,
            legal_refs=legal,
        ))

    # ── G8 중점등록 = 상 1:1 (코드 재계산) ──────────────────────────────
    reasons: list[str] = []
    if any_boundary:
        critical = CriticalRegister.O_TENTATIVE
        reasons.append("곱16 경계셀(강도4×빈도4) — 안전관리자 확인 전 잠정 O")
    elif any_high:
        critical = CriticalRegister.O
        reasons.append("위험등급 상 → 중점등록 O")
    else:
        critical = CriticalRegister.X
        reasons.append("최고 등급 중/하 → 중점등록 X")

    # ── human_review_flags (코드가 권위 set) ───────────────────────────
    llm_flags = parsed.get("human_review_flags") or {}
    flags = HumanReviewFlags(
        boundary_cell=any_boundary,
        human_review_required=any_boundary or bool(llm_flags.get("low_citation_confidence")),
        legal_critical_candidate=bool(llm_flags.get("legal_critical_candidate")),
        data_gap=bool(llm_flags.get("data_gap")),
        gap_areas=list(llm_flags.get("gap_areas") or []),
        low_citation_confidence=bool(llm_flags.get("low_citation_confidence")),
    )

    # legal_refs 합집합 + 응답 전체 LLM legal_refs 병합(중복 제거, 순서 보존)
    for lr in (parsed.get("legal_refs") or []):
        all_legal.append(lr)
    seen: set[str] = set()
    legal_union = [x for x in all_legal if not (x in seen or seen.add(x))]

    return PostprocessResult(
        hazards=out_hazards,
        critical_register=critical,
        critical_register_reasons=reasons,
        human_review_flags=flags,
        source_rows=sorted(all_source_rows),
        legal_refs=legal_union,
        warnings=warnings,
        needs_regen=needs_regen,
        regen_reason=regen_reason,
        dropped_citations=dropped,
    )
