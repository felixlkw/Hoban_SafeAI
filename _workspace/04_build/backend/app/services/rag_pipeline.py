"""RAG 파이프라인 오케스트레이션 — classify / assess 2개 진입점.

흐름(rag_architecture.md · rag_retrieval_spec.md 정합):
  사용자 입력 → (G0)PII 마스킹 → 의도/메타 추출(taxonomy_lookup CSV prefix 매칭)
  → prefilter(major/sub id) → BM25 검색(kb_client)
  → 화이트리스트 컨텍스트 직렬화(MockClaudeClient 가 파싱 가능한 [chunk_id:...] 포맷)
  → claude_client 호출 → JSON 파싱(1회 재생성) → domain_postprocess(G4~G8) 적용
  → result_type 판정.

각 단계는 timeout·degraded 가드레일. 검색 0건 → no_match(200).
"""
from __future__ import annotations

import csv
import json
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Any, Optional

from app import config
from app.adapters.kb_client import KbClient, RetrievedChunk, get_kb
from app.schemas.models import (Alternative, ResultType)
from app.services import domain_postprocess as dp
from app.services import gap_guardrail as gap
from app.schemas.models import HumanReviewFlags
from app.services.llm_client import get_llm
from app.services.security_gate import sanitize_user_input, whitelist_filter

logger = logging.getLogger("jha.rag")


# ── 의도/메타 추출 (taxonomy_lookup CSV prefix 매칭) ─────────────────────────
@dataclass
class Taxonomy:
    """taxonomy_lookup CSV 적재 — major/sub/detail 명칭→ID 역인덱스."""
    major_by_name: dict[str, str] = field(default_factory=dict)   # 명칭→MJ###
    sub_by_name: dict[str, str] = field(default_factory=dict)     # 명칭→SB###
    sub_to_major: dict[str, str] = field(default_factory=dict)    # SB###→MJ###
    major_names: list[str] = field(default_factory=list)
    sub_names: list[str] = field(default_factory=list)

    @classmethod
    def load(cls) -> "Taxonomy":
        t = cls()
        try:
            mp = config.TAXONOMY_DIR / "major.csv"
            with open(mp, encoding="utf-8-sig", newline="") as f:
                for r in csv.DictReader(f):
                    t.major_by_name[r["major_type"]] = r["major_type_id"]
                    t.major_names.append(r["major_type"])
            sp = config.TAXONOMY_DIR / "sub.csv"
            with open(sp, encoding="utf-8-sig", newline="") as f:
                for r in csv.DictReader(f):
                    t.sub_by_name[r["sub_type"]] = r["sub_type_id"]
                    t.sub_to_major[r["sub_type_id"]] = r["major_type_id"]
                    t.sub_names.append(r["sub_type"])
        except Exception as exc:  # noqa: BLE001
            logger.warning("taxonomy_lookup 적재 실패(파이프라인은 prefilter 없이 진행): %s", exc)
        return t

    def match(self, text: str) -> tuple[list[str], list[str]]:
        """작업 입력 텍스트에서 중공종/대공종 명칭이 부분 포함되면 ID prefilter 수집.

        prefix(부분 문자열) 매칭 — '타워크레인 마스트 해체' → '타워크레인(T형)' 포함 매칭.
        반환: (sub_ids, major_ids).
        """
        sub_ids: list[str] = []
        major_ids: list[str] = []
        # 중공종: 괄호 앞 핵심어가 입력에 들어 있으면 매칭(예 "타워크레인")
        for name, sid in self.sub_by_name.items():
            core = re.split(r"[(\s]", name)[0]
            if core and core in text:
                sub_ids.append(sid)
                mj = self.sub_to_major.get(sid)
                if mj and mj not in major_ids:
                    major_ids.append(mj)
        # 대공종: 명칭이 직접 포함될 때
        for name, mid in self.major_by_name.items():
            if name in text and mid not in major_ids:
                major_ids.append(mid)
        return sub_ids, major_ids


@lru_cache(maxsize=1)
def get_taxonomy() -> Taxonomy:
    return Taxonomy.load()


# ── 컨텍스트 직렬화 (화이트리스트 + MockClaude 파싱 포맷) ────────────────────
def _serialize_chunks(chunks: list[RetrievedChunk]) -> str:
    """검색 청크를 LLM 컨텍스트 문자열로 직렬화.

    화이트리스트 필터(security_gate)를 거친 메타만 포함하고,
    각 청크를 `[chunk_id: Rxxxxx] ... severity=N frequency=N accident_type=X` 형태로
    직렬화한다(MockClaudeClient 의 _parse_chunks 와 정합). source_row 등 내부키는
    whitelist_filter 가 자동 제거하므로 외부 전송되지 않는다.
    """
    lines: list[str] = []
    for c in chunks:
        safe_meta = whitelist_filter(dict(c.metadata))
        sev = safe_meta.get("severity", 3)
        freq = safe_meta.get("frequency", 3)
        acc = safe_meta.get("accident_type", "기타")
        maj = safe_meta.get("major_type") or ""
        sub = safe_meta.get("sub_type") or ""
        det = safe_meta.get("detail_item") or ""
        hazard = safe_meta.get("hazard_text") or ""
        controls = safe_meta.get("controls") or ""
        lines.append(
            f"[chunk_id: {c.chunk_id}] "
            f"major_type={maj} sub_type={sub} detail_item={det} "
            f"accident_type={acc} severity={sev} frequency={freq}\n"
            f"위험요인: {hazard}\n개선대책: {controls}"
        )
    return "\n\n".join(lines)


def _load_prompt(path) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except Exception:  # noqa: BLE001
        return ""


# ── 결과 컨테이너 ───────────────────────────────────────────────────────────
@dataclass
class ClassifyOutput:
    result_type: ResultType
    classification: dict[str, Any]
    alternatives: list[Alternative]
    candidates: list[dict[str, Any]]
    warnings: list[str]
    model_used: str
    extended_thinking_used: bool
    retrieved_chunk_ids: list[str]


@dataclass
class AssessOutput:
    result_type: ResultType
    classification: dict[str, Any]
    post: Optional[dp.PostprocessResult]
    warnings: list[str]
    model_used: str
    parse_error: bool
    raw_text: Optional[str]
    retrieved_chunk_ids: list[str]


# ── JSON 파싱 (코드펜스·잡음 제거) ──────────────────────────────────────────
_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _parse_json(text: str) -> Optional[dict[str, Any]]:
    if not text:
        return None
    m = _FENCE_RE.search(text)
    candidate = m.group(1) if m else text
    # 첫 { ~ 마지막 } 구간 추출(앞뒤 설명문 방어)
    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = candidate[start:end + 1]
    try:
        return json.loads(candidate)
    except Exception:  # noqa: BLE001
        return None


# ── 검색 공통 ───────────────────────────────────────────────────────────────
def _retrieve(work_description: str, kb: KbClient,
              confirmed: Optional[dict[str, Any]] = None) -> list[RetrievedChunk]:
    """의도 추출 → prefilter → BM25 검색. confirmed 분류 있으면 그 명칭으로 prefilter."""
    tax = get_taxonomy()
    query = sanitize_user_input(work_description)
    if confirmed:
        # 확정 분류 명칭을 쿼리에 보강(검색 정밀도 향상)
        for k in ("major_type", "sub_type", "detail_item"):
            v = confirmed.get(k)
            if v:
                query = f"{query} {v}"
    sub_ids, major_ids = tax.match(query)
    chunks = kb.search(query, top_k=config.TOP_K,
                       prefilter_sub_ids=sub_ids or None,
                       prefilter_major_ids=major_ids or None)
    # prefilter 가 0건이면 prefilter 없이 재검색(가드레일: 과한 필터 방지)
    if not chunks and (sub_ids or major_ids):
        chunks = kb.search(query, top_k=config.TOP_K)
    return chunks[:config.TOP_K_FINAL]


# ── classify ────────────────────────────────────────────────────────────────
def run_classify(work_description: str,
                 kb: Optional[KbClient] = None) -> ClassifyOutput:
    kb = kb or get_kb()

    # ── G3 갭영역 감지(LLM 호출 전, 결정적) ─────────────────────────────────
    # full refuse 영역(석면·화학물질)은 분류 자체를 거절(LLM 미호출).
    det = gap.detect_gap_area(work_description)
    if det.is_gap and det.scope == "full":
        logger.info("G3 full-refuse(classify) 발동: %s", det.gap_area_ids())
        return ClassifyOutput(
            result_type=ResultType.refused_full,
            classification={"major_type": None, "sub_type": None,
                            "detail_item": None, "confidence": 0.0,
                            "alternatives": []},
            alternatives=[], candidates=[],
            warnings=gap.build_full_refuse_warnings(det),
            model_used="-(gap_refuse)", extended_thinking_used=False,
            retrieved_chunk_ids=[])

    chunks = _retrieve(work_description, kb)
    if not chunks:
        return ClassifyOutput(
            result_type=ResultType.no_match,
            classification={"major_type": None, "sub_type": None,
                            "detail_item": None, "confidence": 0.0},
            alternatives=[], candidates=[],
            warnings=["관련 사내 표준 데이터를 찾지 못했습니다. 작업 내용을 더 구체적으로 입력해 주세요."],
            model_used="-", extended_thinking_used=False, retrieved_chunk_ids=[])

    context = _serialize_chunks(chunks)
    user_content = (
        "TASK=classify\n"
        f"major_type={chunks[0].metadata.get('major_type')} "
        f"sub_type={chunks[0].metadata.get('sub_type')} "
        f"detail_item={chunks[0].metadata.get('detail_item')}\n"
        f"작업입력: {sanitize_user_input(work_description)}\n\n[검색 결과]\n{context}"
    )

    sys_block = _load_prompt(config.SYSTEM_PROMPT_PATH)
    gen_block = _load_prompt(config.GEN_TEMPLATE_PATH)
    client = get_llm()

    # 1차: sonnet. confidence<0.7 → opus 2차(adaptive thinking).
    model = config.MODEL_CLASSIFY
    resp = client.complete(model, sys_block, "", gen_block, user_content)
    parsed = _parse_json(resp.text) or {}
    conf = float(parsed.get("classification", {}).get("confidence", 0.0))
    extended = resp.extended_thinking_used

    if conf < config.CONFIDENCE_AMBIGUOUS_THRESHOLD and not config.is_opus(model):
        resp2 = client.complete(config.MODEL_AMBIGUOUS, sys_block, "", gen_block, user_content)
        parsed2 = _parse_json(resp2.text)
        if parsed2:
            parsed = parsed2
            resp = resp2
            extended = True

    cls = parsed.get("classification", {}) or {}
    rt_raw = parsed.get("result_type", "ok")
    result_type = _coerce_result_type(rt_raw, conf=float(cls.get("confidence", 0.0)))

    # 후보(candidates) — 검색 청크의 분류 메타 집계(코드 권위, LLM 미신뢰)
    candidates = _build_candidates(chunks)
    # alternatives — 상위 후보 2~3건을 frontend 합의 포맷으로
    alts = _build_alternatives(candidates)

    return ClassifyOutput(
        result_type=result_type,
        classification={
            "major_type": cls.get("major_type"),
            "sub_type": cls.get("sub_type"),
            "detail_item": cls.get("detail_item"),
            "confidence": float(cls.get("confidence", 0.0)),
            "alternatives": [a.model_dump() for a in alts],
        },
        alternatives=alts,
        candidates=candidates,
        warnings=list(parsed.get("warnings") or []),
        model_used=resp.model_used,
        extended_thinking_used=extended,
        retrieved_chunk_ids=[c.chunk_id for c in chunks],
    )


def _build_candidates(chunks: list[RetrievedChunk]) -> list[dict[str, Any]]:
    """검색 청크를 (major,sub,detail) 키로 묶어 후보 집계. source_rows 누적."""
    agg: dict[tuple, dict[str, Any]] = {}
    for rank, c in enumerate(chunks):
        m = c.metadata
        key = (m.get("major_type"), m.get("sub_type"), m.get("detail_item"))
        if key not in agg:
            # rank 기반 단조 감소 confidence(0.9→) — 결정적
            agg[key] = {
                "major_type": m.get("major_type"),
                "sub_type": m.get("sub_type"),
                "detail_item": m.get("detail_item"),
                "confidence": round(max(0.3, 0.9 - rank * 0.15), 3),
                "source_rows": [],
            }
        row = m.get("source_row")
        if row is not None:
            agg[key]["source_rows"].append(int(row))
    return list(agg.values())[:3]


def _build_alternatives(candidates: list[dict[str, Any]]) -> list[Alternative]:
    alts: list[Alternative] = []
    for cand in candidates:
        label = " > ".join(x for x in (cand.get("major_type"), cand.get("sub_type"),
                                       cand.get("detail_item")) if x)
        alts.append(Alternative(label=label, level="detail",
                                confidence=float(cand.get("confidence", 0.0))))
    return alts


# ── assess ──────────────────────────────────────────────────────────────────
def run_assess(work_description: str,
               confirmed_classification: Optional[dict[str, Any]] = None,
               kb: Optional[KbClient] = None) -> AssessOutput:
    kb = kb or get_kb()

    # ── G3 갭영역 감지(LLM 호출 전, 결정적 — Mock에서도 발동) ─────────────────
    det = gap.detect_gap_area(work_description)
    if det.is_gap and det.scope == "full":
        # full refuse(석면·화학물질/MSDS): LLM 미호출, 위험·대책 생성 안 함.
        logger.info("G3 full-refuse(assess) 발동: %s", det.gap_area_ids())
        flags = HumanReviewFlags(human_review_required=True, data_gap=True,
                                 gap_areas=det.gap_area_ids())
        post = dp.PostprocessResult(
            hazards=[], critical_register=dp.CriticalRegister.X,
            critical_register_reasons=["갭 영역(full refuse) — 대책 생성 차단"],
            human_review_flags=flags, source_rows=[],
            legal_refs=det.legal_refs(),
            warnings=gap.build_full_refuse_warnings(det))
        return AssessOutput(
            result_type=ResultType.refused_full,
            classification=confirmed_classification or {}, post=post,
            warnings=gap.build_full_refuse_warnings(det),
            model_used="-(gap_refuse)", parse_error=False, raw_text=None,
            retrieved_chunk_ids=[])

    chunks = _retrieve(work_description, kb, confirmed=confirmed_classification)
    if not chunks:
        return AssessOutput(
            result_type=ResultType.no_match, classification={}, post=None,
            warnings=["관련 사내 표준 데이터를 찾지 못했습니다."],
            model_used="-", parse_error=False, raw_text=None, retrieved_chunk_ids=[])

    context = _serialize_chunks(chunks)
    cc = confirmed_classification or {}
    user_content = (
        "TASK=assess\n"
        f"major_type={cc.get('major_type') or chunks[0].metadata.get('major_type')} "
        f"sub_type={cc.get('sub_type') or chunks[0].metadata.get('sub_type')} "
        f"detail_item={cc.get('detail_item') or chunks[0].metadata.get('detail_item')}\n"
        f"작업입력: {sanitize_user_input(work_description)}\n\n[검색 결과]\n{context}"
    )

    sys_block = _load_prompt(config.SYSTEM_PROMPT_PATH)
    gen_block = _load_prompt(config.GEN_TEMPLATE_PATH)
    client = get_llm()

    retrieved_ids = {c.chunk_id for c in chunks}
    chunk_to_row = {c.chunk_id: int(c.metadata.get("source_row"))
                    for c in chunks if c.metadata.get("source_row") is not None}

    model = config.MODEL_ASSESS
    resp = client.complete(model, sys_block, "", gen_block, user_content)
    parsed = _parse_json(resp.text)

    parse_error = False
    raw_text = None
    if parsed is None:
        # G4 파싱 실패 → 1회 재생성
        resp = client.complete(model, sys_block, "", gen_block, user_content)
        parsed = _parse_json(resp.text)
        if parsed is None:
            parse_error = True
            raw_text = resp.text
            return AssessOutput(
                result_type=ResultType.ok, classification={}, post=None,
                warnings=["AI 응답 파싱에 실패했습니다. 원문을 검토해 주세요."],
                model_used=resp.model_used, parse_error=True, raw_text=raw_text,
                retrieved_chunk_ids=list(retrieved_ids))

    # G5/G6/G7/G8 후처리 — 코드 권위
    post = dp.postprocess(parsed, retrieved_ids, chunk_to_row)

    # G5 인용 위반 또는 G6 인용 누락 → 1회 재생성
    if post.needs_regen:
        logger.info("postprocess needs_regen(%s) — 1회 재생성", post.regen_reason)
        resp2 = client.complete(model, sys_block, "", gen_block, user_content)
        parsed2 = _parse_json(resp2.text)
        if parsed2 is not None:
            post2 = dp.postprocess(parsed2, retrieved_ids, chunk_to_row)
            # 재생성이 위반을 줄였으면 채택
            if not post2.needs_regen or len(post2.hazards) >= len(post.hazards):
                post = post2
                resp = resp2

    result_type = _coerce_result_type(parsed.get("result_type", "ok"),
                                      hazards=len(post.hazards))
    if post.needs_regen and post.regen_reason == "citation_missing" and not post.hazards:
        result_type = ResultType.refused_partial

    # ── G3 partial 갭(밀폐공간·작업환경측정): 갭 고유 위험(질식·환기 절차) 대책 차단 ──
    # 일반 위험(추락 등)은 검색 근거가 있으면 유지(rag_guardrails §2 G3 주석).
    if det.is_gap and det.scope == "partial":
        post = _apply_partial_gap(post, det)
        result_type = ResultType.refused_partial

    cls = parsed.get("classification", {}) or {}
    return AssessOutput(
        result_type=result_type,
        classification=cls if isinstance(cls, dict) else {},
        post=post,
        warnings=list(post.warnings),
        model_used=resp.model_used,
        parse_error=parse_error,
        raw_text=raw_text,
        retrieved_chunk_ids=list(retrieved_ids),
    )


# ── G3 partial 갭 적용 ──────────────────────────────────────────────────────
def _apply_partial_gap(post: dp.PostprocessResult,
                       det: gap.GapDetection) -> dp.PostprocessResult:
    """밀폐공간·작업환경측정 등 partial 갭: 갭 고유 위험 대책을 차단하고 조문 표시.

    - 갭 고유 위험(질식·환기·감시인 등)은 hazard 자체를 제거(대책 생성 금지).
    - 일반 위험(추락 등)은 대책을 유지(검색 근거 있음).
    - 갭 영역 조문(§619~ 등)을 legal_refs 에 표시, human_review·data_gap 강제.
    """
    kept = [h for h in post.hazards
            if not gap.is_gap_specific_hazard(h.accident_type, h.description, h.controls)]
    # legal_refs 에 갭 조문 추가(중복 제거, 순서 보존)
    seen: set[str] = set(post.legal_refs)
    legal = list(post.legal_refs)
    for lr in det.legal_refs():
        if lr not in seen:
            seen.add(lr)
            legal.append(lr)

    flags = post.human_review_flags
    flags.human_review_required = True
    flags.data_gap = True
    merged_gaps = list(dict.fromkeys(list(flags.gap_areas) + det.gap_area_ids()))
    flags.gap_areas = merged_gaps

    warnings = list(post.warnings) + gap.build_partial_gap_warnings(det)
    reasons = list(post.critical_register_reasons) + ["partial 갭 — 갭 고유 절차 대책 차단"]

    return dp.PostprocessResult(
        hazards=kept,
        critical_register=post.critical_register,
        critical_register_reasons=reasons,
        human_review_flags=flags,
        source_rows=post.source_rows,
        legal_refs=legal,
        warnings=warnings,
        needs_regen=False,
        regen_reason=post.regen_reason,
        dropped_citations=post.dropped_citations,
    )


# ── result_type 정규화 ──────────────────────────────────────────────────────
def _coerce_result_type(raw: Any, conf: float = 1.0, hazards: int = 1) -> ResultType:
    try:
        rt = ResultType(raw)
    except (ValueError, TypeError):
        rt = ResultType.ok
    if rt == ResultType.ok:
        if hazards == 0:
            return ResultType.no_match
        if conf < config.CONFIDENCE_AMBIGUOUS_THRESHOLD:
            return ResultType.low_confidence
    return rt
