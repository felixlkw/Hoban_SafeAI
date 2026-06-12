"""MockERP 7 시나리오 + Outbox 백오프·idempotency 테스트."""
from __future__ import annotations

import pytest

from app.adapters.erp_adapter import (ErpAuthError, ErpConflict, ErpFatal,
                                     ErpRetryable, MockErpAdapter)
from app.outbox.worker import OutboxStatus, OutboxWorker


def _valid_payload(site="HB-OK-001", *, human_review_required=False,
                   resolved=True, critical="X", mapped=True):
    return {
        "context": {"site_code": site, "approved_by": "EMP-1"},
        "classification": {
            "major_type_code": "HBC-MJ-001" if mapped else None,
            "sub_type_code": "HBC-SB-001" if mapped else None,
        },
        "assessment": {
            "human_review_required": human_review_required,
            "human_review_resolved": resolved,
            "human_review": {"resolved_by": "EMP-9"} if resolved else None,
            "critical_register": critical,
        },
        "citations": [{"law": "산안규칙", "article": "§42", "level": "MUST"}],
    }


# ── 시나리오 1: 정상 등록 ──────────────────────────────────────────────────
def test_scenario_1_success():
    erp = MockErpAdapter()
    r = erp.register_jha(_valid_payload(), "outbox-k1")
    assert r.status == "REGISTERED"
    assert r.erp_jha_id.startswith("JHA-2026-")


# ── 시나리오 2: flaky-* → Retryable ────────────────────────────────────────
def test_scenario_2_flaky_retryable():
    erp = MockErpAdapter()
    with pytest.raises(ErpRetryable):
        erp.register_jha(_valid_payload(site="flaky-001"), "outbox-k2")


# ── 시나리오 3: 동일 idem 재전송 → Conflict(기존 ID 회수) ───────────────────
def test_scenario_3_idem_conflict():
    erp = MockErpAdapter()
    r1 = erp.register_jha(_valid_payload(), "outbox-same")
    with pytest.raises(ErpConflict) as ei:
        erp.register_jha(_valid_payload(), "outbox-same")
    assert ei.value.erp_jha_id == r1.erp_jha_id   # 기존 ID 회수


# ── 시나리오 4: 미매핑 코드 → ErpFatal ─────────────────────────────────────
def test_scenario_4_unmapped_fatal():
    erp = MockErpAdapter()
    with pytest.raises(ErpFatal) as ei:
        erp.register_jha(_valid_payload(mapped=False), "outbox-k4")
    assert ei.value.code == "ERP_MASTER_CODE_UNMAPPED"


# ── 시나리오 5: expired-* → 인증 실패 ──────────────────────────────────────
def test_scenario_5_expired_auth_error():
    erp = MockErpAdapter()
    with pytest.raises(ErpAuthError):
        erp.register_jha(_valid_payload(site="expired-001"), "outbox-k5")


# ── 시나리오 6: human_review 미해소 → ErpFatal(G2 차단) ─────────────────────
def test_scenario_6_human_review_unresolved_fatal():
    erp = MockErpAdapter()
    payload = _valid_payload(human_review_required=True, resolved=False,
                             critical="O (잠정)")
    with pytest.raises(ErpFatal) as ei:
        erp.register_jha(payload, "outbox-k6")
    assert ei.value.code == "ERP_HUMAN_REVIEW_UNRESOLVED"


# ── 시나리오 7: 어댑터 down → Retryable(Outbox 격리) ───────────────────────
def test_scenario_7_adapter_down_retryable():
    erp = MockErpAdapter(healthy=False)
    with pytest.raises(ErpRetryable):
        erp.register_jha(_valid_payload(), "outbox-k7")


# ── Outbox: 정상 등록 ───────────────────────────────────────────────────────
def test_outbox_enqueue_and_register():
    erp = MockErpAdapter()
    wk = OutboxWorker(adapter=erp)
    entry = wk.enqueue("sess-1", _valid_payload())
    assert entry.idempotency_key == entry.entry_id   # idem_key = outbox_entry_id
    wk.process_once(entry.entry_id)
    assert entry.status == OutboxStatus.REGISTERED
    assert entry.erp_jha_id is not None


# ── Outbox: Retryable 한도 N=5 초과 → FAILED + 백오프 누적 ──────────────────
def test_outbox_retryable_exhausts_to_failed():
    erp = MockErpAdapter()
    wk = OutboxWorker(adapter=erp)
    entry = wk.enqueue("sess-2", _valid_payload(site="flaky-001"))
    wk.drain(entry.entry_id)
    assert entry.status == OutboxStatus.FAILED
    assert entry.attempts == 5                       # config.OUTBOX_MAX_ATTEMPTS
    # 백오프 1+2+4+8 = 15s 누적(5번째 시도 후 한도 초과로 중단)
    assert entry.next_attempt_after_s == pytest.approx(1 + 2 + 4 + 8)


# ── Outbox: Fatal → 즉시 FAILED(재시도 금지) ───────────────────────────────
def test_outbox_fatal_no_retry():
    erp = MockErpAdapter()
    wk = OutboxWorker(adapter=erp)
    entry = wk.enqueue("sess-3", _valid_payload(mapped=False))
    wk.drain(entry.entry_id)
    assert entry.status == OutboxStatus.FAILED
    assert entry.attempts == 1                       # 재시도 없음


# ── Outbox: idempotency — 재시도 전반 동일 키 ───────────────────────────────
def test_outbox_idempotency_conflict_path():
    erp = MockErpAdapter()
    wk = OutboxWorker(adapter=erp)
    e1 = wk.enqueue("sess-4", _valid_payload())
    wk.process_once(e1.entry_id)
    first_id = e1.erp_jha_id
    # 같은 엔트리 재처리는 종료상태라 멱등(중복 등록 없음)
    wk.process_once(e1.entry_id)
    assert e1.erp_jha_id == first_id
