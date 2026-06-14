"""pytest 공통 픽스처 — 인증 비활성·싱글톤 초기화·테스트 클라이언트.

테스트는 ANTHROPIC_API_KEY 미설정(Mock Claude) + 실제 BM25 인덱스 기준.
"""
from __future__ import annotations

import glob
import os
import tempfile

os.environ.setdefault("JHA_AUTH_ENABLED", "false")   # 기본 인증 우회(별도 토큰 테스트는 개별 설정)
os.environ.setdefault("JHA_FORCE_MOCK", "true")      # Claude Mock 강제
# 동적 위험: 테스트는 항상 mock provider(실 공공 API 비호출). conftest 가 config 의
# _load_dotenv(override=False) 보다 먼저 설정하므로 .env 의 kma/vworld 가 무시됨.
os.environ.setdefault("JHA_WEATHER_PROVIDER", "mock")
os.environ.setdefault("JHA_GEO_PROVIDER", "mock")
# KB 저장소: 테스트 세션 전용 임시 디렉토리(원본 kb.sqlite 절대 비접근).
# 매 테스트가 이 디렉토리 안에 고유 파일명 SQLite 를 쓰도록 _reset_singletons 에서 주입.
_TMP_KB_DIR = tempfile.mkdtemp(prefix="jha_test_kb_")
os.environ.setdefault("JHA_REINDEX_DEBOUNCE", "0.05")

# 테스트 시드: 소형 코퍼스(150행) — 매 테스트 독립 시드 + BM25 재빌드를 빠르게.
# 전체 4,469행을 매 테스트 재인덱싱하면 테스트당 ~수십초 → 스위트 hang 수준.
# 150행이면 1행 추가 시 변경비율 ~0.67%(<5%) 라 regression_recommended 단언도 유지.
_FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")
os.environ.setdefault("JHA_CHUNKS", os.path.join(_FIXTURES, "test_chunks.jsonl"))
os.environ.setdefault("JHA_BM25_INDEX", os.path.join(_FIXTURES, "test_bm25_index.pkl"))

import pytest
from fastapi.testclient import TestClient


def _purge_sqlite(path: str) -> None:
    """SQLite 본체 + WAL/SHM 사이드카 제거(락 잔존 방지)."""
    for p in (path, path + "-wal", path + "-shm", path + "-journal"):
        try:
            if os.path.exists(p):
                os.remove(p)
        except OSError:
            pass


@pytest.fixture(autouse=True)
def _reset_singletons(request):
    """각 테스트 전 세션/Outbox/ERP/KB/reindex 싱글톤 초기화(상태 격리).

    각 테스트는 고유 SQLite 파일(테스트 노드명 기반)을 쓰므로 'database is locked'
    (공유 파일 동시 접근) 가 구조적으로 발생할 수 없다.
    """
    from app.services import session_store
    from app.outbox import worker
    from app.adapters import erp_adapter
    from app.services import kb_store, reindex
    from app.adapters import kb_client
    from app import config as cfg

    # 테스트 노드명 → 안전한 파일명. 각 테스트 고유 SQLite(완전 격리).
    safe = "".join(ch if ch.isalnum() else "_" for ch in request.node.nodeid)[-80:]
    db_path = os.path.join(_TMP_KB_DIR, f"{safe}.sqlite")
    os.environ["JHA_KB_SQLITE"] = db_path
    cfg.KB_SQLITE_PATH = db_path   # config 캐시 값도 동기화(모듈 로드시 고정되므로)

    # 직전 테스트 잔여 싱글톤·파일 정리(깨끗한 시드)
    try:
        kb_store.reset_kb_store()
    except Exception:  # noqa: BLE001
        pass
    _purge_sqlite(db_path)
    reindex.reset_reindexer()
    kb_client.reset_kb()
    session_store._store = None
    worker._worker = None
    erp_adapter._adapter = None
    yield
    # teardown: 워커/타이머 정리 + 커넥션 닫기 + 파일 제거(락 해제 보장)
    reindex.reset_reindexer()
    try:
        kb_store.reset_kb_store()
    except Exception:  # noqa: BLE001
        pass
    _purge_sqlite(db_path)


def pytest_sessionfinish(session, exitstatus):
    """세션 종료 시 임시 KB 디렉토리 잔재 제거(요약 출력 후 깨끗이 종료)."""
    for p in glob.glob(os.path.join(_TMP_KB_DIR, "*")):
        try:
            os.remove(p)
        except OSError:
            pass
    try:
        os.rmdir(_TMP_KB_DIR)
    except OSError:
        pass


@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)


@pytest.fixture
def auth_client_factory(monkeypatch):
    """역할별 인증 토큰을 단 클라이언트 팩토리(role 권한 테스트용).

    팩토리 생성 시 인증을 활성화(JHA_AUTH_ENABLED=true)하여 토큰 role 이 실제로
    검증되게 한다(RoleGate 테스트 필수). 기본 fixture 는 인증 비활성이므로 분기.
    """
    from app import config as cfg
    from app.main import app
    from app.middleware.auth import encode_token

    monkeypatch.setenv("JHA_AUTH_ENABLED", "true")
    monkeypatch.setattr(cfg, "AUTH_ENABLED", True)

    def _make(role: str = "worker", user_id: str = "u1"):
        c = TestClient(app)
        token = encode_token(user_id, role)
        c.headers.update({"Authorization": f"Bearer {token}"})
        return c
    return _make
