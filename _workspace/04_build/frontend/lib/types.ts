/**
 * API 응답 타입 — api_openapi.yaml 계약 기준.
 * 합의된 추가 필드: classification.alternatives[], citations 상세 {text,meta,score},
 * session.erp={status, erp_id, queue_position}.
 */

export type SessionState =
  | "CREATED"
  | "CLASSIFIED"
  | "ASSESSED"
  | "PENDING_REVIEW"
  | "REVIEWED"
  | "FINALIZED"
  | "REGISTERING"
  | "COMPLETED"
  | "REGISTER_FAILED";

export type ResultType =
  | "ok"
  | "low_confidence"
  | "no_match"
  | "refused_partial"
  | "refused_full";

export interface Classification {
  major_type: string | null;
  sub_type: string | null;
  detail_item: string | null;
  confidence: number;
  /** 합의 추가 필드: 대안 후보 (인라인 드롭다운) */
  alternatives?: ClassificationAlternative[];
}

export interface ClassificationAlternative {
  label: string;
  /** major | sub | detail */
  level: "major" | "sub" | "detail";
  major_type?: string;
  sub_type?: string;
  detail_item?: string;
  confidence: number;
  source_rows?: number[];
}

export interface ClassificationResult {
  session_id: string;
  state: SessionState;
  result_type: ResultType;
  classification: Classification;
  candidates?: ClassificationAlternative[];
  warnings?: string[];
  model_used?: string;
  extended_thinking_used?: boolean;
}

/** 합의 추가: citation 상세 (사이드 패널 즉시 표시용) */
export interface CitationDetail {
  text: string;
  meta: {
    major_type?: string;
    sub_type?: string;
    detail_item?: string;
    accident_type?: string;
    source_row?: number;
    legal_refs?: string[];
  };
  score?: number;
}

export interface Hazard {
  accident_type: string;
  description: string;
  severity: number;
  frequency: number;
  risk_grade: string;
  boundary_cell?: boolean;
  controls?: string[];
  citations: string[];
  legal_refs?: string[];
  /** 합의 추가: chunk_id → 상세 (인라인 prefetch) */
  citation_detail?: Record<string, CitationDetail>;
}

export interface HumanReviewFlags {
  boundary_cell?: boolean;
  human_review_required?: boolean;
  legal_critical_candidate?: boolean;
  data_gap?: boolean;
  gap_areas?: string[];
  low_citation_confidence?: boolean;
}

export interface AssessmentResult {
  session_id: string;
  state: SessionState;
  result_type: ResultType;
  classification?: Record<string, unknown>;
  hazards: Hazard[];
  critical_register: "O" | "X" | "O (잠정)";
  critical_register_reasons?: string[];
  legal_refs?: string[];
  human_review_flags: HumanReviewFlags;
  warnings?: string[];
  source_rows: number[];
  model_used?: string;
  parse_error?: boolean;
  raw_text?: string | null;
}

/** 합의 추가: session.erp 비동기 등록 상태 */
export interface ErpState {
  status: "idle" | "pending" | "success" | "failed" | "session_expired";
  erp_id: string | null;
  queue_position?: number;
  register_state?: string;
  attempts?: number;
  last_error?: string | null;
}

export interface FinalizationResult {
  session_id: string;
  state: SessionState;
  outbox_id: string;
  status: "queued";
  message?: string;
  erp?: ErpState;
}

export interface Citation {
  source_row: number;
  major_type?: string;
  sub_type?: string;
  detail_item?: string;
  accident_type?: string;
  hazard_text?: string;
  control_text?: string;
  severity?: number;
  frequency?: number;
  legal_refs?: string[];
}

export interface ReviewDecision {
  hazard_index: number;
  confirmed_grade: "상" | "중" | "하";
  confirmed_critical_register?: "O" | "X";
  note?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id?: string;
}

/** API 클라이언트 표준화 에러 */
export class JhaApiError extends Error {
  code: string;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;
  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "JhaApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable =
      details?.retryable === true ||
      code.startsWith("LLM_") ||
      status === 429 ||
      status >= 500;
  }
}

export type UserRole = "worker" | "safety_manager" | "admin";

// ─────────────────────────────────────────────────────────
// KB(지식베이스) 운영 — 전사 하위공종 위험요인 SSOT CRUD + 재인덱싱
// 계약: api_openapi.yaml /v1/kb/* (safety_manager·admin 전용).
// 핵심 도메인 규칙: risk_grade·critical_register 는 서버가 강제 재계산.
//   - 하 ≤ 9 / 중 10~15 / 상 ≥ 16 (강도×빈도 임계곱)
//   - 상 ⇔ 중점등록 O (자동)
//   - 곱16(강도4×빈도4) 경계셀: critical_register 입력 존중 + boundary_cell=true
// 클라이언트는 강도·빈도만 보내고, 등급·중점등록은 "미리보기"로만 표시(서버 결과와 일치).
// ─────────────────────────────────────────────────────────

export type RiskGrade = "상" | "중" | "하";
export type CriticalRegister = "O" | "X";

/** KB 행 (서버 응답 = SSOT). 등급·중점등록은 서버 재계산 값. */
export interface KbRow {
  chunk_id: string;
  source_row?: number | null;
  major_type: string;
  sub_type: string;
  detail_item: string;
  accident_type: string;
  severity: number;
  frequency: number;
  risk_product?: number;
  risk_grade: RiskGrade;
  critical_register: CriticalRegister;
  boundary_cell?: boolean;
  is_new_detail?: boolean;
  hazard_text: string;
  hazard_items?: string[];
  controls?: string;
  controls_items?: string[];
  legal_refs?: string[];
  row_status?: "active" | "deleted";
  updated_at?: string | null;
  updated_by?: string | null;
}

/** KB 행 생성·수정 입력. risk_grade·critical_register 는 보내지 않는다(서버 재계산). */
export interface KbRowWrite {
  major_type: string;
  sub_type: string;
  detail_item: string;
  accident_type?: string;
  severity: number;
  frequency: number;
  hazard_text: string;
  controls?: string;
  /** 곱16 경계셀에서만 서버가 존중. 그 외 무시. */
  critical_register?: CriticalRegister | "O (잠정)" | null;
  legal_refs?: string[];
}

export interface KbRowList {
  rows: KbRow[];
  total: number;
  offset: number;
  limit: number;
}

export interface KbListQuery {
  q?: string;
  major_type?: string;
  sub_type?: string;
  accident_type?: string;
  risk_grade?: RiskGrade;
  critical_register?: CriticalRegister;
  include_deleted?: boolean;
  offset?: number;
  limit?: number;
  sort?: string;
}

export type ReindexStatus = "idle" | "pending" | "running";

export interface KbStats {
  active_rows: number;
  deleted_rows: number;
  new_rows: number;
  by_major_type: Record<string, number>;
  by_risk_grade: Record<string, number>;
  reindex_status: ReindexStatus;
  index_version: number;
  last_reindex_at: string | null;
  doc_count: number;
  last_change_ratio?: number;
  regression_recommended?: boolean;
}

export interface ReindexAck {
  status: string;
  index_version: number;
  doc_count: number;
  last_reindex_at: string | null;
  last_duration_ms?: number | null;
  regression_recommended?: boolean;
}

/**
 * 클라이언트 등급·중점등록 미리보기 — 서버 재계산 규칙을 그대로 반영.
 * 서버가 SSOT이므로 이 값은 "잠정 표시"이며 저장 후 서버 응답으로 대체된다.
 */
export interface GradePreview {
  product: number;
  grade: RiskGrade;
  /** 곱16(강도4×빈도4) 경계셀 — 안전관리자 판단 영역 */
  boundaryCell: boolean;
  /** 중점등록 자동값(상⇔O). 경계셀은 사용자 입력 존중. */
  criticalRegister: CriticalRegister;
  label: string;
}

/** 서버와 동일한 임계곱 규칙. 곱16은 경계셀(잠정 상). */
export function computeGradePreview(
  severity: number,
  frequency: number,
  boundaryRegisterInput?: CriticalRegister,
): GradePreview {
  const product = severity * frequency;
  const boundaryCell = severity === 4 && frequency === 4; // 곱16 경계셀
  let grade: RiskGrade;
  if (product >= 16) grade = "상";
  else if (product >= 10) grade = "중";
  else grade = "하";
  // 중점등록: 상 ⇔ O 자동. 경계셀은 안전관리자 입력 존중(미지정 시 잠정 O).
  let criticalRegister: CriticalRegister;
  if (boundaryCell) criticalRegister = boundaryRegisterInput ?? "O";
  else criticalRegister = grade === "상" ? "O" : "X";
  const label = boundaryCell
    ? `강도 ${severity} × 빈도 ${frequency} = ${product} → 상(잠정) · 경계셀: 안전관리자 판단 필요`
    : `강도 ${severity} × 빈도 ${frequency} = ${product} → ${grade} · 중점등록 ${criticalRegister} (서버 자동)`;
  return { product, grade, boundaryCell, criticalRegister, label };
}

// ─────────────────────────────────────────────────────────
// 동적 위험성평가 (기상·지형 결합) — jha-dynamic-risk 스킬
// 리서치: "외부 위험 = 내부 위험", 동적 업데이트 우선.
// 외부 API(기상청/V-World)는 provider 추상화로 목업↔실API 교체.
// ─────────────────────────────────────────────────────────

/** 경보 단계 — 색상만 의존 금지(텍스트 라벨 병행) */
export type AlertLevel = "INFO" | "WARN" | "STOP" | "EVAC";

/** 작업중지 룰 액션 */
export type StoppageAction =
  | "STOP" // 작업중지 권고(현장소장 승인)
  | "DERATE_20" // 정격하중 20% 감
  | "ANCHOR_CHECK" // 이탈방지·점검
  | "RESTRICT" // 원칙 제한(계획서)
  | "COOL_REST" // 냉방/시간조정/휴식
  | "REST_20PER2H" // 2h당 20분 휴식 의무
  | "STOP_1417" // 14~17시 옥외 중지 권고
  | "STOP_OUTDOOR" // 옥외작업 중지 권고
  | "INFO"; // 정보성

/** 실시간 기상 컨텍스트 (provider 출력 = 계약) */
export interface WeatherContext {
  observed_at: string;
  grid_nx: number;
  grid_ny: number;
  region_name: string;
  temp_c: number;
  apparent_temp_c: number; // 체감온도 (폭염 판정 기준)
  humidity_pct: number;
  wind_ms: number; // 평균 풍속
  gust_ms: number; // 순간 풍속
  rain_mm_1h: number;
  snow_cm_1h: number;
  pty: "없음" | "비" | "비/눈" | "눈" | "소나기"; // 강수형태
  lightning: boolean;
  pm10?: number;
  warnings: WeatherWarning[]; // 기상특보
  source: "mock" | "kma"; // 데이터 출처(목업/실API)
}

export interface WeatherWarning {
  code: string; // HEAVY_RAIN_ADVISORY 등
  label: string; // "호우주의보"
  level: "주의보" | "경보" | "예비특보";
  region: string;
}

/** 지형 재해 컨텍스트 */
export interface GeoHazardContext {
  lat: number;
  lon: number;
  address: string;
  landslide_grade: number; // 0~5 (0=해당없음, 5=최고위험)
  flood_risk: "없음" | "관심" | "주의" | "위험";
  underground_utilities: string[]; // ["가스관", "전력선"]
  soft_ground: boolean; // 연약지반
  slope_deg: number; // 최대 경사도
  near_high_voltage: boolean; // 고압선 인접
  source: "mock" | "vworld";
}

/** 발동된 작업중지 룰 1건 */
export interface TriggeredRule {
  rule_id: string;
  condition: string; // "순간풍속 12.3 m/s > 10"
  threshold: number;
  observed: number;
  trade: string; // 대상 공종
  legal_ref: string;
  action: StoppageAction;
  level: AlertLevel;
  message: string; // 사용자용 한국어 안내
}

/** 동적 위험 평가 결과 (정적 hazard 평가에 결합) */
export interface DynamicRiskResult {
  weather: WeatherContext;
  geo: GeoHazardContext;
  trade: string; // 평가 대상 공종(분류에서 매핑)
  triggered_rules: TriggeredRule[];
  geo_flags: GeoFlag[];
  overall_level: AlertLevel;
  recommendations: string[];
  human_approval_required: boolean;
  /** 폭염 휴식 안내(33℃↑ 의무) */
  heat_rest?: { required: boolean; rule: string; cycle_min: number; rest_min: number };
  /** 데모 데이터 여부 — UI에 "실 장비/API 연동 예정" 배지 */
  is_mock: boolean;
}

export interface GeoFlag {
  layer: string; // "산사태위험지도"
  level: AlertLevel;
  message: string;
  source_note: string; // 데이터원
}
