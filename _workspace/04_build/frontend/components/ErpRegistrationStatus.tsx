"use client";

import { ErpState } from "@/lib/types";

/**
 * ERP 등록 상태 — 대기(pending)/성공(success)/실패(failed)/세션만료.
 * 비동기 Outbox 패턴 → 큐 위치 표시. 실패 시 재시도/취소.
 *
 * 색상만 의존 금지 → 아이콘+텍스트 병행. 에러는 친절한 한국어 + 다음 행동.
 */

interface Props {
  erp: ErpState;
  outboxId?: string;
  onRetry?: () => void;
  onCancel?: () => void;
  retrying?: boolean;
}

export function ErpRegistrationStatus({ erp, outboxId, onRetry, onCancel, retrying = false }: Props) {
  const conf = {
    idle: { icon: "⏸", title: "등록 대기 중", color: "border-steel-300 bg-surface-page", text: "text-ink-800" },
    pending: { icon: "⏳", title: "ERP 등록 진행 중", color: "border-brand bg-[#EFF6FF]", text: "text-brand-700" },
    success: { icon: "✅", title: "ERP 등록 완료", color: "border-[#16A34A] bg-[#F0FDF4]", text: "text-[#15803D]" },
    failed: { icon: "❌", title: "ERP 등록 실패", color: "border-[#DC2626] bg-[#FEF2F2]", text: "text-[#991B1B]" },
    session_expired: { icon: "🔑", title: "세션이 만료되었습니다", color: "border-[#F97316] bg-[#FFF7ED]", text: "text-[#9A3412]" },
  }[erp.status];

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="erp-status"
      data-erp-status={erp.status}
      className={`rounded-lg border-2 p-4 ${conf.color}`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className={erp.status === "pending" ? "animate-pulse text-2xl" : "text-2xl"}>
          {conf.icon}
        </span>
        <div className="flex-1">
          <h3 className={`text-base font-bold ${conf.text}`}>{conf.title}</h3>

          {erp.status === "pending" && (
            <p className="mt-1 text-sm text-ink-800">
              안전 평가 결과를 ERP에 등록하고 있습니다.
              {typeof erp.queue_position === "number" && (
                <> 현재 대기 순번: <span className="font-semibold">{erp.queue_position}번</span></>
              )}
              {" "}완료되면 알려드립니다. 이 화면을 닫아도 등록은 계속 진행됩니다.
            </p>
          )}

          {erp.status === "success" && (
            <p className="mt-1 text-sm text-ink-800">
              ERP 등록번호: <span className="font-mono font-semibold">{erp.erp_id ?? "—"}</span>
            </p>
          )}

          {erp.status === "failed" && (
            <div className="mt-1 text-sm text-ink-800">
              <p>
                ERP 시스템 등록에 실패했습니다. 평가 내용은 안전하게 저장되어 있으니 다시 시도해 주세요.
                {typeof erp.attempts === "number" && <> (시도 {erp.attempts}회)</>}
              </p>
              {erp.last_error && <p className="mt-1 text-[#991B1B]">사유: {erp.last_error}</p>}
              <p className="mt-1 text-steel-700">반복 실패 시 안전보건팀(내선 1234)으로 문의하세요.</p>
            </div>
          )}

          {erp.status === "session_expired" && (
            <p className="mt-1 text-sm text-ink-800">
              로그인 세션이 만료되어 등록을 완료하지 못했습니다. 작성하신 내용은 자동 저장되었으니, 다시
              로그인 후 재시도하면 이어서 등록됩니다.
            </p>
          )}

          {outboxId && (
            <p className="mt-2 text-xs text-muted">처리 번호: {outboxId}</p>
          )}

          {(erp.status === "failed" || erp.status === "session_expired") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onRetry && (
                <button
                  type="button"
                  disabled={retrying}
                  onClick={onRetry}
                  className="min-h-touch rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  data-testid="erp-retry"
                >
                  {retrying ? "재시도 중…" : "다시 등록 시도"}
                </button>
              )}
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="surface min-h-touch rounded-md border px-4 py-2 text-sm font-semibold"
                >
                  취소
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
