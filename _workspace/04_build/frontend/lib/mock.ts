/**
 * 데모용 Mock 응답 — 백엔드 미기동 시(NEXT_PUBLIC_USE_MOCK=true).
 *
 * 데모 시나리오 (work_description 키워드 매칭):
 *  1. 타워크레인 해체 → 경계셀(곱16) 포함, PENDING_REVIEW
 *  2. 굴착/흙막이 → 정상 ok (경계셀 없음)
 *  3. 밀폐공간 → refused_partial (추락만 평가, 질식 갭)
 *  4. (그 외 석면/화학) → refused_full
 */

import {
  AssessmentResult,
  Citation,
  ClassificationResult,
  FinalizationResult,
  ReviewDecision,
} from "./types";
import { CreateSessionInput } from "./api";

type Scenario = "tower" | "excavation" | "confined" | "refuse_full";

const sessionScenario = new Map<string, Scenario>();
const sessionState = new Map<string, AssessmentResult>();

function detectScenario(desc: string): Scenario {
  const d = desc.toLowerCase();
  if (d.includes("타워크레인") || d.includes("크레인") || d.includes("해체")) return "tower";
  if (d.includes("굴착") || d.includes("흙막이") || d.includes("토공")) return "excavation";
  if (d.includes("밀폐") || d.includes("질식") || d.includes("맨홀") || d.includes("pit")) return "confined";
  if (d.includes("석면") || d.includes("화학") || d.includes("msds")) return "refuse_full";
  return "tower"; // 데모 기본
}

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function createSession(input: CreateSessionInput) {
  const id = uuid();
  sessionScenario.set(id, detectScenario(input.work_description));
  // 데모 편의: work_description 보관
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(`mock_desc_${id}`, input.work_description);
  }
  return { session_id: id, state: "CREATED" };
}

function scenarioFor(sessionId: string): Scenario {
  if (sessionScenario.has(sessionId)) return sessionScenario.get(sessionId)!;
  // 새로고침 등으로 메모리 소실 시 sessionStorage에서 복구
  if (typeof window !== "undefined") {
    const desc = window.sessionStorage.getItem(`mock_desc_${sessionId}`);
    if (desc) {
      const s = detectScenario(desc);
      sessionScenario.set(sessionId, s);
      return s;
    }
  }
  return "tower";
}

export async function classify(sessionId: string): Promise<ClassificationResult> {
  const s = scenarioFor(sessionId);
  await delay(400);
  if (s === "tower")
    return {
      session_id: sessionId,
      state: "CLASSIFIED",
      result_type: "ok",
      classification: {
        major_type: "가설공사",
        sub_type: "타워크레인(T형)",
        detail_item: "해체·분해",
        confidence: 0.82,
        alternatives: [
          { label: "타워크레인(L형)", level: "sub", sub_type: "타워크레인(L형)", confidence: 0.41, source_rows: [128] },
          { label: "타워크레인 인상(텔레스코핑)", level: "sub", sub_type: "타워크레인 인상", confidence: 0.33, source_rows: [55] },
        ],
      },
      model_used: "claude-opus-4-8",
    };
  if (s === "excavation")
    return {
      session_id: sessionId,
      state: "CLASSIFIED",
      result_type: "ok",
      classification: {
        major_type: "토공사",
        sub_type: "흙막이 공사",
        detail_item: "굴착·터파기",
        confidence: 0.88,
        alternatives: [
          { label: "오픈컷 굴착", level: "detail", detail_item: "오픈컷 굴착", confidence: 0.52 },
        ],
      },
      model_used: "claude-opus-4-8",
    };
  if (s === "confined")
    return {
      session_id: sessionId,
      state: "CLASSIFIED",
      result_type: "low_confidence",
      classification: {
        major_type: "설비공사",
        sub_type: "밀폐공간 작업",
        detail_item: "E/V PIT 내부 작업",
        confidence: 0.46,
        alternatives: [
          { label: "맨홀 내부 작업", level: "detail", detail_item: "맨홀 내부 작업", confidence: 0.39 },
        ],
      },
      warnings: ["밀폐공간(질식) 표준 절차 데이터가 일부 부족합니다."],
      model_used: "claude-opus-4-8",
    };
  // refuse_full
  return {
    session_id: sessionId,
    state: "CLASSIFIED",
    result_type: "refused_full",
    classification: { major_type: null, sub_type: null, detail_item: null, confidence: 0.1 },
    warnings: ["석면/화학물질 작업은 PoC 표준 데이터 범위 밖입니다."],
    model_used: "claude-opus-4-8",
  };
}

export async function assess(
  sessionId: string,
  _confirmed?: { major_type: string; sub_type: string; detail_item: string },
): Promise<AssessmentResult> {
  const s = scenarioFor(sessionId);
  await delay(600);
  let result: AssessmentResult;

  if (s === "tower") {
    result = {
      session_id: sessionId,
      state: "PENDING_REVIEW",
      result_type: "ok",
      hazards: [
        {
          accident_type: "추락",
          description: "해체 중 부재 단부에서 작업자 추락",
          severity: 4,
          frequency: 4,
          risk_grade: "상",
          boundary_cell: true,
          controls: ["안전대 부착설비 설치 후 안전대 체결", "작업발판·안전난간 선설치"],
          citations: ["R00042", "R00128"],
          // 추락(고소 ≥2m) 필수: §42(추락방지)·§43(개구부)·§44(안전대). [legal_citation_matrix §1]
          legal_refs: [
            "산업안전보건기준에 관한 규칙 §42",
            "산업안전보건기준에 관한 규칙 §43",
            "산업안전보건기준에 관한 규칙 §44",
          ],
          citation_detail: {
            R00042: {
              text: "해체 중 부재 단부에서 작업자 추락 / 안전대 부착설비 설치 후 안전대 체결",
              meta: { major_type: "가설공사", sub_type: "타워크레인(T형)", detail_item: "해체·분해", accident_type: "추락", source_row: 42, legal_refs: ["§43"] },
              score: 8.7,
            },
            R00128: {
              text: "고소 해체작업 시 작업발판 및 안전난간 미설치로 인한 추락",
              meta: { major_type: "가설공사", sub_type: "타워크레인(T형)", accident_type: "추락", source_row: 128 },
              score: 7.2,
            },
          },
        },
        {
          accident_type: "낙하",
          description: "와이어 해지 중 부재 낙하",
          severity: 5,
          frequency: 4,
          risk_grade: "상",
          boundary_cell: false,
          controls: ["출입통제·하부 접근금지구역 설정", "유도로프 사용"],
          citations: ["R00210"],
          // 낙하·비래 필수: §14(낙하물방지)·§15(투하설비)·§20(출입금지). [matrix §1]
          legal_refs: [
            "산업안전보건기준에 관한 규칙 §14",
            "산업안전보건기준에 관한 규칙 §15",
            "산업안전보건기준에 관한 규칙 §20",
          ],
          citation_detail: {
            R00210: {
              text: "와이어로프 해지 중 부재 낙하 / 하부 접근금지구역 설정 및 출입통제",
              meta: { major_type: "가설공사", sub_type: "타워크레인(T형)", accident_type: "낙하", source_row: 210 },
              score: 9.1,
            },
          },
        },
        {
          accident_type: "협착",
          description: "분해 부재 취급 중 손·발 협착",
          severity: 3,
          frequency: 3,
          risk_grade: "하",
          boundary_cell: false,
          controls: ["보호장갑 착용", "수신호 통일·신호수 배치"],
          citations: ["R00305"],
          // 협착·말림 필수: §20(출입금지)·§87(원동기·회전축)·§142(타워크레인). [matrix §1]
          legal_refs: [
            "산업안전보건기준에 관한 규칙 §20",
            "산업안전보건기준에 관한 규칙 §87",
            "산업안전보건기준에 관한 규칙 §142",
          ],
        },
      ],
      critical_register: "O (잠정)",
      critical_register_reasons: ["곱16 경계셀(추락) 안전관리자 확정 필요", "낙하 곱20 상"],
      // 중점등록 O(=상) → 산안법 시행규칙 §43(작업계획서) + 재해형태 조문. [matrix §3]
      legal_refs: [
        "산업안전보건법 시행규칙 §43",
        "산업안전보건기준에 관한 규칙 §42",
        "산업안전보건기준에 관한 규칙 §44",
        "산업안전보건기준에 관한 규칙 §14",
        "산업안전보건기준에 관한 규칙 §20",
        "산업안전보건기준에 관한 규칙 §87",
        "산업안전보건기준에 관한 규칙 §142",
      ],
      human_review_flags: {
        boundary_cell: true,
        human_review_required: true,
        gap_areas: [],
      },
      source_rows: [42, 128, 210, 305],
      model_used: "claude-opus-4-8",
    };
  } else if (s === "excavation") {
    result = {
      session_id: sessionId,
      state: "ASSESSED",
      result_type: "ok",
      hazards: [
        {
          accident_type: "붕괴",
          description: "굴착면·흙막이 붕괴로 매몰",
          severity: 5,
          frequency: 3,
          risk_grade: "상",
          boundary_cell: false,
          controls: ["흙막이 지보공 계측관리", "굴착 구배 준수·경사면 보호"],
          citations: ["R00512"],
          legal_refs: ["산업안전보건기준에 관한 규칙 §338"],
          citation_detail: {
            R00512: {
              text: "흙막이 지보공 변형으로 인한 굴착면 붕괴 / 계측관리 및 지보공 보강",
              meta: { major_type: "토공사", sub_type: "흙막이 공사", accident_type: "붕괴", source_row: 512 },
              score: 8.9,
            },
          },
        },
        {
          accident_type: "전도",
          description: "굴착기 등 건설기계 전도",
          severity: 4,
          frequency: 2,
          risk_grade: "중",
          boundary_cell: false,
          controls: ["지반 다짐·받침 설치", "유도자 배치"],
          citations: ["R00640"],
          // 전도 권장: §86(중장비 전도방지)·§196(차량계 건설기계 전도방지). [matrix §1]
          legal_refs: ["산업안전보건기준에 관한 규칙 §86", "산업안전보건기준에 관한 규칙 §196"],
        },
      ],
      critical_register: "O",
      critical_register_reasons: ["붕괴 곱15→재계산 상"],
      legal_refs: ["§338", "§196"],
      human_review_flags: { boundary_cell: false, human_review_required: false },
      source_rows: [512, 640],
      model_used: "claude-opus-4-8",
    };
  } else if (s === "confined") {
    result = {
      session_id: sessionId,
      state: "ASSESSED",
      result_type: "refused_partial",
      hazards: [
        {
          accident_type: "추락",
          description: "E/V PIT 단부 추락",
          severity: 4,
          frequency: 3,
          risk_grade: "중",
          boundary_cell: false,
          controls: ["안전난간·덮개 설치", "PIT 개구부 표지"],
          citations: ["R00731"],
          // 추락 필수: §42·§43·§44. (밀폐공간 질식은 데이터 갭 → 별도 §619~625 표시) [matrix §1]
          legal_refs: [
            "산업안전보건기준에 관한 규칙 §42",
            "산업안전보건기준에 관한 규칙 §43",
            "산업안전보건기준에 관한 규칙 §44",
          ],
          citation_detail: {
            R00731: {
              text: "E/V PIT 개구부 단부 추락 / 안전난간 및 덮개 설치",
              meta: { major_type: "설비공사", accident_type: "추락", source_row: 731 },
              score: 7.8,
            },
          },
        },
      ],
      critical_register: "O",
      critical_register_reasons: ["추락 중"],
      legal_refs: ["산업안전보건기준에 관한 규칙 §619~625"],
      human_review_flags: {
        data_gap: true,
        gap_areas: ["질식(밀폐공간)"],
        human_review_required: true,
      },
      warnings: ["밀폐공간(질식) 절차 데이터 부족으로 산소측정·환기·감시인 대책이 생성되지 않았습니다."],
      source_rows: [731],
      model_used: "claude-opus-4-8",
    };
  } else {
    result = {
      session_id: sessionId,
      state: "ASSESSED",
      result_type: "refused_full",
      hazards: [],
      critical_register: "X",
      legal_refs: ["석면안전관리법", "산업안전보건법 §110~115 (MSDS)"],
      human_review_flags: { human_review_required: true, data_gap: true, gap_areas: ["석면", "화학물질(MSDS)"] },
      warnings: ["석면 해체/화학물질 작업은 PoC 표준 데이터 범위 밖입니다. 추측 평가를 제공하지 않습니다."],
      source_rows: [],
      model_used: "claude-opus-4-8",
    };
  }

  sessionState.set(sessionId, result);
  return result;
}

export async function review(
  sessionId: string,
  decisions: ReviewDecision[],
): Promise<AssessmentResult> {
  await delay(300);
  const prev = sessionState.get(sessionId);
  if (!prev) throw new Error("세션 상태 없음");
  const next: AssessmentResult = JSON.parse(JSON.stringify(prev));
  for (const d of decisions) {
    const h = next.hazards[d.hazard_index];
    if (h) {
      h.risk_grade = d.confirmed_grade;
      h.boundary_cell = false;
    }
  }
  next.state = "REVIEWED";
  next.critical_register = decisions.some((d) => d.confirmed_critical_register === "O") ? "O" : "X";
  next.human_review_flags = { ...next.human_review_flags, human_review_required: false, boundary_cell: false };
  sessionState.set(sessionId, next);
  return next;
}

export async function finalize(sessionId: string, _siteId?: string): Promise<FinalizationResult> {
  await delay(500);
  return {
    session_id: sessionId,
    state: "REGISTERING",
    outbox_id: `outbox-${sessionId.slice(0, 8)}`,
    status: "queued",
    message: "ERP 등록이 큐잉되었습니다.",
    erp: { status: "pending", erp_id: null, queue_position: 2 },
  };
}

export async function getCitation(sourceRow: number): Promise<Citation> {
  await delay(200);
  const map: Record<number, Citation> = {
    42: { source_row: 42, major_type: "가설공사", sub_type: "타워크레인(T형)", detail_item: "해체·분해", accident_type: "추락", hazard_text: "해체 중 부재 단부에서 작업자 추락", control_text: "안전대 부착설비 설치 후 안전대 체결", severity: 4, frequency: 4, legal_refs: ["산업안전보건기준에 관한 규칙 §43"] },
    128: { source_row: 128, major_type: "가설공사", sub_type: "타워크레인(T형)", accident_type: "추락", hazard_text: "작업발판·안전난간 미설치 추락", control_text: "작업발판 및 안전난간 선설치", severity: 4, frequency: 3, legal_refs: ["§43"] },
    210: { source_row: 210, major_type: "가설공사", sub_type: "타워크레인(T형)", accident_type: "낙하", hazard_text: "와이어 해지 중 부재 낙하", control_text: "하부 접근금지구역 설정", severity: 5, frequency: 4, legal_refs: ["§20"] },
    512: { source_row: 512, major_type: "토공사", sub_type: "흙막이 공사", accident_type: "붕괴", hazard_text: "흙막이 지보공 변형 굴착면 붕괴", control_text: "계측관리 및 지보공 보강", severity: 5, frequency: 3, legal_refs: ["§338"] },
    731: { source_row: 731, major_type: "설비공사", accident_type: "추락", hazard_text: "E/V PIT 개구부 단부 추락", control_text: "안전난간 및 덮개 설치", severity: 4, frequency: 3, legal_refs: ["§43"] },
  };
  const c = map[sourceRow];
  if (!c) throw new Error("not found");
  return c;
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 법령 인용 상세 — 감사 친화형. "§43"처럼 짧은 근거를 검토자가 판단할 수 있도록
 * 법령 전체명 + 조항 제목을 보강한다. 키는 조문 번호(§NN) 또는 §NN~MM, 별칭(법령명) 모두 매핑.
 *
 * 출처: safety-domain-expert 법적 인용 매트릭스(safety_legal_citation_matrix.md) 요지.
 */
export interface LegalRefMeta {
  /** 원본 표기(예: "§43") */
  ref: string;
  /** 법령 전체명(예: "산업안전보건기준에 관한 규칙") */
  lawName: string;
  /** 조항 표기(예: "제43조") */
  article: string;
  /** 조항 제목(예: "개구부 등의 방호 조치") */
  articleTitle: string;
}

const LAW_KISAN = "산업안전보건기준에 관한 규칙";
const LAW_KISAN_RULE = "산업안전보건법 시행규칙";
const LEGAL_REF_TABLE: Record<string, LegalRefMeta> = {
  "§14": { ref: "§14", lawName: LAW_KISAN, article: "제14조", articleTitle: "낙하물에 의한 위험의 방지" },
  "§15": { ref: "§15", lawName: LAW_KISAN, article: "제15조", articleTitle: "투하설비 등" },
  "§20": { ref: "§20", lawName: LAW_KISAN, article: "제20조", articleTitle: "출입의 금지 등" },
  "§37": { ref: "§37", lawName: LAW_KISAN, article: "제37조", articleTitle: "악천후 및 강풍 시 작업 중지" },
  "§42": { ref: "§42", lawName: LAW_KISAN, article: "제42조", articleTitle: "추락의 방지" },
  "§43": { ref: "§43", lawName: LAW_KISAN, article: "제43조", articleTitle: "개구부 등의 방호 조치" },
  "§44": { ref: "§44", lawName: LAW_KISAN, article: "제44조", articleTitle: "안전대의 부착설비 등" },
  "§50": { ref: "§50", lawName: LAW_KISAN, article: "제50조", articleTitle: "토사등에 의한 붕괴 등의 방지" },
  "§86": { ref: "§86", lawName: LAW_KISAN, article: "제86조", articleTitle: "탑승의 제한·전도 등의 방지" },
  "§87": { ref: "§87", lawName: LAW_KISAN, article: "제87조", articleTitle: "원동기·회전축 등의 위험 방지" },
  "§142": { ref: "§142", lawName: LAW_KISAN, article: "제142조", articleTitle: "타워크레인의 설치·조립·해체 시 조치" },
  "§140": { ref: "§140", lawName: LAW_KISAN, article: "제140조", articleTitle: "운전위치의 이탈 금지 등" },
  "§143": { ref: "§143", lawName: LAW_KISAN, article: "제143조", articleTitle: "건설기계 등에 의한 위험 방지" },
  "§196": { ref: "§196", lawName: LAW_KISAN, article: "제196조", articleTitle: "차량계 건설기계의 전도 등의 방지" },
  "§338": { ref: "§338", lawName: LAW_KISAN, article: "제338조", articleTitle: "굴착작업 등의 위험 방지(지반 붕괴)" },
  "§383": { ref: "§383", lawName: LAW_KISAN, article: "제383조", articleTitle: "작업의 제한(철골작업 중지 기준)" },
  "§559": { ref: "§559", lawName: LAW_KISAN, article: "제559조", articleTitle: "고열작업 등에 대한 조치" },
  "§560": { ref: "§560", lawName: LAW_KISAN, article: "제560조", articleTitle: "온도·습도 조절(폭염 휴식)" },
  "§619~625": {
    ref: "§619~625",
    lawName: LAW_KISAN,
    article: "제619조~제625조",
    articleTitle: "밀폐공간 작업 시 조치(산소·유해가스 측정 등)",
  },
};

/** 인용 문자열(예: "산업안전보건기준에 관한 규칙 §43" 또는 "§43")에서 법령 상세를 찾는다. */
export function legalRefMeta(raw: string): LegalRefMeta | null {
  // 산안법 시행규칙 §43(작업계획서/중점관리)은 안전보건규칙 §43(개구부)과 다른 법령 — 먼저 분기.
  if (raw.includes("시행규칙") && /§\s*43/.test(raw)) {
    return { ref: "§43", lawName: LAW_KISAN_RULE, article: "제43조", articleTitle: "유해·위험 작업의 작업계획서 등(중점관리)" };
  }
  const m = raw.match(/§\s*[\d~]+/);
  if (m) {
    const key = m[0].replace(/\s+/g, "");
    if (LEGAL_REF_TABLE[key]) return LEGAL_REF_TABLE[key];
  }
  // 별도 법령(MSDS·석면 등)은 전체명을 그대로 노출
  if (raw.includes("MSDS") || raw.includes("§110")) {
    return { ref: raw, lawName: "산업안전보건법", article: "제110조~제115조", articleTitle: "물질안전보건자료(MSDS)" };
  }
  if (raw.includes("석면")) {
    return { ref: raw, lawName: "석면안전관리법", article: "", articleTitle: "석면 해체·제거 작업 기준" };
  }
  return null;
}

/** manager 페이지용 검토 대기 목록 mock */
export function pendingReviewList() {
  return [
    { session_id: "mock-tower-1", work_description: "5층 옥상 타워크레인(T형) 해체 작업", critical_register: "O (잠정)", boundary_count: 1, created_at: "2026-06-10T09:12:00Z", worker: "김작업" },
    { session_id: "mock-confined-1", work_description: "E/V PIT 밀폐공간 내부 점검", critical_register: "O", boundary_count: 0, data_gap: true, created_at: "2026-06-10T08:40:00Z", worker: "이작업" },
    { session_id: "mock-steel-1", work_description: "철골 보 단부 볼팅 작업", critical_register: "O (잠정)", boundary_count: 2, created_at: "2026-06-10T08:05:00Z", worker: "박작업" },
  ];
}
