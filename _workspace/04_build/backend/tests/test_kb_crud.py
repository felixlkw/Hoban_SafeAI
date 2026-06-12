"""KB CRUD + 도메인 규칙 서버 강제 테스트.

- 등급 임계곱 재계산(클라이언트 입력 무시)
- 중점등록 자동(상⇔O) + 곱16 경계셀 입력 존중 + boundary 플래그
- taxonomy 검증(미등록 대/중공종 거부, 신규 세부항목 허용 + [신규] 플래그)
- soft delete
- RoleGate(worker 403)
- 감사 로그
"""
from __future__ import annotations

import json

from app.services.kb_store import (apply_domain_rules, build_chunk_text,
                                   get_kb_store, recompute_grade)


# ── 단위: 도메인 규칙 ─────────────────────────────────────────────────────
def test_recompute_grade_thresholds():
    assert recompute_grade(3, 3) == "하"   # 9
    assert recompute_grade(2, 5) == "중"   # 10
    assert recompute_grade(3, 5) == "중"   # 15
    assert recompute_grade(4, 4) == "상"   # 16 (경계셀도 상)
    assert recompute_grade(5, 5) == "상"   # 25


def test_boundary_cell_respects_input_critical():
    # 곱16 경계셀: 입력 X 존중
    r = apply_domain_rules(4, 4, "X")
    assert r["risk_grade"] == "상" and r["boundary_cell"] is True
    assert r["critical_register"] == "X"
    # 기본(미입력) → O
    r2 = apply_domain_rules(4, 4, None)
    assert r2["critical_register"] == "O" and r2["boundary_cell"] is True


def test_non_boundary_critical_is_automatic():
    # 상(곱20) → O 자동(입력 X 무시)
    r = apply_domain_rules(5, 4, "X")
    assert r["risk_grade"] == "상" and r["critical_register"] == "O"
    assert r["boundary_cell"] is False
    # 하(곱6) → X 자동(입력 O 무시)
    r2 = apply_domain_rules(2, 3, "O")
    assert r2["risk_grade"] == "하" and r2["critical_register"] == "X"


# ── API: 생성 시 등급 재계산(클라이언트 입력 무시) ────────────────────────
def _mgr(auth_client_factory):
    return auth_client_factory(role="safety_manager", user_id="mgr1")


def test_create_recomputes_grade_ignoring_client(auth_client_factory):
    c = _mgr(auth_client_factory)
    body = {
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "추락",
        "severity": 5, "frequency": 4,   # 곱20 → 상
        "hazard_text": "고소 작업 중 추락 위험",
        "controls": "안전대 착용 · 안전난간 설치",
    }
    r = c.post("/v1/kb/rows", json=body)
    assert r.status_code == 201, r.text
    row = r.json()
    assert row["risk_grade"] == "상"
    assert row["critical_register"] == "O"   # 상 → O 자동
    assert row["risk_product"] == 20
    assert row["chunk_id"].startswith("N")   # 신규 chunk_id 형식
    assert row["boundary_cell"] is False


def test_create_rejects_unknown_major(auth_client_factory):
    c = _mgr(auth_client_factory)
    body = {
        "major_type": "존재하지않는공종", "sub_type": "X", "detail_item": "Y",
        "accident_type": "기타", "severity": 3, "frequency": 3,
        "hazard_text": "테스트",
    }
    r = c.post("/v1/kb/rows", json=body)
    assert r.status_code == 422
    assert "미등록" in r.json()["error"]["message"]


def test_create_allows_new_detail_with_flag(auth_client_factory):
    c = _mgr(auth_client_factory)
    body = {
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "신규세부작업XYZ", "accident_type": "기타",
        "severity": 2, "frequency": 2, "hazard_text": "신규 위험",
    }
    r = c.post("/v1/kb/rows", json=body)
    assert r.status_code == 201, r.text
    assert r.json()["is_new_detail"] is True


# ── RoleGate ───────────────────────────────────────────────────────────────
def test_worker_forbidden(auth_client_factory):
    c = auth_client_factory(role="worker", user_id="w1")
    r = c.get("/v1/kb/rows")
    assert r.status_code == 403
    r2 = c.post("/v1/kb/rows", json={
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "기타",
        "severity": 3, "frequency": 3, "hazard_text": "x"})
    assert r2.status_code == 403


def test_admin_allowed(auth_client_factory):
    c = auth_client_factory(role="admin", user_id="a1")
    r = c.get("/v1/kb/stats")
    assert r.status_code == 200


# ── soft delete ────────────────────────────────────────────────────────────
def test_soft_delete_excludes_from_list(auth_client_factory):
    c = _mgr(auth_client_factory)
    created = c.post("/v1/kb/rows", json={
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "기타",
        "severity": 3, "frequency": 3, "hazard_text": "삭제대상위험"}).json()
    cid = created["chunk_id"]
    d = c.delete(f"/v1/kb/rows/{cid}")
    assert d.status_code == 200 and d.json()["row_status"] == "deleted"
    # 기본 목록에서 제외
    rows = c.get("/v1/kb/rows", params={"q": "삭제대상위험"}).json()["rows"]
    assert all(x["chunk_id"] != cid for x in rows)
    # include_deleted=true 면 포함
    rows2 = c.get("/v1/kb/rows", params={"q": "삭제대상위험",
                                         "include_deleted": True}).json()["rows"]
    assert any(x["chunk_id"] == cid for x in rows2)


# ── 감사 로그 ──────────────────────────────────────────────────────────────
def test_audit_log_records_mutations(auth_client_factory):
    c = _mgr(auth_client_factory)
    created = c.post("/v1/kb/rows", json={
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "기타",
        "severity": 3, "frequency": 3, "hazard_text": "감사테스트"}).json()
    cid = created["chunk_id"]
    c.put(f"/v1/kb/rows/{cid}", json={
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "추락",
        "severity": 5, "frequency": 5, "hazard_text": "감사테스트 수정"})
    store = get_kb_store()
    log = store.audit_log(cid)
    ops = [e["op"] for e in log]
    assert "create" in ops and "update" in ops
    assert all(e["actor"] == "mgr1" for e in log)


# ── chunk 포맷 동일성(chunk.py build_text 와 바이트 동일) ───────────────────
def test_build_chunk_text_matches_seed():
    """시드 chunks.jsonl 의 text 를 메타로 재생성 시 바이트 동일(재인덱싱 정합)."""
    from app import config
    n_checked = 0
    with open(config.CHUNKS_PATH, encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= 50:
                break
            rec = json.loads(line)
            regenerated = build_chunk_text(rec["metadata"])
            assert regenerated == rec["text"], f"포맷 불일치: {rec['chunk_id']}"
            n_checked += 1
    assert n_checked > 0
