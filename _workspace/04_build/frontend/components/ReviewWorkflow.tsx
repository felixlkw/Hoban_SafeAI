"use client";

/**
 * 검토·확정 워크플로우 — progress bar + 단계 게이트.
 *
 * 단계: 작업입력 → 분류검토 → 위험요인검토 → 확정·등록.
 * 미검토(미확정) 항목이 있으면 다음 단계 진입 차단 (게이트).
 */

export type WorkflowStep = "input" | "classify" | "assess" | "finalize";

const STEPS: { key: WorkflowStep; label: string }[] = [
  { key: "input", label: "작업 입력" },
  { key: "classify", label: "분류 검토" },
  { key: "assess", label: "위험요인 검토" },
  { key: "finalize", label: "확정·등록" },
];

interface Props {
  current: WorkflowStep;
  /** 완료된 단계 키 목록 */
  completed?: WorkflowStep[];
}

export function ReviewWorkflow({ current, completed = [] }: Props) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  const pct = Math.round(((currentIdx + 1) / STEPS.length) * 100);

  return (
    <nav aria-label="진행 단계" className="mb-5" data-testid="review-workflow">
      <div
        className="mb-2 h-2 w-full overflow-hidden rounded-full bg-black/10"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`전체 진행률 ${pct}퍼센트`}
      >
        <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="flex items-center justify-between">
        {STEPS.map((s, i) => {
          const isDone = completed.includes(s.key) || i < currentIdx;
          const isCurrent = s.key === current;
          return (
            <li key={s.key} className="flex flex-1 flex-col items-center text-center">
              <span
                aria-hidden
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                  isDone
                    ? "bg-risk-low text-white"
                    : isCurrent
                      ? "bg-brand text-white ring-2 ring-brand ring-offset-2"
                      : "bg-black/10 text-muted"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <span
                className={`mt-1 text-xs ${isCurrent ? "font-bold text-brand-700" : "text-muted"}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {s.label}
                {isCurrent && <span className="sr-only"> (현재 단계)</span>}
                {isDone && <span className="sr-only"> (완료)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * 확정 게이트 — 미검토 항목 존재 시 등록 버튼 비활성 + 사유 표시.
 */
export function FinalizeGate({
  blockingReasons,
  onFinalize,
  finalizing = false,
  label = "확정 후 ERP 등록 ▶",
}: {
  blockingReasons: string[];
  onFinalize: () => void;
  finalizing?: boolean;
  label?: string;
}) {
  const blocked = blockingReasons.length > 0;
  return (
    <div className="mt-5" data-testid="finalize-gate">
      {blocked && (
        <div role="alert" className="mb-2 rounded-md border-2 border-[#F97316] bg-[#FFF7ED] p-3 text-sm">
          <p className="font-semibold text-[#9A3412]">등록 전에 확인이 필요한 항목이 있습니다</p>
          <ul className="mt-1 list-disc pl-5 text-ink-800">
            {blockingReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      <button
        type="button"
        disabled={blocked || finalizing}
        onClick={onFinalize}
        className="min-h-[56px] w-full rounded-lg bg-brand px-4 text-lg font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="finalize-button"
      >
        {finalizing ? "등록 처리 중…" : blocked ? "미확정 항목을 먼저 처리하세요" : label}
      </button>
    </div>
  );
}
