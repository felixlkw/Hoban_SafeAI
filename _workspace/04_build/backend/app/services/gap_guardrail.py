"""G3 갭영역 감지 가드레일 — 결정적 키워드 매칭(LLM 비의존).

rag_guardrails.md §2 (G3) + safety_legal_citation_matrix.md §4 구현.
Mock·실 LLM 무관하게 **STAGE 4(LLM 호출 전)** 에서 결정적으로 발동한다.

  - 석면·화학물질/MSDS  → scope=full   → LLM 미호출 정형 refuse(refused_full)
  - 밀폐공간·작업환경측정 → scope=partial → 갭 고유 대책 생성 차단(refused_partial),
                          조문은 표시. 일반 위험(추락 등)은 검색 근거가 있으면 응답.

키워드 사전은 app/data/guardrail_gap_areas.json 으로 외부화(config.GAP_AREAS_PATH).
키워드 추가/수정 시 코드 변경 불필요.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Optional

from app import config

logger = logging.getLogger("jha.rag.gap")

# full refuse 우선(석면·화학물질) > partial. 동률 시 priority 큰 순.
_SCOPE_RANK = {"full": 2, "partial": 1}


@dataclass(frozen=True)
class GapArea:
    id: str
    label: str
    scope: str            # "full" | "partial"
    priority: int
    keywords: tuple[str, ...]
    legal_refs: tuple[str, ...]
    message: str


@dataclass
class GapDetection:
    """갭영역 감지 결과. matched 가 비면 갭 아님(정상 진행)."""
    matched: list[GapArea] = field(default_factory=list)

    @property
    def is_gap(self) -> bool:
        return bool(self.matched)

    @property
    def scope(self) -> Optional[str]:
        """대표 scope — full 이 하나라도 있으면 full, 아니면 partial."""
        if not self.matched:
            return None
        return "full" if any(a.scope == "full" for a in self.matched) else "partial"

    @property
    def primary(self) -> Optional[GapArea]:
        if not self.matched:
            return None
        return self.matched[0]

    def legal_refs(self) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for a in self.matched:
            for lr in a.legal_refs:
                if lr not in seen:
                    seen.add(lr)
                    out.append(lr)
        return out

    def messages(self) -> list[str]:
        return [a.message for a in self.matched]

    def gap_area_ids(self) -> list[str]:
        return [a.id for a in self.matched]


def _normalize(text: str) -> str:
    """키워드 매칭용 정규화 — 소문자화, 공백 제거, 슬래시→공백→제거 통일.

    'E/V PIT' → 'evpit', '맨홀 내부' → '맨홀내부' 처럼 표기 변형을 흡수한다.
    """
    if not text:
        return ""
    t = text.lower()
    t = t.replace("/", "")
    t = re.sub(r"\s+", "", t)
    return t


@lru_cache(maxsize=1)
def _load_areas() -> tuple[GapArea, ...]:
    try:
        with open(config.GAP_AREAS_PATH, encoding="utf-8") as f:
            raw = json.load(f)
    except Exception as exc:  # noqa: BLE001
        logger.error("갭영역 키워드 사전 적재 실패(%s) — G3 비활성으로 진행", exc)
        return ()
    areas: list[GapArea] = []
    for a in raw.get("areas", []):
        try:
            areas.append(GapArea(
                id=str(a["id"]),
                label=str(a.get("label", a["id"])),
                scope=str(a.get("scope", "partial")),
                priority=int(a.get("priority", 0)),
                keywords=tuple(_normalize(k) for k in a.get("keywords", []) if k),
                legal_refs=tuple(a.get("legal_refs", [])),
                message=str(a.get("message", "")),
            ))
        except Exception as exc:  # noqa: BLE001
            logger.warning("갭영역 항목 스킵(%s): %s", a.get("id"), exc)
    return tuple(areas)


def reload_areas() -> None:
    """키워드 사전 캐시 무효화(테스트·핫리로드용)."""
    _load_areas.cache_clear()


def detect_gap_area(text: str) -> GapDetection:
    """작업 입력 텍스트에서 갭영역 키워드를 결정적으로 탐지.

    한 키워드라도 정규화 부분 문자열로 포함되면 해당 영역 매칭.
    매칭된 영역은 (scope full 우선, priority 내림차순)으로 정렬 — primary/대표 scope 산출용.
    """
    norm = _normalize(text)
    if not norm:
        return GapDetection()
    hits: list[GapArea] = []
    for area in _load_areas():
        if any(kw and kw in norm for kw in area.keywords):
            hits.append(area)
    hits.sort(key=lambda a: (_SCOPE_RANK.get(a.scope, 0), a.priority), reverse=True)
    return GapDetection(matched=hits)


# ── 응답 빌더 (rag_pipeline 가 소비) ────────────────────────────────────────
def build_full_refuse_warnings(det: GapDetection) -> list[str]:
    """full refuse(석면·화학물질) — 사용자 안내 + 조문 표시 경고 메시지."""
    warnings = list(det.messages())
    refs = det.legal_refs()
    if refs:
        warnings.append("관련 법령(표시만, 대책 생성 안 함): " + ", ".join(refs))
    return warnings


def build_partial_gap_warnings(det: GapDetection) -> list[str]:
    """partial(밀폐공간·작업환경측정) — 갭 절차 차단 경고 + 조문 표시."""
    warnings = list(det.messages())
    refs = det.legal_refs()
    if refs:
        warnings.append("갭 영역 관련 법령(표시만, 절차 대책 생성 차단): " + ", ".join(refs))
    return warnings


# 갭 고유(질식·환기·감시인 등) 위험으로 간주해 partial 에서 차단할 accident_type/키워드.
# 일반 위험(추락·낙하 등)은 차단하지 않는다(rag_guardrails §2 G3 주석).
GAP_SPECIFIC_ACCIDENT_TYPES = frozenset({"질식", "중독", "산소결핍"})
GAP_SPECIFIC_CONTROL_TOKENS = ("환기", "감시인", "산소농도", "산소결핍", "질식",
                               "송기마스크", "공기호흡기", "msds", "유기용제")


def is_gap_specific_hazard(accident_type: str, description: str = "",
                           controls: Optional[list[str]] = None) -> bool:
    """partial 갭에서 차단해야 할 '갭 고유' 위험인지 판정.

    질식 계열 accident_type 이거나, 대책 텍스트에 갭 고유 토큰(환기·감시인 등)이
    포함되면 갭 고유로 본다. 추락 등 일반 위험은 False(응답 유지).
    """
    if accident_type in GAP_SPECIFIC_ACCIDENT_TYPES:
        return True
    blob = _normalize(description) + "".join(_normalize(c) for c in (controls or []))
    return any(tok in blob for tok in (_normalize(t) for t in GAP_SPECIFIC_CONTROL_TOKENS))
