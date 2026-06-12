"use client";

/**
 * 챗 상단 얇은 진행 표시 — 분류→위험요인→동적위험→확정. 챗을 대체하지 않고 보조.
 */

const STEPS = ["분류", "위험요인", "동적 위험", "확정·등록"];

export function ChatProgress({ current }: { current: number }) {
  const pct = Math.round((current / STEPS.length) * 100);
  return (
    <div className="shrink-0 border-b bg-[var(--card)]" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-2 sm:px-6">
        <div className="flex items-center justify-between text-[11px]">
          {STEPS.map((s, i) => {
            const idx = i + 1;
            const done = idx < current;
            const active = idx === current;
            return (
              <span
                key={s}
                className={`flex items-center gap-1 ${
                  active ? "font-bold text-brand-700" : done ? "text-risk-low" : "text-muted"
                }`}
                aria-current={active ? "step" : undefined}
              >
                <span aria-hidden>{done ? "✓" : `${idx}`}</span>
                {s}
              </span>
            );
          })}
        </div>
        <div
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`진행률 ${pct}퍼센트`}
        >
          <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
