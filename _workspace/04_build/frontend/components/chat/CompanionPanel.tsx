"use client";

import { ReactNode, useEffect } from "react";
import { alertToken } from "@/lib/tokens";
import { PanelAlert } from "@/lib/panelAlert";

/**
 * 컴패니언(상시 동반) 패널 — 설계: ux_companion_panel.md 추천안 B + 상시 경보 띠.
 *
 *  - 데스크톱(lg+): 우측에 항상 존재(role=region). 토글 없음. 콘텐츠(stage)만 페이드 전환.
 *  - 모바일(<lg): 패널을 점유하지 않고, 요약 칩 탭 시 풀스크린 시트(role=dialog, ESC·dim)로 확장.
 *  - 최상단: 상시 경보 띠 1줄(panelAlertFor 결과). 평시 INFO 톤, STOP/EVAC 강조.
 *
 * 액션 핸들러는 부모(세션 페이지) 소유 — 채팅 카드와 패널 본문이 같은 store/핸들러 공유(양방향 동기화).
 */

export type PanelView = "briefing" | "classify" | "hazards" | "dynamic" | "review" | "registered";

const VIEW_LABEL: Record<PanelView, { title: string; subtitle: string }> = {
  briefing: { title: "오늘의 현장 브리핑", subtitle: "기상 · 작업중지 경보 · 오늘의 사고 사례" },
  classify: { title: "작업 분류 도우미", subtitle: "공종 트리에서 추천 위치·형제 후보 확인" },
  hazards: { title: "위험요인 평가", subtitle: "강도·빈도·등급·개선대책 검토" },
  dynamic: { title: "동적 위험 (현장·기상·지형)", subtitle: "작업중지 룰·지형 재해·현장소장 조치 확인" },
  review: { title: "검토 요약", subtitle: "확정 전 체크리스트·게이트 상태" },
  registered: { title: "등록 완료", subtitle: "ERP 등록 결과·다음 작업" },
};

interface Props {
  /** 현재 표시 stage(자동 매핑 또는 탭 override) */
  view: PanelView;
  /** phase로 자동 매핑된 기본 stage(탭에서 "현재 단계로" 복귀 시 사용) */
  autoView: PanelView;
  onViewChange: (v: PanelView) => void;
  /** 상시 경보 띠 상태 */
  alert: PanelAlert;
  /** 모바일 시트 열림 여부(요약 칩 탭으로 제어) */
  sheetOpen: boolean;
  onSheetClose: () => void;
  children: ReactNode;
}

/** 헤더에 노출할 탭(브리핑 + 현재 단계). 항상 브리핑으로 잠깐 복귀 가능. */
function tabsFor(autoView: PanelView): PanelView[] {
  if (autoView === "briefing") return ["briefing"];
  return ["briefing", autoView];
}

export function CompanionPanel({
  view,
  autoView,
  onViewChange,
  alert,
  sheetOpen,
  onSheetClose,
  children,
}: Props) {
  // 모바일 시트일 때만 ESC 닫기(인용 패널이 위에 있으면 그쪽 우선)
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[data-testid="citation-panel"]')) return;
      onSheetClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, onSheetClose]);

  const tabs = tabsFor(autoView);
  const meta = VIEW_LABEL[view];

  return (
    <>
      {/* 모바일 dim 오버레이 — 시트 열렸을 때만 */}
      {sheetOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={onSheetClose} aria-hidden />
      )}

      <aside
        data-testid="companion-panel"
        data-view={view}
        aria-label={`${meta.title} 동반 패널`}
        className={
          // 모바일: 시트(열림 시만 보임) / 데스크톱: 항상 우측 분할 영역
          (sheetOpen ? "fixed inset-x-0 bottom-0 top-16 z-50 flex" : "hidden") +
          " flex-col rounded-t-2xl bg-surface shadow-2xl " +
          "lg:static lg:inset-auto lg:top-auto lg:z-auto lg:flex lg:flex-1 lg:rounded-none lg:border-l lg:border-line lg:shadow-none"
        }
        role="region"
      >
        {/* ── 상시 경보 띠(1줄) ── */}
        <PanelAlertStrip alert={alert} />

        {/* ── 헤더(제목 + 탭 + 모바일 닫기) ── */}
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-ink-900">{meta.title}</p>
            <p className="truncate text-xs text-steel-700">{meta.subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {tabs.length > 1 && (
              <div className="flex rounded-lg bg-surface-sunken p-0.5" role="tablist" aria-label="패널 보기 전환">
                {tabs.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={view === t}
                    data-testid={`panel-tab-${t}`}
                    onClick={() => onViewChange(t)}
                    className={`min-h-touch rounded-md px-2.5 text-xs font-semibold transition ${
                      view === t ? "bg-surface text-brand-700 shadow-sm" : "text-steel-700 hover:text-ink-900"
                    }`}
                  >
                    {t === "briefing" ? "브리핑" : VIEW_LABEL[t].title.split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
            {/* 모바일 시트 닫기 */}
            <button
              type="button"
              onClick={onSheetClose}
              aria-label="패널 닫기"
              className="surface flex h-touch min-w-touch items-center justify-center rounded-md border border-line px-3 text-sm font-medium lg:hidden"
              data-testid="panel-sheet-close"
            >
              <span aria-hidden className="mr-1">✕</span>닫기
            </button>
          </div>
        </header>

        {/* ── stage 콘텐츠(페이드 전환) ── */}
        <div key={view} className="chat-scroll flex-1 animate-fade-in overflow-y-auto p-4">
          {children}
        </div>
      </aside>
    </>
  );
}

/** 상시 경보 띠 — 평시 INFO 톤, STOP/EVAC 강조. 색상+글리프+텍스트 병행(WCAG). */
export function PanelAlertStrip({ alert, compact = false }: { alert: PanelAlert; compact?: boolean }) {
  const t = alertToken(alert.level);
  const calm = alert.level === "INFO";
  return (
    <div
      data-testid="panel-alert-strip"
      data-level={alert.level}
      role={calm ? "status" : "alert"}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold ${
        calm ? "bg-surface-sunken text-ink-800" : `${t.bgClass} text-white`
      } ${compact ? "" : "border-b border-line"}`}
    >
      <span aria-hidden className="text-base leading-none">{calm ? "🟢" : t.glyph}</span>
      <span className="min-w-0 flex-1 truncate">
        <span className="font-bold">{t.label}</span>
        <span className="mx-1.5 opacity-60">·</span>
        <span className={calm ? "font-medium text-steel-700" : "font-medium"}>{alert.headline}</span>
      </span>
      {!calm && alert.ruleCount > 0 && (
        <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs">룰 {alert.ruleCount}</span>
      )}
    </div>
  );
}
