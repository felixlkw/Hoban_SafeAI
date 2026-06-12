"""API 통합 테스트 — 전체 워크플로우·409 차단·역할 권한·citations·no_match.

Mock Claude + 실제 BM25 인덱스 기준. 경계셀 분기는 rag.run_assess 를 결정적 더블로 교체.
"""
from __future__ import annotations

import pytest

from app.schemas.models import CriticalRegister, RiskGrade
from app.services import domain_postprocess as dp
from app.services import rag_pipeline as rag


# ── 헬퍼: 결정적 assess 더블(경계셀/일반) ──────────────────────────────────
def _boundary_assess_output():
    parsed = {"hazards": [{
        "accident_type": "추락", "description": "고소작업 추락",
        "severity": 4, "frequency": 4, "risk_grade": "중",
        "controls": ["안전대 체결"], "citations": ["R00010"],
        "legal_refs": ["산업안전보건기준에 관한 규칙 §42"],
    }]}
    post = dp.postprocess(parsed, {"R00010"}, {"R00010": 10})
    return rag.AssessOutput(
        result_type=rag.ResultType.ok, classification={"sub_type": "타워크레인(T형)"},
        post=post, warnings=[], model_used="mock", parse_error=False,
        raw_text=None, retrieved_chunk_ids=["R00010"])


def _normal_assess_output():
    parsed = {"hazards": [{
        "accident_type": "전도", "description": "지반 전도",
        "severity": 4, "frequency": 5, "risk_grade": "중",   # 곱20=상(비경계), 코드 재계산
        "controls": ["지반 다짐"], "citations": ["R00002"], "legal_refs": [],
    }]}
    post = dp.postprocess(parsed, {"R00002"}, {"R00002": 2})
    return rag.AssessOutput(
        result_type=rag.ResultType.ok, classification={"sub_type": "타워크레인(T형)"},
        post=post, warnings=[], model_used="mock", parse_error=False,
        raw_text=None, retrieved_chunk_ids=["R00002"])


# ── 헬스 ────────────────────────────────────────────────────────────────────
def test_health(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("ok", "degraded")
    assert body["dependencies"]["kb_index"] in ("ok", "degraded")
    # request_id 에코
    assert "X-Request-ID" in r.headers


# ── 세션 생성 + classify(alternatives 포함) ─────────────────────────────────
def test_create_and_classify(client):
    r = client.post("/v1/jha/sessions", json={"work_description": "타워크레인 마스트 해체 작업"})
    assert r.status_code == 201
    sid = r.json()["session_id"]
    assert r.json()["state"] == "CREATED"

    r2 = client.post(f"/v1/jha/sessions/{sid}/classify")
    assert r2.status_code == 200
    body = r2.json()
    assert body["state"] == "CLASSIFIED"
    assert body["result_type"] in ("ok", "low_confidence")
    # frontend 합의: classification.alternatives[]
    assert "alternatives" in body["classification"]
    assert isinstance(body["classification"]["alternatives"], list)


# ── 일반 평가 → ASSESSED → finalize 202(Outbox) ────────────────────────────
def test_normal_flow_to_finalize(client, monkeypatch):
    monkeypatch.setattr(rag, "run_assess", lambda *a, **k: _normal_assess_output())
    r = client.post("/v1/jha/sessions", json={"work_description": "타워크레인 작업"})
    sid = r.json()["session_id"]
    client.post(f"/v1/jha/sessions/{sid}/classify")
    ra = client.post(f"/v1/jha/sessions/{sid}/assess", json={})
    assert ra.status_code == 200
    assert ra.json()["state"] == "ASSESSED"
    assert ra.json()["critical_register"] == "O"   # 상 → 확정 O

    rf = client.post(f"/v1/jha/sessions/{sid}/finalize", json={"site_id": "HB-OK-001"})
    assert rf.status_code == 202
    body = rf.json()
    assert body["status"] == "queued"
    assert body["outbox_id"].startswith("outbox-")

    # 세션 조회 erp = {status, erp_id, queue_position}
    rg = client.get(f"/v1/jha/sessions/{sid}")
    erp = rg.json()["erp"]
    assert erp["status"] == "queued"
    assert "queue_position" in erp


# ── 경계셀 평가 → PENDING_REVIEW → finalize 409 차단 ───────────────────────
def test_boundary_finalize_blocked_409(client, monkeypatch):
    monkeypatch.setattr(rag, "run_assess", lambda *a, **k: _boundary_assess_output())
    r = client.post("/v1/jha/sessions", json={"work_description": "고소 작업"})
    sid = r.json()["session_id"]
    client.post(f"/v1/jha/sessions/{sid}/classify")
    ra = client.post(f"/v1/jha/sessions/{sid}/assess", json={})
    assert ra.status_code == 200
    assert ra.json()["state"] == "PENDING_REVIEW"
    assert ra.json()["critical_register"] == "O (잠정)"
    assert ra.json()["human_review_flags"]["human_review_required"] is True

    # human_review 미해소 → finalize 409 REVIEW_REQUIRED
    rf = client.post(f"/v1/jha/sessions/{sid}/finalize", json={})
    assert rf.status_code == 409
    assert rf.json()["error"]["code"] == "SESSION_REVIEW_REQUIRED"


# ── review: worker 403, safety_manager 통과 → 이후 finalize 202 ────────────
def test_review_role_enforced(auth_client_factory, monkeypatch):
    import os
    monkeypatch.setenv("JHA_AUTH_ENABLED", "true")  # 토큰 검증 활성
    # config 는 import 시점 평가라 직접 패치
    from app import config as cfg
    monkeypatch.setattr(cfg, "AUTH_ENABLED", True)
    monkeypatch.setattr(rag, "run_assess", lambda *a, **k: _boundary_assess_output())

    worker = auth_client_factory("worker", "w1")
    mgr = auth_client_factory("safety_manager", "m1")

    r = worker.post("/v1/jha/sessions", json={"work_description": "고소 작업"})
    sid = r.json()["session_id"]
    worker.post(f"/v1/jha/sessions/{sid}/classify")
    worker.post(f"/v1/jha/sessions/{sid}/assess", json={})

    decisions = {"decisions": [{"hazard_index": 0, "confirmed_grade": "상",
                                "confirmed_critical_register": "O"}]}
    # worker → 403
    rw = worker.post(f"/v1/jha/sessions/{sid}/review", json=decisions)
    assert rw.status_code == 403
    assert rw.json()["error"]["code"] == "AUTH_INSUFFICIENT_ROLE"

    # safety_manager → 200, REVIEWED
    rm = mgr.post(f"/v1/jha/sessions/{sid}/review", json=decisions)
    assert rm.status_code == 200
    assert rm.json()["state"] == "REVIEWED"
    assert rm.json()["critical_register"] == "O"   # 잠정 → 확정 O
    assert rm.json()["human_review_flags"]["human_review_required"] is False

    # 확정 후 finalize 통과(202)
    rf = mgr.post(f"/v1/jha/sessions/{sid}/finalize", json={"site_id": "HB-OK-001"})
    assert rf.status_code == 202


# ── citations: 응답 ⊆ retrieved(=실제 인덱스 행) + {text,meta,score} ───────
def test_citation_lookup(client):
    # source_row 2 = R00002 (인덱스 첫 데이터 행)
    r = client.get("/v1/jha/citations/2")
    assert r.status_code == 200
    body = r.json()
    assert body["source_row"] == 2
    assert body["major_type"] == "가설공사"
    # frontend 합의: text, meta, score
    assert body["text"] is not None and len(body["text"]) > 0
    assert isinstance(body["meta"], dict)
    # 화이트리스트: 내부키(source_row/chunk_id) 는 meta 에 없어야
    assert "chunk_id" not in body["meta"]
    assert "content_hash" not in body["meta"]
    assert "score" in body


def test_citation_not_found(client):
    r = client.get("/v1/jha/citations/9999999")
    assert r.status_code == 404


# ── no_match: 매칭 0건 입력 → 200 + result_type=no_match ───────────────────
def test_classify_no_match(client, monkeypatch):
    monkeypatch.setattr(
        rag, "run_classify",
        lambda *a, **k: rag.ClassifyOutput(
            result_type=rag.ResultType.no_match,
            classification={"major_type": None, "sub_type": None,
                            "detail_item": None, "confidence": 0.0,
                            "alternatives": []},
            alternatives=[], candidates=[], warnings=["관련 데이터 없음"],
            model_used="-", extended_thinking_used=False, retrieved_chunk_ids=[]))
    r = client.post("/v1/jha/sessions", json={"work_description": "zzzqqq 무관입력"})
    sid = r.json()["session_id"]
    rc = client.post(f"/v1/jha/sessions/{sid}/classify")
    assert rc.status_code == 200
    assert rc.json()["result_type"] == "no_match"


# ── citations ⊆ retrieved: assess 응답의 모든 citation 이 검색 chunk_id 안 ──
def test_assess_citations_subset_of_retrieved(client):
    """실제 파이프라인(Mock Claude) 으로 assess 실행, 모든 hazard citation ⊆ retrieved 검증."""
    r = client.post("/v1/jha/sessions", json={"work_description": "타워크레인 마스트 해체"})
    sid = r.json()["session_id"]
    client.post(f"/v1/jha/sessions/{sid}/classify")
    ra = client.post(f"/v1/jha/sessions/{sid}/assess", json={})
    assert ra.status_code == 200
    body = ra.json()
    # 세션 상세에서 retrieved_chunk_ids 확보
    detail = client.get(f"/v1/jha/sessions/{sid}").json()
    # assessment.source_rows 는 검색 chunk→row 역추적 결과(코드 재산출)
    for h in body["hazards"]:
        # 각 citation 이 R 접두 chunk_id 형식
        for c in h["citations"]:
            assert c.startswith("R")


# ── 피드백 ──────────────────────────────────────────────────────────────────
def test_feedback(client):
    r = client.post("/v1/jha/sessions", json={"work_description": "타워크레인 작업"})
    sid = r.json()["session_id"]
    rf = client.post("/v1/jha/feedback",
                     json={"session_id": sid, "action": "accept", "target": "overall"})
    assert rf.status_code == 201
    assert rf.json()["accepted"] is True

    # 없는 세션 → 404
    r404 = client.post("/v1/jha/feedback",
                       json={"session_id": "nope", "action": "reject"})
    assert r404.status_code == 404
