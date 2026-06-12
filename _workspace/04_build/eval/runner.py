#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
JHA Eval Runner — 호반그룹 작업위험성평가 평가 러너 (Foundation 골격)

근거 SSOT:
  - _workspace/02_foundation/safety_rubric.md        (8메트릭·곱16 부분점수·critical-fail)
  - _workspace/02_foundation/safety_risk_matrix_spec.md (임계곱·경계셀·중점등록)
  - _workspace/02_foundation/eval_plan.md             (메트릭 형식화·트리거·게이트)
  - _workspace/02_foundation/eval_rubrics.md          (LLM-judge prompt)

결정적 메트릭(분류·coverage·등급·인용·refuse)은 코드로 완성.
주관 메트릭(faithfulness·control verifiability)은 Anthropic SDK judge stub(키 없으면 skip).

CLI 예:
  python runner.py --mock --dataset ../../02_foundation/safety_gold_set.jsonl
  python runner.py --variant baseline --dataset ../../02_foundation/safety_gold_set.jsonl --api-endpoint http://localhost:8000/v1/jha/evaluate
  python runner.py --mock --dataset dataset/smoke_5.jsonl --variant smoke

mock 모드: API 미가용 시 gold의 expected를 echo → 결정적 메트릭 만점(=계산코드 self-test).
Windows UTF-8 stdout: io.TextIOWrapper 강제(한국어 깨짐 방지).
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# ── Windows UTF-8 stdout/stderr 강제 (한국어 출력 깨짐 방지) ──────────────────
# cp949 콘솔에서도 UTF-8로 출력. 이미 UTF-8이면 무해.
if hasattr(sys.stdout, "buffer"):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
if hasattr(sys.stderr, "buffer"):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)


# ════════════════════════════════════════════════════════════════════════════
# 1. 설정·상수
# ════════════════════════════════════════════════════════════════════════════

# 등급 순서(거리 계산용)
GRADE_ORDER = {"하": 0, "중": 1, "상": 2}

# 분류 계층 가중 (rubric §2.1)
CLS_WEIGHTS = {"major_type": 0.5, "sub_type": 0.3, "detail_item": 0.2}

# 핵심 4종 재해형태 (rubric §2.2 — 별도 임계 0.85)
CORE_HAZARDS = {"추락", "낙하", "전도", "협착"}

# 의무 인용 영역 키워드 (rubric §2.4 — citation recall ≥ 0.95 강화)
MANDATORY_CITATION_KEYWORDS = ("추락", "감전", "굴착", "붕괴")

# 동의어 정규화 사전 — 외부 파일(synonym_map.json)에서 로드.
# SSOT: jha-domain-knowledge SKILL §동의어 + safety_taxonomy_review §2.2.
_SYNONYM_MAP_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "synonym_map.json")


def _load_synonym_map(path: str = _SYNONYM_MAP_PATH) -> tuple[dict, dict]:
    """synonym_map.json 로드 → (synonyms 단순치환, ambiguous 문맥판정). 파일 없으면 빈 사전."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("synonyms", {}), data.get("ambiguous", {})
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[WARN] synonym_map.json 로드 실패 ({e}) — 정규화 미적용", file=sys.stderr)
        return {}, {}


SYNONYM_MAP, AMBIGUOUS_MAP = _load_synonym_map()

# PoC 절대 임계치 (rubric §3 요약표)
POC_THRESHOLDS = {
    "classification_accuracy": 0.85,
    "hazard_coverage": 0.80,
    "grade_alignment_general": 0.75,
    "citation_precision": 0.90,
    "citation_recall": 0.70,
    "faithfulness": 4.0,
    "refuse_appropriateness": 0.90,
    "control_verifiability": 0.70,
}

# LLM-as-judge 모델 — OpenAI 상위 모델. JUDGE_MODEL env 로 교체 가능.
JUDGE_MODEL_DEFAULT = os.environ.get("JUDGE_MODEL", "gpt-4.1")


@dataclass
class EvalConfig:
    """평가 실행 설정 (재현성: seed·judge_model·dataset hash 기록)."""
    dataset_path: str
    variant_name: str = "baseline"
    api_endpoint: str | None = None
    mock: bool = False
    model_overrides: dict = field(default_factory=dict)
    judge_model: str = JUDGE_MODEL_DEFAULT
    use_judge: bool = True
    seed: int = 42
    baseline_report: str | None = None
    out_dir: str = "reports"


# ════════════════════════════════════════════════════════════════════════════
# 2. 데이터 로더 (safety_gold_set.jsonl 실제 스키마 파싱)
# ════════════════════════════════════════════════════════════════════════════

def sha256_head(path: str, n: int = 12) -> str:
    """dataset 파일 SHA-256 앞 n자 — 버전 고정·gold 변경 감지용."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:n]


def load_gold(path: str) -> list[dict[str, Any]]:
    """gold set jsonl 로드. 빈 줄·주석(//) 무시. 실제 스키마는 변환 없이 그대로 유지."""
    cases: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8") as f:
        for ln, line in enumerate(f, 1):
            s = line.strip()
            if not s or s.startswith("//"):
                continue
            try:
                cases.append(json.loads(s))
            except json.JSONDecodeError as e:
                print(f"[WARN] {path}:{ln} JSON 파싱 실패, skip: {e}", file=sys.stderr)
    return cases


# ════════════════════════════════════════════════════════════════════════════
# 3. 정규화 헬퍼
# ════════════════════════════════════════════════════════════════════════════

def norm_text(s: Any) -> str:
    """공백 trim + 소문자화 + 동의어 정규화."""
    if s is None:
        return ""
    t = str(s).strip().lower()
    # 동의어는 원문 키 기준이므로 소문자화 전 비교가 안전 — 별도 함수로 처리
    return t


def norm_hazard(s: Any) -> str:
    """재해형태 정규화 (동의어 → 표준명).
    1) synonyms 단순치환 우선. 2) ambiguous(무너짐 등)는 default 표준명으로 보수적 치환.
    """
    if s is None:
        return ""
    t = str(s).strip()
    if t in SYNONYM_MAP:
        return SYNONYM_MAP[t]
    amb = AMBIGUOUS_MAP.get(t)
    if isinstance(amb, dict) and amb.get("default"):
        return amb["default"]
    return t


def _aliases(case_variants: dict, level: str) -> set[str]:
    """acceptable_variants에서 해당 계층 alias 집합(소문자)."""
    key = level + "_aliases"
    vals = case_variants.get(key, []) if isinstance(case_variants, dict) else []
    return {norm_text(v) for v in vals}


# ════════════════════════════════════════════════════════════════════════════
# 4. 결정적 메트릭 계산 함수들
# ════════════════════════════════════════════════════════════════════════════

def metric_classification(case: dict, resp: dict) -> dict:
    """분류 정확도 — 계층 가중 0.5/0.3/0.2 (rubric §2.1)."""
    gold = case.get("expected_classification") or {}
    pred = resp.get("classification") or {}
    variants = case.get("acceptable_variants") or {}

    # refuse-full(gold 전부 null)은 분류 채점 제외
    if all(gold.get(k) is None for k in CLS_WEIGHTS):
        return {"score": None, "skip": "refuse_full_no_classification"}

    per_level = {}
    crit = []
    # '재해 사례' 오분류 특칙(R6) — gold가 재해사례가 아닌데 pred가 재해사례
    pred_major = norm_text(pred.get("major_type"))
    gold_major = norm_text(gold.get("major_type"))
    miscl_critical = (pred_major == "재해 사례" and gold_major != "재해 사례")

    total = 0.0
    for level, w in CLS_WEIGHTS.items():
        g = norm_text(gold.get(level))
        p = norm_text(pred.get(level))
        if g == "":  # 해당 계층 gold 없음 → 가중치 재분배 없이 만점 처리(영향 최소)
            per_level[level] = None
            continue
        ok = (p == g) or (p in _aliases(variants, level)) or (g in _aliases(variants, level))
        if level == "major_type" and miscl_critical:
            ok = False
            crit.append("E-MISCL")
        per_level[level] = 1.0 if ok else 0.0
        total += w * (1.0 if ok else 0.0)

    return {
        "score": round(total, 4),
        "per_level": per_level,
        "major_correct": per_level.get("major_type") == 1.0,
        "critical_fail": crit,
    }


def metric_hazard_coverage(case: dict, resp: dict) -> dict:
    """위험요인 recall — must_include 기준 (rubric §2.2)."""
    expected = case.get("expected_hazards") or []
    required = [norm_hazard(h["accident_type"]) for h in expected if h.get("must_include")]
    if not required:
        return {"score": None, "skip": "no_required_hazards"}

    pred_set = {norm_hazard(h) for h in _extract_hazards(resp)}
    hit = [r for r in required if r in pred_set]
    recall = len(hit) / len(required)

    # 핵심4종 부분집합 recall
    core_req = [r for r in required if r in CORE_HAZARDS]
    core_hit = [r for r in core_req if r in pred_set]
    core_recall = (len(core_hit) / len(core_req)) if core_req else None

    return {
        "score": round(recall, 4),
        "core_recall": round(core_recall, 4) if core_recall is not None else None,
        "missing": [r for r in required if r not in pred_set],
    }


def _extract_hazards(resp: dict) -> list[str]:
    """응답에서 재해형태 목록 추출 (다양한 형태 허용)."""
    hz = resp.get("hazards") or []
    out = []
    for h in hz:
        if isinstance(h, dict):
            out.append(h.get("accident_type") or h.get("type") or "")
        else:
            out.append(str(h))
    return [x for x in out if x]


def metric_grade(case: dict, resp: dict) -> dict:
    """위험등급 정합 — 일반셀/경계셀(곱16) 분리 (rubric §2.3·§2.4)."""
    gold = case.get("expected_grade")
    if gold is None:
        return {"score": None, "skip": "refuse_full_no_grade", "boundary": False}

    gold_grade = gold.get("grade")
    boundary = bool(gold.get("boundary_cell"))
    pred_grade = (resp.get("grade") or {}).get("grade") if isinstance(resp.get("grade"), dict) else resp.get("grade")
    pred_grade = norm_grade(pred_grade)
    gold_grade_n = norm_grade(gold_grade)

    if boundary:
        return _grade_boundary(case, resp, gold_grade_n, pred_grade)

    # ── 일반셀 채점 ──
    crit = []
    if pred_grade not in GRADE_ORDER or gold_grade_n not in GRADE_ORDER:
        return {"score": 0.0, "boundary": False, "critical_fail": crit, "note": "grade missing/invalid"}

    dist = abs(GRADE_ORDER[pred_grade] - GRADE_ORDER[gold_grade_n])
    if gold_grade_n == "상" and pred_grade in ("중", "하"):
        # 과소평가 critical-fail (R1, E-UNDER)
        score = 0.0
        crit.append("E-UNDER")
    elif gold_grade_n == "하" and pred_grade == "상":
        score = 0.5  # 과대평가(안전측), 경미
    else:
        score = {0: 1.0, 1: 0.5, 2: 0.0}[dist]

    return {"score": round(score, 4), "boundary": False, "critical_fail": crit,
            "pred": pred_grade, "gold": gold_grade_n}


def _grade_boundary(case: dict, resp: dict, gold_grade: str, pred_grade: str) -> dict:
    """곱16 경계셀 부분점수표 (rubric §4.1). 경계셀은 E-UNDER 면제."""
    g = resp.get("grade") if isinstance(resp.get("grade"), dict) else {}
    flag = bool(g.get("boundary_cell_flag")) and bool(g.get("human_review_required"))
    crit = []  # 경계셀은 critical-fail 면제

    # gold는 '상'(O) 또는 '중'(X) 두 경우 — 룩업
    # 표: (pred, flag) -> {gold상: x, gold중: y}
    table = {
        ("상", True):  {"상": 1.0, "중": 0.7},
        ("상", False): {"상": 0.7, "중": 0.3},
        ("중", True):  {"상": 0.7, "중": 1.0},
        ("중", False): {"상": 0.3, "중": 0.5},
    }
    if pred_grade == "하":
        score = 0.0
    else:
        row = table.get((pred_grade, flag))
        score = row.get(gold_grade, 0.0) if row else 0.0

    if not flag and pred_grade in ("상", "중"):
        crit.append("E-BNDRY")  # 정보용(critical 아님, 상한 0.7 이미 표에 반영)

    return {"score": round(score, 4), "boundary": True, "critical_fail": crit,
            "flag_present": flag, "pred": pred_grade, "gold": gold_grade}


def norm_grade(s: Any) -> str:
    if s is None:
        return ""
    t = str(s).strip()
    # 'O (잠정)' 등 부속 표기 제거
    for g in ("상", "중", "하"):
        if t.startswith(g):
            return g
    return t


def metric_citation(case: dict, resp: dict) -> dict:
    """인용 precision/recall — 동등행 집합(acceptable_source_rows) 기준 (rubric §2.5 + safety_citation_equivalence.md §4).

    동등집합 채점(v2):
      - 정답집합 = acceptable_source_rows(있으면) else expected_source_rows(v1 하위호환).
      - precision = |cited ∩ acceptable| / |cited|  (set-membership: 동등집합에 들면 적중).
      - recall    = 케이스 단위 binary — acceptable 중 1행 이상 인용 시 1.0, 아니면 0.0
                    (equivalence.md §4-2: "각 기대 집합당 1개 이상 인용 시 충족").
        단 정답집합이 비면(legal만 의무) recall=None.
    cited/acceptable rows는 per_case 분석용으로 함께 반환한다(safety 권고).
    """
    accept_rows = set(case.get("acceptable_source_rows") or case.get("expected_source_rows") or [])
    pred_rows = set(_extract_source_rows(resp))
    schema = "acceptable" if case.get("acceptable_source_rows") is not None else "expected"

    # refuse-full 케이스는 인용이 아닌 거절이 정답 → citation 채점 제외
    # (석면안전관리법 등 legal_refs는 '안내'용이지 응답 인용 의무가 아님)
    if (case.get("expected_refuse") or {}).get("refuse_scope") == "full":
        return {"precision": None, "recall": None, "skip": "refuse_full_no_citation",
                "cited_rows": sorted(pred_rows), "acceptable_rows": sorted(accept_rows),
                "citation_schema": schema}

    # gold도 legal도 없으면 채점 대상 아님
    if not accept_rows and not (case.get("legal_refs_required")):
        return {"precision": None, "recall": None, "skip": "no_citation_expected",
                "cited_rows": sorted(pred_rows), "acceptable_rows": sorted(accept_rows),
                "citation_schema": schema}

    inter = pred_rows & accept_rows
    if pred_rows:
        precision = len(inter) / len(pred_rows)
    else:
        # 인용의무 케이스인데 무인용 → precision 0, 아니면 1
        precision = 0.0 if accept_rows else 1.0
    # recall: 케이스 단위 binary — 동등집합 중 1개 이상 적중 시 충족
    if accept_rows:
        recall = 1.0 if inter else 0.0
    else:
        recall = None

    # 법조문 인용
    legal_req = case.get("legal_refs_required") or []
    legal_pred = _extract_legal(resp)
    legal_hit = sum(1 for lr in legal_req if any(_legal_match(lr, lp) for lp in legal_pred))
    legal_recall = (legal_hit / len(legal_req)) if legal_req else None

    # 의무영역 강화: task_input에 의무 키워드 포함 시 recall<0.95 → citation-fail
    # (동등집합 binary recall이므로 미적중=0.0 → E-CITE, 1행이상 적중=1.0 → 충족)
    crit = []
    task = case.get("task_input", "")
    is_mandatory = any(k in task for k in MANDATORY_CITATION_KEYWORDS) or case.get("expected_critical_register") == "O"
    if is_mandatory and recall is not None and recall < 0.95:
        crit.append("E-CITE")

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4) if recall is not None else None,
        "legal_recall": round(legal_recall, 4) if legal_recall is not None else None,
        "mandatory_area": is_mandatory,
        "critical_fail": crit,
        "cited_rows": sorted(pred_rows),
        "acceptable_rows": sorted(accept_rows),
        "citation_schema": schema,
    }


def _extract_source_rows(resp: dict) -> list[int]:
    """응답 citations에서 source_row 추출."""
    cits = resp.get("citations") or {}
    if isinstance(cits, dict):
        rows = cits.get("source_rows") or []
    elif isinstance(cits, list):
        rows = []
        for c in cits:
            if isinstance(c, dict) and "source_row" in c:
                rows.append(c["source_row"])
            elif isinstance(c, (int, str)):
                rows.append(c)
    else:
        rows = []
    out = []
    for r in rows:
        try:
            out.append(int(r))
        except (ValueError, TypeError):
            pass
    return out


def _extract_legal(resp: dict) -> list[str]:
    cits = resp.get("citations") or {}
    if isinstance(cits, dict):
        return [str(x) for x in (cits.get("legal_refs") or [])]
    return [str(x) for x in (resp.get("legal_refs") or [])]


def _legal_match(req: str, pred: str) -> bool:
    """법조문 매칭 — 조문번호(§43 등) 기준 느슨한 매칭."""
    rn, pn = norm_text(req), norm_text(pred)
    if rn == pn:
        return True
    # §숫자 추출 비교
    import re
    rsec = re.findall(r"§\s*\d+", rn)
    psec = re.findall(r"§\s*\d+", pn)
    if rsec and psec and set(rsec) & set(psec):
        # 법령명도 부분일치해야 함(시행규칙 vs 기준규칙 구분)
        return rn.split("§")[0][:6] in pn or pn.split("§")[0][:6] in rn
    return False


def metric_refuse(case: dict, resp: dict) -> dict:
    """거절 적정성 (rubric §2.7). difficulty=refuse 케이스 + 정상 케이스 양방향."""
    difficulty = case.get("difficulty")
    refused = bool(resp.get("refuse")) or bool(resp.get("refused"))
    crit = []

    if difficulty == "refuse":
        scope = (case.get("expected_refuse") or {}).get("refuse_scope", "full")
        if scope == "full":
            # 분류·대책 생성 거부해야 정답
            ok = refused or (resp.get("classification") in (None, {}) and not _extract_hazards(resp))
            if not ok:
                crit.append("E-HALL")  # missed refuse = 환각 응답
            return {"score": 1.0 if ok else 0.0, "type": "refuse_full",
                    "correct": ok, "critical_fail": crit}
        else:  # partial — 갭부분 경고 + 응답가능부분 응답
            warned = refused or bool(resp.get("partial_warning")) or bool(resp.get("gap_warning"))
            # partial은 완전 거절도, 무경고 환각도 아니어야 함. 경고 신호 있으면 정답.
            ok = warned
            if not ok:
                crit.append("E-HALL")
            return {"score": 1.0 if ok else 0.0, "type": "refuse_partial",
                    "correct": ok, "critical_fail": crit}
    else:
        # 정상 케이스 — 거절하면 false refuse(경미)
        if refused:
            return {"score": 0.0, "type": "false_refuse", "correct": False, "critical_fail": crit}
        return {"score": 1.0, "type": "normal_answered", "correct": True, "critical_fail": crit}


# ════════════════════════════════════════════════════════════════════════════
# 5. LLM-as-judge (Anthropic SDK stub — 키 없으면 skip)
# ════════════════════════════════════════════════════════════════════════════

def judge_available(cfg: EvalConfig) -> bool:
    # LLM judge 는 OpenAI 로 전환. OPENAI_API_KEY 부재 시 graceful skip.
    return cfg.use_judge and bool(os.environ.get("OPENAI_API_KEY"))


def _llm_judge(prompt: str, model: str, max_retries: int = 1) -> dict | None:
    """OpenAI judge 호출. temp=0, JSON 강제. 파싱 실패 1회 재시도.
    SDK/키 없으면 None 반환(graceful skip)."""
    try:
        from openai import OpenAI  # type: ignore
    except ImportError:
        print("[INFO] openai SDK 미설치 — judge skip", file=sys.stderr)
        return None
    if not os.environ.get("OPENAI_API_KEY"):
        return None

    client = OpenAI()
    for attempt in range(max_retries + 1):
        try:
            msg = client.chat.completions.create(
                model=model,
                max_tokens=1024,
                temperature=0.0,
                response_format={"type": "json_object"},
                messages=[{"role": "user", "content": prompt}],
            )
            text = msg.choices[0].message.content or ""
            start, end = text.find("{"), text.rfind("}")
            return json.loads(text[start:end + 1])
        except Exception as e:  # noqa: BLE001
            if attempt < max_retries:
                continue
            print(f"[WARN] judge 파싱/호출 실패: {e}", file=sys.stderr)
            return None
    return None


# 레거시 명칭 호환 별칭(기존 호출부가 _anthropic_judge 를 부를 수 있음).
_anthropic_judge = _llm_judge


def judge_faithfulness(case: dict, resp: dict, cfg: EvalConfig) -> dict:
    """faithfulness 1~5 (eval_rubrics §1)."""
    retrieved = resp.get("retrieved_chunks") or resp.get("retrieved") or "[검색 컨텍스트 미제공]"
    prompt = _FAITHFULNESS_PROMPT.format(
        task_input=case.get("task_input", ""),
        retrieved_chunks=json.dumps(retrieved, ensure_ascii=False)[:6000],
        system_response=json.dumps(resp, ensure_ascii=False)[:6000],
    )
    out = _llm_judge(prompt, cfg.judge_model)
    if out is None:
        return {"score": None, "skip": "judge_unavailable"}
    return {"score": out.get("score"), "reasoning": out.get("reasoning"),
            "unsupported_claims": out.get("unsupported_claims", [])}


def judge_control_verifiability(case: dict, resp: dict, cfg: EvalConfig) -> dict:
    """control verifiability 0~1 (eval_rubrics §2)."""
    controls = resp.get("controls") or []
    prompt = _VERIFIABILITY_PROMPT.format(
        task_input=case.get("task_input", ""),
        controls=json.dumps(controls, ensure_ascii=False)[:4000],
        source_controls=json.dumps(resp.get("source_controls", []), ensure_ascii=False)[:2000],
    )
    out = _llm_judge(prompt, cfg.judge_model)
    if out is None:
        return {"score": None, "skip": "judge_unavailable"}
    return {"score": out.get("score"), "reasoning": out.get("reasoning"),
            "weak_controls": out.get("weak_controls", [])}


_FAITHFULNESS_PROMPT = """당신은 한국 건설안전(JHA) 도메인의 엄격한 평가자입니다.
아래 [응답]의 모든 주장이 [컨텍스트]에 의해 뒷받침되는지 1~5로 평가하세요.
[작업 입력]
{task_input}
[컨텍스트]
{retrieved_chunks}
[응답]
{system_response}
5:모든 주장 명시적 도출 / 4:대부분(1~2개 약한 추론) / 3:약 절반 / 2:대부분 추측·구체적 미근거 대책 / 1:환각 다수
일반 안전수칙은 감점 안 함. 컨텍스트에 없는 구체적·기술적 대책은 환각(≤2).
JSON만 출력: {{"score": <1-5>, "reasoning": "<근거>", "unsupported_claims": ["<목록>"]}}"""

_VERIFIABILITY_PROMPT = """당신은 한국 건설안전 개선대책 품질 평가자입니다.
[개선대책]이 점검 가능한 행동단위(행위주체·행위·점검가능성 3요소)인지 0.0~1.0 평균으로 평가.
[작업 입력]
{task_input}
[개선대책]
{controls}
[데이터 원문 대책]
{source_controls}
1.0:3요소 명확 / 0.7:행위 구체적이나 주체·점검 암묵 / 0.4:추상적 / 0.0:구호성
JSON만 출력: {{"score": <0.0-1.0>, "reasoning": "<근거>", "weak_controls": ["<목록>"]}}"""


# ════════════════════════════════════════════════════════════════════════════
# 6. API 호출 / mock
# ════════════════════════════════════════════════════════════════════════════

def mock_response(case: dict) -> dict:
    """mock: gold expected를 echo → 결정적 메트릭 만점 나와야 정상(self-test)."""
    grade = case.get("expected_grade")
    grade_obj = None
    if grade is not None:
        grade_obj = {
            "grade": grade.get("grade"),
            "severity": (grade.get("severity_range") or [None])[0],
            "frequency": (grade.get("frequency_range") or [None])[0],
        }
        if grade.get("boundary_cell"):
            grade_obj["boundary_cell_flag"] = True
            grade_obj["human_review_required"] = True

    hazards = [{"accident_type": h["accident_type"]} for h in (case.get("expected_hazards") or [])]

    resp: dict[str, Any] = {
        "classification": case.get("expected_classification") or {},
        "hazards": hazards,
        "grade": grade_obj,
        "critical_register": case.get("expected_critical_register"),
        "citations": {
            "source_rows": list(case.get("expected_source_rows") or []),
            "legal_refs": list(case.get("legal_refs_required") or []),
        },
        "controls": ["(mock) 안전대책 echo"],
        "retrieved_chunks": [f"row {r}" for r in (case.get("expected_source_rows") or [])],
    }
    # refuse 케이스는 expected_refuse 신호 echo
    if case.get("difficulty") == "refuse":
        scope = (case.get("expected_refuse") or {}).get("refuse_scope", "full")
        if scope == "full":
            resp = {"refuse": True, "reason": (case.get("expected_refuse") or {}).get("trigger", "")}
        else:
            resp["gap_warning"] = (case.get("expected_refuse") or {}).get("trigger", "")
    return resp


# ── 실 백엔드 호출 (api_openapi.yaml 계약 정합) ───────────────────────────────
# 평가 러너는 세션 상태 머신을 구동한다:
#   POST /v1/jha/sessions            (createSession)       → session_id
#   POST /v1/jha/sessions/{id}/classify (classifySession)  → ClassificationResult
#   POST /v1/jha/sessions/{id}/assess   (assessSession)    → AssessmentResult
# classify·assess 결과를 메트릭이 소비하는 내부 resp 스키마로 어댑트한다.
# --api-endpoint 는 base URL(예: http://localhost:8000) 또는 레거시 단일 endpoint 모두 허용.

import urllib.error
import urllib.request


def _api_base(endpoint: str) -> str:
    """endpoint에서 base URL 추출. /v1/... 경로가 붙어 있으면 잘라낸다."""
    e = endpoint.rstrip("/")
    idx = e.find("/v1/")
    if idx != -1:
        return e[:idx]
    # '/v1' 로 끝나는 경우
    if e.endswith("/v1"):
        return e[: -len("/v1")]
    return e


def _http_json(method: str, url: str, body: dict | None, token: str | None,
               timeout: float) -> tuple[int, dict]:
    """단일 HTTP 호출. (status, json) 반환. 연결 실패는 예외 전파."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as he:
        raw = he.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": {"code": "NON_JSON", "message": raw[:200]}}
        return he.code, payload


def _adapt_contract_response(cls_res: dict, assess_res: dict) -> dict:
    """ClassificationResult + AssessmentResult → 내부 메트릭 resp 스키마.
    계약 필드(result_type·hazards·human_review_flags·source_rows·critical_register)를 매핑.
    """
    result_type = (assess_res or {}).get("result_type") or (cls_res or {}).get("result_type") or "ok"

    # ── refuse / partial 매핑 (ResultType: refused_full | refused_partial) ──
    if result_type == "refused_full":
        return {"refuse": True, "result_type": result_type,
                "reason": " ".join((assess_res or {}).get("warnings", []) or
                                   (cls_res or {}).get("warnings", []))}
    resp: dict[str, Any] = {"result_type": result_type}
    if result_type == "refused_partial":
        warns = (assess_res or {}).get("warnings", []) or (cls_res or {}).get("warnings", [])
        resp["gap_warning"] = " ".join(warns) if warns else "partial gap"
        # partial은 분류·일부 응답도 함께 평가하므로 아래 매핑 계속 진행

    # ── 분류 ──
    resp["classification"] = (cls_res or {}).get("classification") or (assess_res or {}).get("classification") or {}

    # ── 위험요인(hazards) ── 계약 Hazard.accident_type 직접 사용
    hazards = (assess_res or {}).get("hazards") or []
    resp["hazards"] = [{"accident_type": h.get("accident_type")} for h in hazards if isinstance(h, dict)]

    # ── 등급 ── 코드 재계산된 risk_grade(상/중/하). 경계셀은 human_review_flags + hazard.boundary_cell.
    flags = (assess_res or {}).get("human_review_flags") or {}
    boundary_haz = any(h.get("boundary_cell") for h in hazards if isinstance(h, dict))
    # 최고 위험등급을 케이스 대표 등급으로(gold는 단일 expected_grade).
    grade_rank = {"상": 2, "중": 1, "하": 0}
    top_grade = None
    for h in hazards:
        g = h.get("risk_grade") if isinstance(h, dict) else None
        if g in grade_rank and (top_grade is None or grade_rank[g] > grade_rank[top_grade]):
            top_grade = g
    resp["grade"] = {
        "grade": top_grade,
        "boundary_cell_flag": bool(flags.get("boundary_cell")) or boundary_haz,
        "human_review_required": bool(flags.get("human_review_required")),
    }

    # ── 인용 ── source_rows(ERP 키, int) + legal_refs ──
    legal = (assess_res or {}).get("legal_refs") or []
    if not legal:
        # hazard별 legal_refs 합집합 fallback
        for h in hazards:
            legal += (h.get("legal_refs") or []) if isinstance(h, dict) else []
    resp["citations"] = {
        "source_rows": (assess_res or {}).get("source_rows") or [],
        "legal_refs": list(dict.fromkeys(legal)),
    }

    # ── 대책 / faithfulness 컨텍스트 ──
    controls: list[str] = []
    for h in hazards:
        controls += (h.get("controls") or []) if isinstance(h, dict) else []
    resp["controls"] = controls
    resp["critical_register"] = (assess_res or {}).get("critical_register")
    # 검색 컨텍스트(faithfulness judge용) — chunk_id 인용 목록으로 근사
    chunks: list[str] = []
    for h in hazards:
        chunks += (h.get("citations") or []) if isinstance(h, dict) else []
    resp["retrieved_chunks"] = chunks
    return resp


def call_api(endpoint: str, case: dict, overrides: dict, timeout: float = 30.0,
             token: str | None = None) -> dict | None:
    """실 백엔드 세션 머신 구동 후 내부 resp 스키마 반환. 연결/타임아웃 실패 시 None(skip).

    token: 환경변수 JHA_API_TOKEN 으로도 주입 가능(Bearer).
    """
    token = token or os.environ.get("JHA_API_TOKEN")
    base = _api_base(endpoint)
    try:
        # 1) createSession
        st, sess = _http_json(
            "POST", f"{base}/v1/jha/sessions",
            {"work_description": case.get("task_input"),
             "meta": {"eval_case_id": case.get("id"), "overrides": overrides}},
            token, timeout)
        if st not in (200, 201) or not sess.get("session_id"):
            print(f"[WARN] createSession 실패 (case {case.get('id')}): "
                  f"status={st} body={json.dumps(sess, ensure_ascii=False)[:160]}", file=sys.stderr)
            return None
        sid = sess["session_id"]

        # 2) classifySession
        st, cls_res = _http_json("POST", f"{base}/v1/jha/sessions/{sid}/classify", {}, token, timeout)
        if st != 200:
            print(f"[WARN] classify 실패 (case {case.get('id')}): status={st}", file=sys.stderr)
            cls_res = cls_res if isinstance(cls_res, dict) else {}

        # refuse_full 은 classify 단계에서 종료될 수 있음 → assess 생략
        if cls_res.get("result_type") == "refused_full":
            return _adapt_contract_response(cls_res, {})

        # 3) assessSession (확정 분류는 classify 결과 사용 → 빈 body)
        st, assess_res = _http_json("POST", f"{base}/v1/jha/sessions/{sid}/assess", {}, token, timeout)
        if st != 200:
            print(f"[WARN] assess 실패 (case {case.get('id')}): status={st}", file=sys.stderr)
            assess_res = assess_res if isinstance(assess_res, dict) else {}

        return _adapt_contract_response(cls_res, assess_res)

    except urllib.error.URLError as e:
        # 백엔드 미기동(Connection refused) graceful 처리
        print(f"[WARN] API 연결 실패 (case {case.get('id')}): {e.reason} — skip", file=sys.stderr)
        return None
    except (TimeoutError, OSError) as e:
        print(f"[WARN] API 타임아웃/네트워크 (case {case.get('id')}): {e} — skip", file=sys.stderr)
        return None
    except Exception as e:  # noqa: BLE001
        print(f"[WARN] API 호출 예외 (case {case.get('id')}): {e} — skip", file=sys.stderr)
        return None


# ════════════════════════════════════════════════════════════════════════════
# 7. 케이스 평가 + 집계
# ════════════════════════════════════════════════════════════════════════════

def evaluate_case(case: dict, resp: dict, cfg: EvalConfig) -> dict:
    """단일 케이스 전 메트릭 계산."""
    m: dict[str, Any] = {
        "classification": metric_classification(case, resp),
        "hazard_coverage": metric_hazard_coverage(case, resp),
        "grade": metric_grade(case, resp),
        "citation": metric_citation(case, resp),
        "refuse": metric_refuse(case, resp),
    }
    if judge_available(cfg):
        m["faithfulness"] = judge_faithfulness(case, resp, cfg)
        m["control_verifiability"] = judge_control_verifiability(case, resp, cfg)
    else:
        m["faithfulness"] = {"score": None, "skip": "judge_unavailable"}
        m["control_verifiability"] = {"score": None, "skip": "judge_unavailable"}

    # critical-fail 수집
    crit: list[str] = []
    for key in ("classification", "grade", "citation", "refuse"):
        crit += m[key].get("critical_fail", []) if isinstance(m[key], dict) else []
    m["_critical_fail"] = [c for c in crit if c in ("E-UNDER", "E-MISCL", "E-HALL", "E-CITE")]
    m["_info_flags"] = [c for c in crit if c == "E-BNDRY"]
    return m


def _mean(vals: list) -> float | None:
    xs = [v for v in vals if v is not None]
    return round(statistics.mean(xs), 4) if xs else None


def aggregate(results: list[dict], cfg: EvalConfig, ds_hash: str, skipped: int) -> dict:
    """데이터셋 평균·서브셋·critical-fail 집계."""
    def col(metric, sub="score"):
        out = []
        for r in results:
            v = r["metrics"][metric]
            if isinstance(v, dict):
                out.append(v.get(sub))
        return out

    grades = [r["metrics"]["grade"] for r in results]
    general = [g["score"] for g in grades if isinstance(g, dict) and not g.get("boundary") and g.get("score") is not None]
    boundary = [g["score"] for g in grades if isinstance(g, dict) and g.get("boundary") and g.get("score") is not None]

    all_crit: list[str] = []
    for r in results:
        all_crit += r["metrics"].get("_critical_fail", [])

    cls_major = [r["metrics"]["classification"].get("major_correct")
                 for r in results if isinstance(r["metrics"]["classification"], dict)
                 and r["metrics"]["classification"].get("score") is not None]

    agg = {
        "variant": cfg.variant_name,
        "dataset": os.path.basename(cfg.dataset_path),
        "dataset_hash": ds_hash,
        "n_cases": len(results),
        "skipped": skipped,
        "seed": cfg.seed,
        "judge_model": cfg.judge_model,
        "judge_used": judge_available(cfg),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "metrics": {
            "classification_accuracy": _mean(col("classification")),
            "classification_major_rate": round(sum(1 for x in cls_major if x) / len(cls_major), 4) if cls_major else None,
            "hazard_coverage": _mean(col("hazard_coverage")),
            "hazard_core_recall": _mean(col("hazard_coverage", "core_recall")),
            "grade_alignment_general": _mean(general),
            "grade_alignment_boundary": _mean(boundary),
            "grade_alignment_overall": _mean(general + boundary),
            "citation_precision": _mean(col("citation", "precision")),
            "citation_recall": _mean(col("citation", "recall")),
            "legal_recall": _mean(col("citation", "legal_recall")),
            "refuse_appropriateness": _mean(col("refuse")),
            "faithfulness": _mean(col("faithfulness")),
            "control_verifiability": _mean(col("control_verifiability")),
        },
        "critical_fail_count": len(all_crit),
        "critical_fail_breakdown": {c: all_crit.count(c) for c in sorted(set(all_crit))},
        "per_case": [_per_case_entry(r) for r in results],
    }
    return agg


def _per_case_entry(r: dict) -> dict:
    """per_case 적재 — crit + 분류/hazard 일치(회귀 변동 추적) + cited/acceptable rows(safety 권고)."""
    m = r["metrics"]
    cls = m.get("classification", {}) if isinstance(m.get("classification"), dict) else {}
    haz = m.get("hazard_coverage", {}) if isinstance(m.get("hazard_coverage"), dict) else {}
    cit = m.get("citation", {}) if isinstance(m.get("citation"), dict) else {}
    grade = m.get("grade", {}) if isinstance(m.get("grade"), dict) else {}
    return {
        "id": r["id"],
        "crit": m.get("_critical_fail", []),
        # 회귀 변동 추적용(응답 자체 변동 분리): 분류·hazard·등급 결과
        "cls_score": cls.get("score"),
        "cls_major_correct": cls.get("major_correct"),
        "hazard_recall": haz.get("score"),
        "grade_score": grade.get("score"),
        "grade_pred": grade.get("pred"),
        # 인용 확정값(safety 권고 — 동등집합 채점 재현/검증용)
        "cited_rows": cit.get("cited_rows"),
        "acceptable_rows": cit.get("acceptable_rows"),
        "citation_precision": cit.get("precision"),
        "citation_recall": cit.get("recall"),
    }


# ════════════════════════════════════════════════════════════════════════════
# 8. 회귀 게이트 + 보고서
# ════════════════════════════════════════════════════════════════════════════

def check_thresholds(agg: dict) -> list[str]:
    """PoC 절대 임계 위반 목록."""
    viol = []
    m = agg["metrics"]
    for key, thr in POC_THRESHOLDS.items():
        v = m.get(key)
        if v is not None and v < thr:
            viol.append(f"{key} {v} < {thr}")
    if agg["critical_fail_count"] > 0:
        viol.append(f"critical_fail_count = {agg['critical_fail_count']} (> 0)")
    return viol


def write_report(agg: dict, cfg: EvalConfig, viol: list[str]) -> str:
    """Markdown 보고서 생성."""
    date = datetime.now().strftime("%Y%m%d")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), cfg.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{date}_{cfg.variant_name}.md")

    m = agg["metrics"]
    lines = [
        f"# Eval Report — {cfg.variant_name}",
        "",
        f"- dataset: `{agg['dataset']}` (hash `{agg['dataset_hash']}`)",
        f"- n_cases: {agg['n_cases']} / skipped: {agg['skipped']}",
        f"- seed: {agg['seed']} / judge: {agg['judge_model']} (used={agg['judge_used']})",
        f"- timestamp: {agg['timestamp']}",
        "",
        "## 메트릭",
        "",
        "| 메트릭 | 값 | 임계 | 판정 |",
        "|--------|----|----|------|",
    ]
    rows = [
        ("classification_accuracy", 0.85), ("classification_major_rate", 0.90),
        ("hazard_coverage", 0.80), ("hazard_core_recall", 0.85),
        ("grade_alignment_general", 0.75), ("grade_alignment_boundary", None),
        ("grade_alignment_overall", None),
        ("citation_precision", 0.90), ("citation_recall", 0.70), ("legal_recall", None),
        ("refuse_appropriateness", 0.90), ("faithfulness", 4.0),
        ("control_verifiability", 0.70),
    ]
    for key, thr in rows:
        v = m.get(key)
        vs = "—" if v is None else f"{v}"
        if v is None or thr is None:
            verdict = "—"
        else:
            verdict = "PASS" if v >= thr else "FAIL"
        thrs = "—" if thr is None else f"≥{thr}"
        lines.append(f"| {key} | {vs} | {thrs} | {verdict} |")

    lines += [
        "",
        f"## critical-fail: {agg['critical_fail_count']}건",
        "",
        f"- breakdown: `{json.dumps(agg['critical_fail_breakdown'], ensure_ascii=False)}`",
        "",
        "## 임계 위반",
        "",
    ]
    if viol:
        lines += [f"- {v}" for v in viol]
    else:
        lines.append("- 없음 (전 메트릭 임계 충족 + critical-fail 0)")

    # critical-fail 케이스 발췌
    crit_cases = [c for c in agg["per_case"] if c["crit"]]
    if crit_cases:
        lines += ["", "## critical-fail 케이스", ""]
        for c in crit_cases[:10]:
            lines.append(f"- {c['id']}: {c['crit']}")

    lines += ["", f"_생성: eval-engineer runner.py · {agg['timestamp']}_", ""]

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return path


def write_json_report(agg: dict, cfg: EvalConfig, viol: list[str],
                      regression: dict | None) -> str:
    """실행 결과를 .json으로도 저장(회귀 비교 baseline 입력으로 재사용)."""
    date = datetime.now().strftime("%Y%m%d")
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), cfg.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, f"{date}_{cfg.variant_name}.json")
    doc = dict(agg)
    doc["threshold_violations"] = viol
    if regression is not None:
        doc["regression"] = regression
    with open(path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    return path


# ════════════════════════════════════════════════════════════════════════════
# 8b. 회귀 비교 (baseline JSON 대비 regression_gates.yaml 게이트 적용)
# ════════════════════════════════════════════════════════════════════════════

_GATES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "regression_gates.yaml")


def _load_gates(path: str = _GATES_PATH) -> dict:
    """regression_gates.yaml 로드. PyYAML 없으면 최소 파서(gates·hard_gates만)로 폴백."""
    try:
        import yaml  # type: ignore
        with open(path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except ImportError:
        return _minimal_gates_parse(path)
    except FileNotFoundError:
        print(f"[WARN] regression_gates.yaml 없음 ({path}) — 게이트 미적용", file=sys.stderr)
        return {}


def _minimal_gates_parse(path: str) -> dict:
    """PyYAML 미설치 폴백: gates·hard_gates 리스트만 추출(min_delta·min_absolute·hard)."""
    gates: list[dict] = []
    hard_gates: list[dict] = []
    cur: dict | None = None
    section = None
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                s = line.rstrip("\n")
                stripped = s.strip()
                if stripped.startswith("#") or not stripped:
                    continue
                if stripped == "gates:":
                    section = "gates"; continue
                if stripped == "hard_gates:":
                    section = "hard"; continue
                if stripped in ("informational:", "decision:"):
                    section = None; continue
                if section is None:
                    continue
                if stripped.startswith("- metric:"):
                    cur = {"metric": stripped.split("metric:", 1)[1].strip()}
                    (gates if section == "gates" else hard_gates).append(cur)
                elif cur is not None and ":" in stripped:
                    k, v = stripped.split(":", 1)
                    k, v = k.strip(), v.split("#", 1)[0].strip()
                    if k in ("min_delta", "min_absolute", "max_absolute"):
                        try:
                            cur[k] = float(v)
                        except ValueError:
                            pass
                    elif k == "hard":
                        cur[k] = v.lower() == "true"
                    elif k in ("on_violation", "rule"):
                        cur[k] = v
    except FileNotFoundError:
        print(f"[WARN] regression_gates.yaml 없음 ({path})", file=sys.stderr)
    return {"gates": gates, "hard_gates": hard_gates}


def load_baseline(path: str) -> dict | None:
    """baseline 보고서 JSON 로드. 손실/파싱 실패 시 None → 호출부에서 회귀 비교 차단."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"[ERROR] baseline 로드 실패 ({path}): {e}", file=sys.stderr)
        return None


def compare_regression(agg: dict, baseline: dict, gates_doc: dict) -> dict:
    """baseline 대비 게이트 적용. min_delta·min_absolute(soft) + critical_fail(hard).
    반환: {violations, hard_violations, deltas, blocked} — blocked=True면 exit 1.
    """
    cur_m = agg.get("metrics", {})
    base_m = baseline.get("metrics", {})
    deltas: dict[str, Any] = {}
    soft_viol: list[str] = []
    hard_viol: list[str] = []

    for g in gates_doc.get("gates", []) or []:
        metric = g.get("metric")
        cur = cur_m.get(metric)
        base = base_m.get(metric)
        min_delta = g.get("min_delta")
        min_abs = g.get("min_absolute")
        if cur is None:
            continue
        delta = (cur - base) if isinstance(base, (int, float)) else None
        deltas[metric] = {"baseline": base, "current": cur, "delta": round(delta, 4) if delta is not None else None}
        # min_delta 위반(회귀)
        if delta is not None and min_delta is not None and delta < min_delta:
            entry = f"{metric}: Δ{delta:+.4f} < min_delta {min_delta} (baseline {base} → {cur})"
            (hard_viol if g.get("hard") else soft_viol).append(entry)
        # min_absolute 위반(절대 임계)
        if min_abs is not None and cur < min_abs:
            entry = f"{metric}: {cur} < min_absolute {min_abs}"
            (hard_viol if g.get("hard") else soft_viol).append(entry)

    # ── 하드 게이트: critical_fail_count(증가 또는 >0) ──
    cur_crit = agg.get("critical_fail_count", 0)
    base_crit = baseline.get("critical_fail_count", 0)
    deltas["critical_fail_count"] = {"baseline": base_crit, "current": cur_crit,
                                     "delta": cur_crit - base_crit}
    for hg in gates_doc.get("hard_gates", []) or []:
        if hg.get("metric") == "critical_fail_count":
            max_abs = hg.get("max_absolute", 0)
            if cur_crit > max_abs:
                hard_viol.append(f"critical_fail_count {cur_crit} > {max_abs} (하드 차단)")
            elif cur_crit > base_crit:
                hard_viol.append(f"critical_fail_count {base_crit} → {cur_crit} 증가 (하드 차단)")

    blocked = len(hard_viol) > 0
    return {
        "baseline_variant": baseline.get("variant"),
        "baseline_dataset_hash": baseline.get("dataset_hash"),
        "deltas": deltas,
        "soft_violations": soft_viol,
        "hard_violations": hard_viol,
        "blocked": blocked,
    }


def append_regression_to_md(md_path: str, regression: dict) -> None:
    """기존 .md 보고서에 회귀 비교 섹션 추가(⚠️ 위반 표시)."""
    lines = ["", "## 회귀 비교 (vs baseline)", ""]
    lines.append(f"- baseline variant: `{regression.get('baseline_variant')}` "
                 f"(hash `{regression.get('baseline_dataset_hash')}`)")
    if regression.get("baseline_dataset_hash") and \
            regression["baseline_dataset_hash"] != regression.get("_current_hash"):
        pass
    lines += ["", "| 메트릭 | baseline | current | Δ | 판정 |", "|--------|----|----|----|------|"]
    for metric, d in regression.get("deltas", {}).items():
        b, c, dl = d.get("baseline"), d.get("current"), d.get("delta")
        mark = "OK"
        viol_str = "\n".join(regression.get("soft_violations", []) + regression.get("hard_violations", []))
        if metric in viol_str:
            mark = "⚠️"
        bs = "—" if b is None else f"{b}"
        cs = "—" if c is None else f"{c}"
        ds = "—" if dl is None else f"{dl:+}"
        lines.append(f"| {metric} | {bs} | {cs} | {ds} | {mark} |")

    sv = regression.get("soft_violations", [])
    hv = regression.get("hard_violations", [])
    lines += ["", "### 게이트 위반", ""]
    if not sv and not hv:
        lines.append("- ⓥ 위반 없음 — 회귀 게이트 통과")
    else:
        for v in hv:
            lines.append(f"- ⚠️ [HARD] {v}")
        for v in sv:
            lines.append(f"- ⚠️ [SOFT] {v}")
    if regression.get("blocked"):
        lines += ["", "> ⚠️ **회귀 차단(BLOCKED)** — 하드 게이트 위반. variant 채택 보류 (exit 1)."]
    lines.append("")
    with open(md_path, "a", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ════════════════════════════════════════════════════════════════════════════
# 9. 메인 실행
# ════════════════════════════════════════════════════════════════════════════

def run_eval(cfg: EvalConfig) -> dict:
    ds_hash = sha256_head(cfg.dataset_path)
    cases = load_gold(cfg.dataset_path)
    print(f"[INFO] {len(cases)}건 로드 (hash {ds_hash}, variant={cfg.variant_name}, mock={cfg.mock})")

    results = []
    skipped = 0
    for case in cases:
        if cfg.mock:
            resp = mock_response(case)
        else:
            if not cfg.api_endpoint:
                print("[ERROR] --api-endpoint 필요 (또는 --mock)", file=sys.stderr)
                sys.exit(2)
            resp = call_api(cfg.api_endpoint, case, cfg.model_overrides)
        if resp is None:
            skipped += 1
            continue
        metrics = evaluate_case(case, resp, cfg)
        results.append({"id": case.get("id"), "metrics": metrics})

    agg = aggregate(results, cfg, ds_hash, skipped)
    agg["synonym_map_hash"] = sha256_head(_SYNONYM_MAP_PATH) if os.path.exists(_SYNONYM_MAP_PATH) else None
    viol = check_thresholds(agg)
    report_path = write_report(agg, cfg, viol)

    # ── 회귀 비교 (--baseline 지정 시) ──
    regression: dict | None = None
    if cfg.baseline_report:
        baseline = load_baseline(cfg.baseline_report)
        if baseline is None:
            print("[ERROR] baseline 보고서 손실/파싱 실패 — 회귀 비교 중단", file=sys.stderr)
            agg["_exit_code"] = 2
        else:
            if baseline.get("dataset_hash") != ds_hash:
                print(f"[WARN] dataset hash 불일치 (baseline {baseline.get('dataset_hash')} "
                      f"vs current {ds_hash}) — gold 변경 가능성, 비교 결과 해석 주의", file=sys.stderr)
            gates_doc = _load_gates()
            regression = compare_regression(agg, baseline, gates_doc)
            regression["_current_hash"] = ds_hash
            append_regression_to_md(report_path, regression)
            agg["_regression_blocked"] = regression["blocked"]

    json_path = write_json_report(agg, cfg, viol, regression)

    # 콘솔 요약 (한국어)
    print("\n" + "=" * 60)
    print(f"  변형: {cfg.variant_name} | 케이스 {agg['n_cases']} (skip {skipped})")
    print("=" * 60)
    for k, v in agg["metrics"].items():
        print(f"  {k:32s}: {v}")
    print(f"  {'critical_fail_count':32s}: {agg['critical_fail_count']} {agg['critical_fail_breakdown']}")
    print("-" * 60)
    if viol:
        print(f"  임계 위반 {len(viol)}건:")
        for v in viol:
            print(f"    - {v}")
    else:
        print("  임계 위반 없음 — PoC 합격 후보")
    if regression is not None:
        print("-" * 60)
        sv, hv = regression["soft_violations"], regression["hard_violations"]
        if not sv and not hv:
            print("  회귀 비교: 게이트 통과 (위반 0)")
        else:
            print(f"  회귀 위반: HARD {len(hv)} / SOFT {len(sv)}")
            for v in hv:
                print(f"    ⚠️ [HARD] {v}")
            for v in sv:
                print(f"    ⚠️ [SOFT] {v}")
        if regression["blocked"]:
            print("  >> 회귀 차단(BLOCKED) — exit 1")
    print(f"  보고서: {report_path}")
    print(f"  JSON:   {json_path}")
    print("=" * 60 + "\n")
    return agg


def main():
    p = argparse.ArgumentParser(description="JHA Eval Runner")
    p.add_argument("--dataset", required=True, help="gold set jsonl 경로")
    p.add_argument("--variant", default="baseline", help="변형 이름")
    p.add_argument("--api-endpoint", default=None, help="배치 평가 API endpoint")
    p.add_argument("--mock", action="store_true", help="mock 모드(expected echo, self-test)")
    p.add_argument("--no-judge", action="store_true", help="LLM judge 비활성")
    p.add_argument("--baseline", default=None, help="baseline 보고서(회귀 비교용)")
    p.add_argument("--seed", type=int, default=42)
    args = p.parse_args()

    cfg = EvalConfig(
        dataset_path=args.dataset,
        variant_name=args.variant,
        api_endpoint=args.api_endpoint,
        mock=args.mock,
        use_judge=not args.no_judge,
        baseline_report=args.baseline,
        seed=args.seed,
    )
    agg = run_eval(cfg)
    exit_code = 0

    # baseline 손실(회귀 비교 중단) → exit 2
    if agg.get("_exit_code") == 2:
        exit_code = 2

    # 회귀 하드 게이트 위반 → exit 1
    if agg.get("_regression_blocked"):
        exit_code = 1

    # mock self-test 검증: 결정적 메트릭이 만점이어야 정상
    if cfg.mock:
        det = ["classification_accuracy", "hazard_coverage", "grade_alignment_general",
               "citation_precision", "citation_recall", "refuse_appropriateness"]
        bad = [k for k in det if (agg["metrics"].get(k) is not None and agg["metrics"][k] < 0.999)]
        if bad or agg["critical_fail_count"] > 0:
            print(f"[SELF-TEST FAIL] mock인데 만점 아님: {bad}, crit={agg['critical_fail_count']}", file=sys.stderr)
            sys.exit(1)
        print("[SELF-TEST PASS] mock 결정적 메트릭 만점 + critical-fail 0 — 계산 코드 정상")

    sys.exit(exit_code)


if __name__ == "__main__":
    main()
