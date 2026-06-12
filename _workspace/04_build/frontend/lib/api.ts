/**
 * 백엔드 API 클라이언트 — fetch 래퍼 + 에러 코드 분기.
 * NEXT_PUBLIC_USE_MOCK=true 시 lib/mock.ts 응답 사용(백엔드 미기동 데모).
 *
 * 에러 핸들링 원칙(spec):
 * - 네트워크/5xx → 재시도 가능 플래그
 * - 409 SESSION_REVIEW_REQUIRED → 확정 게이트
 * - parse_error=true → graceful raw_text 표시 (호출부 처리)
 * - 인용 로드 실패 → 인용 ID는 항상 표시 (호출부 처리)
 */

import {
  AssessmentResult,
  Citation,
  ClassificationResult,
  FinalizationResult,
  JhaApiError,
  ReviewDecision,
  KbRow,
  KbRowList,
  KbRowWrite,
  KbStats,
  KbListQuery,
  ReindexAck,
} from "./types";
import * as mock from "./mock";
import * as kbmock from "./kbMock";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

function authHeaders(): Record<string, string> {
  // PoC: localStorage 토큰. 운영은 SSO(OIDC) 쿠키/silent refresh.
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("jha_token") : null;
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...authHeaders(), ...(init.headers || {}) },
    });
  } catch (e) {
    // 네트워크 실패(오프라인/서버 다운)
    throw new JhaApiError(0, "NETWORK_ERROR", "서버에 연결할 수 없습니다. 네트워크를 확인하고 다시 시도하세요.", {
      retryable: true,
    });
  }

  if (res.status === 401) {
    throw new JhaApiError(401, "AUTH_TOKEN_INVALID", "세션이 만료되었습니다. 다시 로그인하세요.");
  }

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!res.ok) {
    const err = (body as { error?: { code: string; message: string; details?: Record<string, unknown> } })?.error;
    throw new JhaApiError(
      res.status,
      err?.code || `HTTP_${res.status}`,
      err?.message || "요청 처리 중 오류가 발생했습니다.",
      err?.details,
    );
  }

  return body as T;
}

// ─── 세션 워크플로우 ───────────────────────────────────────

export interface CreateSessionInput {
  work_description: string;
  site_id?: string;
  worker_count?: number;
  meta?: Record<string, unknown>;
}

export async function createSession(input: CreateSessionInput) {
  if (USE_MOCK) return mock.createSession(input);
  return request<{ session_id: string; state: string }>("/v1/jha/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function classify(sessionId: string): Promise<ClassificationResult> {
  if (USE_MOCK) return mock.classify(sessionId);
  return request<ClassificationResult>(`/v1/jha/sessions/${sessionId}/classify`, {
    method: "POST",
  });
}

export async function assess(
  sessionId: string,
  confirmed?: { major_type: string; sub_type: string; detail_item: string },
): Promise<AssessmentResult> {
  if (USE_MOCK) return mock.assess(sessionId, confirmed);
  return request<AssessmentResult>(`/v1/jha/sessions/${sessionId}/assess`, {
    method: "POST",
    body: JSON.stringify(confirmed ? { confirmed_classification: confirmed } : {}),
  });
}

export async function review(
  sessionId: string,
  decisions: ReviewDecision[],
  reviewerNote?: string,
): Promise<AssessmentResult> {
  if (USE_MOCK) return mock.review(sessionId, decisions);
  return request<AssessmentResult>(`/v1/jha/sessions/${sessionId}/review`, {
    method: "POST",
    body: JSON.stringify({ decisions, reviewer_note: reviewerNote }),
  });
}

export async function finalize(
  sessionId: string,
  siteId?: string,
): Promise<FinalizationResult> {
  if (USE_MOCK) return mock.finalize(sessionId, siteId);
  return request<FinalizationResult>(`/v1/jha/sessions/${sessionId}/finalize`, {
    method: "POST",
    headers: { "Idempotency-Key": `finalize-${sessionId}` },
    body: JSON.stringify(siteId ? { site_id: siteId } : {}),
  });
}

export async function getCitation(sourceRow: number): Promise<Citation> {
  if (USE_MOCK) return mock.getCitation(sourceRow);
  return request<Citation>(`/v1/jha/citations/${sourceRow}`);
}

export async function submitFeedback(input: {
  session_id: string;
  action: "accept" | "edit" | "reject";
  target?: string;
  hazard_index?: number;
  comment?: string;
}) {
  if (USE_MOCK) return { feedback_id: "mock-fb", accepted: true };
  return request<{ feedback_id: string; accepted: boolean }>("/v1/jha/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * P0-①: 자유 텍스트(질문·정정) 대화 턴 — 카드 흐름과 별개로 사용자가 입력한 자연어를
 * 백엔드에 전달하는 자리. 현재 PoC mock 모드에서는 프론트(handleFreeText)가 정정 명령을
 * 로컬 처리하므로 호출하지 않는다. 실연동 시 이 시그니처로 전환:
 *   const turn = await chatTurn(sessionId, text);  // {assistant_text, action?, next_phase?}
 * action 예: "reclassify" | "focus_hazards" | "none". next_phase로 단계 전환 동기화.
 */
export interface ChatTurnResult {
  assistant_text: string;
  action?: "reclassify" | "focus_hazards" | "reject_prompt" | "none";
  next_phase?: string;
}
export async function chatTurn(sessionId: string, text: string): Promise<ChatTurnResult> {
  if (USE_MOCK) {
    // mock에서는 프론트가 처리하므로 호출되지 않음(안전망 기본 응답).
    return { assistant_text: "카드 기반 진행을 우선합니다.", action: "none" };
  }
  return request<ChatTurnResult>(`/v1/jha/sessions/${sessionId}/chat`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

// ─── KB(지식베이스) 운영 — safety_manager·admin 전용 ──────────────
// 계약: api_openapi.yaml /v1/kb/*. 등급·중점등록은 서버 재계산(클라 입력 무시).

function kbQueryString(query: KbListQuery): string {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  if (query.major_type) p.set("major_type", query.major_type);
  if (query.sub_type) p.set("sub_type", query.sub_type);
  if (query.accident_type) p.set("accident_type", query.accident_type);
  if (query.risk_grade) p.set("risk_grade", query.risk_grade);
  if (query.critical_register) p.set("critical_register", query.critical_register);
  if (query.include_deleted) p.set("include_deleted", "true");
  if (query.offset != null) p.set("offset", String(query.offset));
  if (query.limit != null) p.set("limit", String(query.limit));
  if (query.sort) p.set("sort", query.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function listKbRows(query: KbListQuery = {}): Promise<KbRowList> {
  if (USE_MOCK) return kbmock.listKbRows(query);
  return request<KbRowList>(`/v1/kb/rows${kbQueryString(query)}`);
}

export async function getKbRow(chunkId: string): Promise<KbRow> {
  if (USE_MOCK) return kbmock.getKbRow(chunkId);
  return request<KbRow>(`/v1/kb/rows/${encodeURIComponent(chunkId)}`);
}

export async function createKbRow(body: KbRowWrite): Promise<KbRow> {
  if (USE_MOCK) return kbmock.createKbRow(body);
  return request<KbRow>("/v1/kb/rows", { method: "POST", body: JSON.stringify(body) });
}

export async function updateKbRow(chunkId: string, body: KbRowWrite): Promise<KbRow> {
  if (USE_MOCK) return kbmock.updateKbRow(chunkId, body);
  return request<KbRow>(`/v1/kb/rows/${encodeURIComponent(chunkId)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteKbRow(chunkId: string): Promise<KbRow> {
  if (USE_MOCK) return kbmock.deleteKbRow(chunkId);
  return request<KbRow>(`/v1/kb/rows/${encodeURIComponent(chunkId)}`, { method: "DELETE" });
}

export async function kbStats(): Promise<KbStats> {
  if (USE_MOCK) return kbmock.kbStats();
  return request<KbStats>("/v1/kb/stats");
}

export async function kbReindex(): Promise<ReindexAck> {
  if (USE_MOCK) return kbmock.kbReindex();
  return request<ReindexAck>("/v1/kb/reindex", { method: "POST" });
}

/** chunk_id(R00042) → source_row(42) 변환 */
export function chunkIdToSourceRow(chunkId: string): number {
  const n = parseInt(chunkId.replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}
