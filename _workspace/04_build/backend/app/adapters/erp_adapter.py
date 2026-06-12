"""ERP 어댑터 — 추상 인터페이스 + MockErpAdapter(7 시나리오).

설계: erp_register_flow.md §3 결과 분기, §6.2 G2 어댑터 방어 검증.

예외 4종:
  ErpRetryable — 5xx/timeout/429 일시 장애. Outbox 재시도(지수 백오프).
  ErpConflict  — idem 충돌(이미 등록). 정상 경로 — 기존 erp_jha_id 회수.
  ErpFatal     — 4xx 영구 실패(human_review 미해소·필수인용 누락·마스터 미매핑). 재시도 금지.
  ErpAuthError — 401/403 시크릿 만료. 즉시 중단 + 운영팀 알림.

G2 진입부 방어 검증(이중 방어): 백엔드 G1 게이트를 신뢰하되, 어떤 경로로도
미해소 경계셀이 ERP에 등록되지 않도록 어댑터 경계에서 최종 차단.
"""
from __future__ import annotations

import abc
import logging
from dataclasses import dataclass
from typing import Any, Optional

logger = logging.getLogger("jha.erp")


# ── 예외 4종 ────────────────────────────────────────────────────────────────
class ErpError(Exception):
    """ERP 어댑터 베이스 예외."""

    def __init__(self, message: str, *, code: str = "ERP_ERROR",
                 details: Optional[dict[str, Any]] = None):
        self.code = code
        self.details = details or {}
        super().__init__(message)


class ErpRetryable(ErpError):
    """일시 장애(5xx/timeout/429). Outbox 재시도 대상."""
    def __init__(self, message: str = "ERP 일시 장애", **kw):
        super().__init__(message, code=kw.pop("code", "ERP_RETRYABLE"), **kw)


class ErpConflict(ErpError):
    """idem 충돌 — 이미 등록됨. 정상 경로(기존 ID 회수)."""
    def __init__(self, message: str = "이미 등록된 항목", *, erp_jha_id: str,
                 details: Optional[dict[str, Any]] = None):
        self.erp_jha_id = erp_jha_id
        super().__init__(message, code="ERP_CONFLICT", details=details)


class ErpFatal(ErpError):
    """영구 실패(4xx). 재시도 금지 — 보류 + 운영팀 알림."""
    def __init__(self, message: str = "ERP 영구 실패", **kw):
        super().__init__(message, code=kw.pop("code", "ERP_FATAL"), **kw)


class ErpAuthError(ErpError):
    """인증 실패(401/403). 즉시 중단 + 운영팀 알림. 재시도 금지."""
    def __init__(self, message: str = "ERP 인증 실패", **kw):
        super().__init__(message, code=kw.pop("code", "ERP_AUTH_ERROR"), **kw)


# ── 결과 ────────────────────────────────────────────────────────────────────
@dataclass
class ErpRegisterResult:
    erp_jha_id: str
    registered_at: str
    status: str = "REGISTERED"
    deduplicated: bool = False  # Conflict 경로(기존 ID 회수)면 True


# ── 추상 어댑터 ─────────────────────────────────────────────────────────────
class ErpAdapter(abc.ABC):
    """ERP 등록 어댑터 인터페이스. 운영 어댑터는 본 클래스를 구현."""

    @abc.abstractmethod
    def register_jha(self, payload: dict[str, Any],
                     idempotency_key: str) -> ErpRegisterResult:
        """JHA 등록. 실패 시 ErpRetryable/ErpConflict/ErpFatal/ErpAuthError raise."""
        raise NotImplementedError

    @abc.abstractmethod
    def health(self) -> str:
        """어댑터 헬스 — ok|degraded|down."""
        raise NotImplementedError

    # ── G2 방어 검증 (공통, erp_register_flow §6.2) ────────────────────────
    @staticmethod
    def _defensive_validate(payload: dict[str, Any]) -> None:
        """등록 진입부 방어 검증. 위반 시 ErpFatal(재시도 금지).

        (1) human_review 미해소/증빙 누락 → 차단
        (2) 필수 인용(MUST) 누락 → 차단
        (3) 마스터 코드 미매핑 → 차단
        """
        a = payload.get("assessment", {}) or {}
        # (1) human_review 미해소 차단
        if a.get("human_review_required") and not a.get("human_review_resolved"):
            raise ErpFatal("HUMAN_REVIEW_UNRESOLVED",
                           code="ERP_HUMAN_REVIEW_UNRESOLVED",
                           details={"reason": "경계셀 안전관리자 확인 미완료"})
        if a.get("human_review_required") and not a.get("human_review"):
            raise ErpFatal("HUMAN_REVIEW_EVIDENCE_MISSING",
                           code="ERP_HUMAN_REVIEW_EVIDENCE_MISSING",
                           details={"reason": "human_review 증빙 누락"})
        # (2) 필수 인용(MUST) 누락 차단
        if not ErpAdapter._has_required_citations(payload):
            raise ErpFatal("REQUIRED_CITATION_MISSING",
                           code="ERP_REQUIRED_CITATION_MISSING",
                           details={"reason": "MUST 레벨 인용 누락"})
        # (3) 마스터 코드 미매핑 차단
        if not ErpAdapter._codes_mapped(payload.get("classification", {}) or {}):
            raise ErpFatal("MASTER_CODE_UNMAPPED",
                           code="ERP_MASTER_CODE_UNMAPPED",
                           details={"reason": "공종 마스터 코드 미매핑(map_status != MAPPED)"})

    @staticmethod
    def _has_required_citations(payload: dict[str, Any]) -> bool:
        cites = payload.get("citations") or []
        must = [c for c in cites if (c or {}).get("level") == "MUST"]
        # 중점등록 O 이면 MUST 인용 1건 이상 필수
        crit = (payload.get("assessment", {}) or {}).get("critical_register")
        if crit in ("O", "O (잠정)"):
            return len(must) >= 1
        # 일반: 인용 자체가 1건 이상이면 통과(PoC 기준)
        return len(cites) >= 1

    @staticmethod
    def _codes_mapped(classification: dict[str, Any]) -> bool:
        return bool(classification.get("major_type_code")
                    and classification.get("sub_type_code"))


# ── Mock 어댑터 (7 시나리오 결정적 재현) ────────────────────────────────────
class MockErpAdapter(ErpAdapter):
    """erp_register_flow §3 + 인벤토리 §6.2 트리거로 결과 분기를 결정적 재현.

    7 시나리오(트리거 → 결과):
      1. 정상            → REGISTERED + erp_jha_id
      2. flaky-*         → ErpRetryable (일시 장애, 재시도 대상)
      3. 동일 idem 재전송 → ErpConflict (기존 erp_jha_id 회수, 정상)
      4. 미매핑 코드      → ErpFatal MASTER_CODE_UNMAPPED (G2 방어검증)
      5. expired-*       → ErpAuthError (시크릿 만료, 즉시 중단)
      6. human_review 미해소 → ErpFatal HUMAN_REVIEW_UNRESOLVED (G2 차단)
      7. health FAIL     → ErpRetryable (어댑터 down, Outbox 격리)

    트리거는 payload.context.site_code prefix 또는 분류/평가 필드로 판정.
    """

    def __init__(self, *, healthy: bool = True):
        self._healthy = healthy
        self._registered: dict[str, str] = {}   # idem_key → erp_jha_id (idem 추적)
        self._seq = 0

    def set_health(self, healthy: bool) -> None:
        self._healthy = healthy

    def health(self) -> str:
        return "ok" if self._healthy else "down"

    def register_jha(self, payload: dict[str, Any],
                     idempotency_key: str) -> ErpRegisterResult:
        # 시나리오 7: 어댑터 down → Retryable (Outbox 격리, 재시도)
        if not self._healthy:
            raise ErpRetryable("ERP 어댑터 헬스 FAIL — 등록 보류",
                               code="ERP_ADAPTER_DOWN")

        # 시나리오 3: 동일 idem 재전송 → Conflict (기존 ID 회수)
        if idempotency_key in self._registered:
            raise ErpConflict(erp_jha_id=self._registered[idempotency_key],
                              details={"idempotency_key": idempotency_key})

        site = str((payload.get("context", {}) or {}).get("site_code", ""))

        # 시나리오 5: expired-* → 인증 실패 (즉시 중단)
        if site.startswith("expired-"):
            raise ErpAuthError("ERP 시크릿 만료 — 즉시 중단",
                               details={"site_code": site})

        # 시나리오 2: flaky-* → Retryable (일시 장애)
        if site.startswith("flaky-"):
            raise ErpRetryable("ERP 일시 장애(flaky)",
                               details={"site_code": site})

        # 시나리오 4·6: G2 방어 검증 (미매핑/미해소 → ErpFatal)
        self._defensive_validate(payload)

        # 시나리오 1: 정상 등록
        self._seq += 1
        erp_id = f"JHA-2026-{self._seq:06d}"
        self._registered[idempotency_key] = erp_id
        logger.info("ERP 등록 성공: %s (idem=%s)", erp_id, idempotency_key)
        return ErpRegisterResult(erp_jha_id=erp_id,
                                 registered_at="2026-06-10T09:30:06+09:00")


# ── 싱글톤 ─────────────────────────────────────────────────────────────────
_adapter: Optional[ErpAdapter] = None


def get_erp_adapter() -> ErpAdapter:
    global _adapter
    if _adapter is None:
        _adapter = MockErpAdapter()
    return _adapter
