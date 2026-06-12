"use client";

import { alertToken } from "@/lib/tokens";
import { PanelAlert } from "@/lib/panelAlert";
import { PanelView } from "@/components/chat/CompanionPanel";

/**
 * 모바일 폴백 — 상시 패널 대신 입력창 위 스티키 요약 칩.
 * 현재 stage 요약 + 경보 단계를 1줄로 상시 표시(색상+텍스트 병행). 탭 시 풀스크린 시트 확장.
 * 설계: ux_companion_panel.md §7 (상시 요약 칩 + 온디맨드 바텀시트).
 */

export function PanelSummaryChip({
  view,
  alert,
  summary,
  onOpen,
}: {
  view: PanelView;
  alert: PanelAlert;
  summary: string;
  onOpen: () => void;
}) {
  const t = alertToken(alert.level);
  const calm = alert.level === "INFO";
  const cta = view === "registered" ? "결과 보기" : "검토";
  return (
    <div className="mx-auto mb-2 max-w-3xl px-3 lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        data-testid="panel-summary-chip"
        data-level={alert.level}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left ${
          calm ? "border-line bg-surface" : `${t.borderClass} bg-[#FFF7EE]`
        }`}
      >
        <span aria-hidden className="text-base">{calm ? "🟢" : t.glyph}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink-900">{summary}</span>
          <span className={`block truncate text-xs ${calm ? "text-steel-700" : t.textClass}`}>
            {t.label} · {alert.headline}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-brand-700">{cta} →</span>
      </button>
    </div>
  );
}
