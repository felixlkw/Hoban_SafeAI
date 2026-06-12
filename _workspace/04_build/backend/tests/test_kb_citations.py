"""KB ↔ citations 라우트 연결 테스트.

- 신규 행(N{seq}, source_row 음수)이 재인덱싱 후 인용 조회 가능
- 삭제 행은 저장소 fallback 으로 "삭제된 행" 표기
- RAG 가 핫스왑된 최신 인덱스를 통해 신규 행을 검색에 반영
"""
from __future__ import annotations

from app.adapters.kb_client import get_kb
from app.services.reindex import get_reindexer


def _mgr(auth_client_factory):
    return auth_client_factory(role="safety_manager", user_id="mgr1")


def _reader(auth_client_factory):
    """인용 조회용 worker 클라이언트.

    auth_client_factory 가 AUTH_ENABLED 를 전역 활성화하므로, 토큰 없는 plain
    client 는 401 이 된다(인증 활성 누수). citations 는 worker 도 조회 가능하므로
    worker 토큰을 단 클라이언트로 조회한다(엔드포인트 권한 계약과 일치).
    """
    return auth_client_factory(role="worker", user_id="reader1")


def _create(c, kw="CITATIONKWZZZZ"):
    return c.post("/v1/kb/rows", json={
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "절단",
        "severity": 4, "frequency": 4,   # 곱16 경계셀
        "hazard_text": f"{kw} 절단 위험", "controls": "보호장갑"}).json()


def test_new_row_citation_after_reindex(auth_client_factory):
    c = _mgr(auth_client_factory)
    created = _create(c)
    get_reindexer().flush()
    src = created["source_row"]
    assert src < 0   # 신규 행 음수 source_row
    # citations 는 worker 도 조회 가능(엔드포인트 권한 계약)
    r = _reader(auth_client_factory).get(f"/v1/jha/citations/{src}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source_row"] == src
    assert "CITATIONKWZZZZ" in (body["hazard_text"] or "")


def test_boundary_cell_citation_critical_respected(auth_client_factory):
    """곱16 경계셀: critical_register 입력 존중 + boundary_cell 플래그."""
    c = _mgr(auth_client_factory)
    created = c.post("/v1/kb/rows", json={
        "major_type": "가설공사", "sub_type": "타워크레인(T형)",
        "detail_item": "작업 전 준비", "accident_type": "기타",
        "severity": 4, "frequency": 4, "critical_register": "X",
        "hazard_text": "경계셀 검증 위험"}).json()
    assert created["risk_grade"] == "상"
    assert created["boundary_cell"] is True
    assert created["critical_register"] == "X"   # 입력 존중


def test_deleted_row_citation_marked(auth_client_factory):
    c = _mgr(auth_client_factory)
    created = _create(c, kw="DELCITEKWYYYY")
    get_reindexer().flush()
    src = created["source_row"]
    c.delete(f"/v1/kb/rows/{created['chunk_id']}")
    get_reindexer().flush()
    # 인덱스에선 빠졌지만 저장소 fallback 으로 "삭제된 행" 표기
    r = _reader(auth_client_factory).get(f"/v1/jha/citations/{src}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"].startswith("[삭제된 행]")
    assert body["meta"].get("row_status") == "deleted"


def test_rag_uses_latest_index(auth_client_factory):
    """RAG kb_client 가 핫스왑 인덱스를 참조 — 신규 행이 검색 결과에 포함."""
    c = _mgr(auth_client_factory)
    created = _create(c, kw="RAGFRESHKWXXXX")
    get_reindexer().flush()
    kb = get_kb()
    hits = kb.search("RAGFRESHKWXXXX", top_k=5)
    assert any(h.chunk_id == created["chunk_id"] for h in hits)
