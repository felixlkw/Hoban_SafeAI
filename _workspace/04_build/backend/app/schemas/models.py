"""Pydantic v2 스키마 — api_openapi.yaml 정합.

frontend 합의 추가 반영:
  1. classification.alternatives[] = {label, level, confidence}  (분류 대안 2~3건)
  2. Citation 응답에 {text, meta, score} 원문 상세
  3. SessionDetail.erp = {status, erp_id, queue_position}
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── 열거형 ────────────────────────────────────────────────────────────────
class SessionState(str, Enum):
    CREATED = "CREATED"
    CLASSIFIED = "CLASSIFIED"
    ASSESSED = "ASSESSED"
    PENDING_REVIEW = "PENDING_REVIEW"
    REVIEWED = "REVIEWED"
    FINALIZED = "FINALIZED"
    REGISTERING = "REGISTERING"
    COMPLETED = "COMPLETED"
    REGISTER_FAILED = "REGISTER_FAILED"


class ResultType(str, Enum):
    ok = "ok"
    low_confidence = "low_confidence"
    no_match = "no_match"
    refused_partial = "refused_partial"
    refused_full = "refused_full"


class RiskGrade(str, Enum):
    HIGH = "상"
    MEDIUM = "중"
    LOW = "하"


class CriticalRegister(str, Enum):
    O = "O"
    X = "X"
    O_TENTATIVE = "O (잠정)"


# ── 입력 ──────────────────────────────────────────────────────────────────
class SessionCreate(BaseModel):
    work_description: str = Field(min_length=2, max_length=2000,
                                  examples=["타워크레인 마스트 해체 작업"])
    site_id: Optional[str] = None
    worker_count: Optional[int] = Field(default=None, ge=1)
    meta: dict[str, Any] = Field(default_factory=dict)


class ConfirmedClassification(BaseModel):
    major_type: Optional[str] = None
    sub_type: Optional[str] = None
    detail_item: Optional[str] = None


class AssessRequest(BaseModel):
    confirmed_classification: Optional[ConfirmedClassification] = None


class ReviewDecision(BaseModel):
    hazard_index: int = Field(ge=0)
    confirmed_grade: RiskGrade
    confirmed_critical_register: Optional[CriticalRegister] = None
    note: Optional[str] = None


class ReviewRequest(BaseModel):
    decisions: list[ReviewDecision]
    reviewer_note: Optional[str] = None


class FinalizeRequest(BaseModel):
    site_id: Optional[str] = None
    worker_edits: dict[str, Any] = Field(default_factory=dict)


class FeedbackCreate(BaseModel):
    session_id: str
    action: str  # accept | edit | reject
    target: Optional[str] = None
    hazard_index: Optional[int] = None
    corrected_value: dict[str, Any] = Field(default_factory=dict)
    comment: Optional[str] = None


# ── 분류 결과 ─────────────────────────────────────────────────────────────
class Alternative(BaseModel):
    """frontend 합의: 분류 대안 후보 {label, level, confidence}."""
    label: str
    level: str   # major | sub | detail
    confidence: float


class Classification(BaseModel):
    major_type: Optional[str] = None
    sub_type: Optional[str] = None
    detail_item: Optional[str] = None
    confidence: float = 0.0
    # frontend 합의 추가
    alternatives: list[Alternative] = Field(default_factory=list)


class Candidate(BaseModel):
    major_type: Optional[str] = None
    sub_type: Optional[str] = None
    detail_item: Optional[str] = None
    confidence: float = 0.0
    source_rows: list[int] = Field(default_factory=list)


class ClassificationResult(BaseModel):
    session_id: str
    state: SessionState
    result_type: ResultType
    classification: Classification
    candidates: list[Candidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    model_used: Optional[str] = None
    extended_thinking_used: bool = False


# ── 평가 결과 ─────────────────────────────────────────────────────────────
class Hazard(BaseModel):
    accident_type: str
    description: str
    severity: int = Field(ge=1, le=5)
    frequency: int = Field(ge=1, le=5)
    risk_grade: RiskGrade
    boundary_cell: bool = False
    controls: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    legal_refs: list[str] = Field(default_factory=list)


class HumanReviewFlags(BaseModel):
    boundary_cell: bool = False
    human_review_required: bool = False
    legal_critical_candidate: bool = False
    data_gap: bool = False
    gap_areas: list[str] = Field(default_factory=list)
    low_citation_confidence: bool = False


class AssessmentResult(BaseModel):
    session_id: str
    state: SessionState
    result_type: ResultType
    classification: dict[str, Any] = Field(default_factory=dict)
    hazards: list[Hazard] = Field(default_factory=list)
    critical_register: CriticalRegister = CriticalRegister.X
    critical_register_reasons: list[str] = Field(default_factory=list)
    legal_refs: list[str] = Field(default_factory=list)
    human_review_flags: HumanReviewFlags = Field(default_factory=HumanReviewFlags)
    warnings: list[str] = Field(default_factory=list)
    source_rows: list[int] = Field(default_factory=list)
    model_used: Optional[str] = None
    parse_error: bool = False
    raw_text: Optional[str] = None


# ── 세션 ──────────────────────────────────────────────────────────────────
class Session(BaseModel):
    session_id: str
    state: SessionState
    work_description: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    owner_user_id: Optional[str] = None


class ErpStatus(BaseModel):
    """frontend 합의: SessionDetail.erp = {status, erp_id, queue_position}."""
    status: str = "none"               # none|queued|registering|registered|failed
    erp_id: Optional[str] = None
    queue_position: Optional[int] = None
    register_state: Optional[str] = None
    attempts: int = 0
    last_error: Optional[str] = None


class SessionDetail(BaseModel):
    session: Session
    classification: Optional[ClassificationResult] = None
    assessment: Optional[AssessmentResult] = None
    review: dict[str, Any] = Field(default_factory=dict)
    erp: ErpStatus = Field(default_factory=ErpStatus)


class FinalizationResult(BaseModel):
    session_id: str
    state: SessionState
    outbox_id: str
    status: str = "queued"
    message: str = "ERP 등록이 큐잉되었습니다."


# ── 인용 ──────────────────────────────────────────────────────────────────
class Citation(BaseModel):
    source_row: int
    major_type: Optional[str] = None
    sub_type: Optional[str] = None
    detail_item: Optional[str] = None
    accident_type: Optional[str] = None
    hazard_text: Optional[str] = None
    control_text: Optional[str] = None
    severity: Optional[int] = None
    frequency: Optional[int] = None
    legal_refs: list[str] = Field(default_factory=list)
    # frontend 합의 추가: 원문 상세
    text: Optional[str] = None         # 청크 원문 텍스트
    meta: dict[str, Any] = Field(default_factory=dict)  # 화이트리스트 메타
    score: Optional[float] = None      # 검색 score(조회 맥락 있을 때)


# ── KB CRUD (안전관리자·admin 전용) ───────────────────────────────────────
class KbRowWrite(BaseModel):
    """KB 행 생성/수정 입력. 등급·중점등록은 서버가 강제 재계산(입력 무시)."""
    major_type: str
    sub_type: str
    detail_item: str
    accident_type: str = "기타"
    severity: int = Field(ge=1, le=5)
    frequency: int = Field(ge=1, le=5)
    hazard_text: str = Field(min_length=1)
    controls: str = ""
    # 곱16 경계셀에서만 존중. 그 외 서버 자동.
    critical_register: Optional[CriticalRegister] = None
    legal_refs: list[str] = Field(default_factory=list)


class KbRow(BaseModel):
    """KB 행 응답(운영 SSOT 단건)."""
    chunk_id: str
    source_row: Optional[int] = None
    major_type: Optional[str] = None
    sub_type: Optional[str] = None
    detail_item: Optional[str] = None
    accident_type: Optional[str] = None
    severity: Optional[int] = None
    frequency: Optional[int] = None
    risk_product: Optional[int] = None
    risk_grade: Optional[str] = None
    critical_register: Optional[str] = None
    boundary_cell: bool = False
    is_new_detail: bool = False
    hazard_text: Optional[str] = None
    hazard_items: list[str] = Field(default_factory=list)
    controls: Optional[str] = None
    controls_items: list[str] = Field(default_factory=list)
    legal_refs: list[str] = Field(default_factory=list)
    row_status: str = "active"
    updated_at: Optional[str] = None
    updated_by: Optional[str] = None


class KbRowList(BaseModel):
    rows: list[KbRow]
    total: int
    offset: int
    limit: int


class KbStats(BaseModel):
    active_rows: int
    deleted_rows: int
    new_rows: int
    by_major_type: dict[str, int] = Field(default_factory=dict)
    by_risk_grade: dict[str, int] = Field(default_factory=dict)
    # 재인덱싱 상태(reindex.py ReindexState 미러)
    reindex_status: str = "idle"
    index_version: int = 0
    last_reindex_at: Optional[str] = None
    doc_count: int = 0
    last_change_ratio: float = 0.0
    regression_recommended: bool = False


class ReindexAck(BaseModel):
    status: str
    index_version: int
    doc_count: int
    last_reindex_at: Optional[str] = None
    last_duration_ms: Optional[float] = None
    regression_recommended: bool = False


# ── 피드백·헬스 ───────────────────────────────────────────────────────────
class FeedbackAck(BaseModel):
    feedback_id: str
    accepted: bool = True


class HealthDeps(BaseModel):
    kb_index: str = "ok"
    claude_api: str = "ok"
    session_store: str = "ok"
    erp_adapter: str = "ok"


class Health(BaseModel):
    status: str = "ok"
    version: str
    dependencies: HealthDeps = Field(default_factory=HealthDeps)


# ── 에러 ──────────────────────────────────────────────────────────────────
class ErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)
    request_id: Optional[str] = None


class ErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    error: ErrorBody
