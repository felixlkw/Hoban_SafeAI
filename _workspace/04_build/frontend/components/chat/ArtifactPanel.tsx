"use client";

import { ReactNode } from "react";

/**
 * 채팅 측 요약 카드(ArtifactOpener) — 컴패니언 패널 전환 후의 역할:
 * "큰 화면을 연다"가 아니라 "상시 패널을 해당 stage로 포커스 전환"한다.
 * 라벨도 위치("오른쪽에서")를 빼고 동작만 — 기본 "검토 →"(설계 ux_companion_panel.md §5).
 *
 * (구 ArtifactPanel 분할 시트 컴포넌트는 CompanionPanel.tsx로 대체되어 제거됨.)
 */

export function ArtifactOpener({
  icon = "📋",
  title,
  summary,
  cta = "검토",
  onOpen,
  active = false,
}: {
  icon?: string;
  title: string;
  summary?: ReactNode;
  cta?: string;
  onOpen: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="artifact-opener"
      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:border-brand-500 ${
        active ? "border-brand-500 bg-surface-tint" : "surface border-line"
      }`}
    >
      <span aria-hidden className="text-2xl">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-ink-900">{title}</span>
        {summary && <span className="mt-0.5 block text-sm text-steel-700">{summary}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold text-brand-700">{cta} →</span>
    </button>
  );
}
