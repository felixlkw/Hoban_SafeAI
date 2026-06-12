"use client";

import { useEffect, useState } from "react";
import { WeatherContextCard } from "@/components/WeatherContextCard";
import { ErpRegistrationStatus } from "@/components/ErpRegistrationStatus";
import { PanelAlertStrip } from "@/components/chat/CompanionPanel";
import { ACCIDENT_CASES, SAFETY_TIPS, MAJOR_TAXONS, caseOfDay, AccidentCase } from "@/lib/briefingData";
import { riskToken } from "@/lib/tokens";
import { PanelAlert } from "@/lib/panelAlert";
import {
  AssessmentResult,
  Classification,
  DynamicRiskResult,
  ErpState,
  WeatherContext,
} from "@/lib/types";

/**
 * 컴패니언 패널 stage 뷰 모음 — ux_companion_panel.md §2 단계별 콘텐츠 매핑.
 *  briefing / classify / review / registered. (hazards/dynamic은 기존 컴포넌트 재사용 — 페이지에서 직접 렌더)
 */

// ─────────────────────────────────────────────────────────
// briefing — 오늘의 현장 브리핑(idle/refused/error)
// ─────────────────────────────────────────────────────────
export function BriefingView({
  weather,
  alert,
  onPickExample,
}: {
  weather?: WeatherContext;
  alert: PanelAlert;
  onPickExample?: (taxonName: string) => void;
}) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTip((t) => (t + 1) % SAFETY_TIPS.length), 6000);
    return () => clearInterval(id);
  }, []);

  const today = caseOfDay();
  const [caseId, setCaseId] = useState<string>(today.chunk_id);
  const active = ACCIDENT_CASES.find((c) => c.chunk_id === caseId) ?? today;

  return (
    <div className="space-y-4" data-testid="briefing-view">
      {weather ? (
        <WeatherContextCard weather={weather} />
      ) : (
        <div className="surface rounded-lg border border-line p-4 text-sm text-steel-700">
          현장 기상 정보를 불러오는 중입니다…
        </div>
      )}

      {/* 오늘의 사고 사례 */}
      <section aria-label="오늘의 사고 사례" className="surface rounded-lg border border-line p-4" data-testid="briefing-cases">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold text-ink-900">
            <span aria-hidden>📌</span> 오늘의 사고 사례
          </h3>
          <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-steel-700">
            재해사례 코퍼스 133건
          </span>
        </div>
        <AccidentCaseCard c={active} />
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="사고 사례 선택">
          {ACCIDENT_CASES.map((c) => (
            <button
              key={c.chunk_id}
              type="button"
              role="tab"
              aria-selected={c.chunk_id === caseId}
              onClick={() => setCaseId(c.chunk_id)}
              className={`min-h-touch rounded-md border px-2.5 text-xs font-semibold transition ${
                c.chunk_id === caseId
                  ? "border-brand-500 bg-surface-tint text-brand-700"
                  : "border-line text-steel-700 hover:border-brand-300"
              }`}
            >
              {c.accident_type}
            </button>
          ))}
        </div>
      </section>

      {/* 오늘의 안전 팁(로테이션) */}
      <section aria-label="오늘의 안전 팁" className="rounded-lg border border-line bg-surface-tint p-4">
        <h3 className="mb-1 flex items-center gap-2 text-base font-bold text-ink-900">
          <span aria-hidden>💡</span> 오늘의 안전 팁
        </h3>
        <p aria-live="polite" className="min-h-[40px] text-sm text-ink-800">
          {SAFETY_TIPS[tip]}
        </p>
        <div className="mt-2 flex items-center gap-1.5" aria-hidden>
          {SAFETY_TIPS.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === tip ? "w-4 bg-brand-500" : "w-1.5 bg-line-strong"}`} />
          ))}
        </div>
      </section>

      {/* 공종 빠른 탐색 */}
      <section aria-label="공종 빠른 탐색" className="surface rounded-lg border border-line p-4">
        <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-ink-900">
          <span aria-hidden>🗂</span> 공종 빠른 탐색
        </h3>
        <p className="mb-2 text-xs text-steel-700">대공종을 누르면 예시 작업으로 입력을 시작할 수 있어요.</p>
        <div className="flex flex-wrap gap-1.5">
          {MAJOR_TAXONS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => (onPickExample ? onPickExample(m.name) : (window.location.href = "/"))}
              className="min-h-touch rounded-md border border-line px-2.5 text-xs font-medium text-ink-800 transition hover:border-brand-400 hover:bg-surface-tint"
            >
              {m.name} <span className="text-steel-700">({m.count})</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function AccidentCaseCard({ c }: { c: AccidentCase }) {
  const t = riskToken(c.risk_grade);
  return (
    <article className="rounded-md border border-line p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-bold text-white ${t.bgClass}`}>
          <span aria-hidden>{t.glyph}</span>{c.accident_type} · {c.risk_grade}
        </span>
        <span className="text-xs text-steel-700">강도 {c.severity} × 빈도 {c.frequency}</span>
      </div>
      <p className="text-sm font-semibold text-ink-900">{c.hazard}</p>
      <p className="mt-1 text-xs text-steel-700"><span className="font-semibold text-ink-800">개선대책 </span>{c.control}</p>
      <p className="mt-1.5 text-[11px] text-steel-700">출처 행 #{c.source_row} · {c.chunk_id}</p>
    </article>
  );
}

// ─────────────────────────────────────────────────────────
// classify — 분류 도우미(공종 트리 위치 + 형제 후보)
// ─────────────────────────────────────────────────────────
export function ClassifyTreeView({ cls }: { cls: Classification }) {
  const major = MAJOR_TAXONS.find((m) => m.name === cls.major_type);
  return (
    <div className="space-y-4" data-testid="classify-view">
      <section aria-label="추천 분류 위치" className="surface rounded-lg border border-line p-4">
        <h3 className="mb-2 text-base font-bold text-ink-900">추천 분류 위치</h3>
        <ol className="space-y-1.5 text-sm">
          <TreeRow level="대공종" value={cls.major_type} extra={major ? `${major.count}건` : undefined} />
          <TreeRow level="중공종" value={cls.sub_type} indent={1} />
          <TreeRow level="세부항목" value={cls.detail_item} indent={2} highlight />
        </ol>
        <p className="mt-2 text-xs text-steel-700">
          왼쪽 분류 카드에서 단계별로 다른 후보를 선택해 수정할 수 있어요. AI 추천은 제안일 뿐입니다.
        </p>
      </section>

      {cls.alternatives && cls.alternatives.length > 0 && (
        <section aria-label="형제 후보" className="surface rounded-lg border border-line p-4">
          <h3 className="mb-2 text-base font-bold text-ink-900">형제·유사 후보</h3>
          <ul className="space-y-1.5">
            {cls.alternatives.slice(0, 4).map((a, i) => (
              <li key={i} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                <span className="text-ink-900">{a.label}</span>
                <span className="text-xs text-steel-700">신뢰도 {(a.confidence * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function TreeRow({
  level,
  value,
  indent = 0,
  extra,
  highlight = false,
}: {
  level: string;
  value: string | null;
  indent?: number;
  extra?: string;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center gap-2" style={{ paddingLeft: indent * 16 }}>
      <span aria-hidden className="text-steel-500">{indent > 0 ? "└" : "▸"}</span>
      <span className="w-16 shrink-0 text-xs text-steel-700">{level}</span>
      <span className={`rounded px-2 py-0.5 text-sm font-semibold ${highlight ? "bg-surface-tint text-brand-700" : "text-ink-900"}`}>
        {value ?? "—"}
      </span>
      {extra && <span className="text-xs text-steel-700">{extra}</span>}
    </li>
  );
}

// ─────────────────────────────────────────────────────────
// review — 검토 요약(확정 전 체크리스트·게이트 상태)
// ─────────────────────────────────────────────────────────
export function ReviewSummaryView({
  assessment,
  dynRisk,
  blockingReasons,
}: {
  assessment: AssessmentResult | null;
  dynRisk: DynamicRiskResult | null;
  blockingReasons: string[];
}) {
  const counts = assessment
    ? assessment.hazards.reduce(
        (a, h) => {
          if (h.boundary_cell) a.boundary++;
          else a[h.risk_grade as "상" | "중" | "하"]++;
          return a;
        },
        { 상: 0, 중: 0, 하: 0, boundary: 0 } as Record<string, number>,
      )
    : null;
  const blocked = blockingReasons.length > 0;

  return (
    <div className="space-y-4" data-testid="review-view">
      <section aria-label="검토 체크리스트" className="surface rounded-lg border border-line p-4">
        <h3 className="mb-2 text-base font-bold text-ink-900">확정 전 체크리스트</h3>
        <ul className="space-y-2 text-sm">
          <CheckRow ok={!!assessment} label="위험요인 평가 완료" detail={counts ? `${assessment!.hazards.length}건 · 상 ${counts["상"]} 중 ${counts["중"]} 하 ${counts["하"]}${counts.boundary ? ` · 경계 ${counts.boundary}` : ""}` : undefined} />
          <CheckRow ok={!!dynRisk} label="동적 위험(기상·지형) 평가 완료" detail={dynRisk ? `종합 ${dynRisk.overall_level} · 작업중지 룰 ${dynRisk.triggered_rules.length}` : undefined} />
          <CheckRow ok={!blocked} label="등록 게이트 통과" detail={blocked ? `차단 사유 ${blockingReasons.length}건` : "차단 사유 없음"} />
        </ul>
      </section>

      {blocked && (
        <section
          aria-label="등록 차단 사유"
          className="rounded-lg border-2 border-risk-high bg-[#FEF2F2] p-4"
          data-testid="review-blockers"
        >
          <h3 className="mb-2 flex items-center gap-2 text-base font-bold text-[#991B1B]">
            <span aria-hidden>⚠</span> 등록 차단 사유
          </h3>
          <ul className="space-y-1.5 text-sm text-[#991B1B]">
            {blockingReasons.map((r, i) => (
              <li key={i} className="flex gap-2"><span aria-hidden>·</span><span>{r}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CheckRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          ok ? "bg-risk-low" : "bg-steel-400"
        }`}
      >
        {ok ? "✓" : "…"}
      </span>
      <span>
        <span className="font-semibold text-ink-900">{label}</span>
        {detail && <span className="block text-xs text-steel-700">{detail}</span>}
        <span className="sr-only">{ok ? " 완료" : " 미완료"}</span>
      </span>
    </li>
  );
}

// ─────────────────────────────────────────────────────────
// registered — 등록 완료(ERP 결과 + 다음 작업)
// ─────────────────────────────────────────────────────────
export function RegisteredView({
  erp,
  outboxId,
  onRetry,
}: {
  erp: ErpState | null;
  outboxId?: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="registered-view">
      {erp ? (
        <ErpRegistrationStatus erp={erp} outboxId={outboxId} onRetry={onRetry} />
      ) : (
        <div className="surface rounded-lg border border-line p-4 text-sm text-steel-700">등록 결과를 준비 중입니다…</div>
      )}

      {erp?.status === "success" && (
        <section aria-label="등록 산출물" className="surface rounded-lg border border-line p-4">
          <h3 className="mb-2 text-base font-bold text-ink-900">등록 산출물</h3>
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <span className="text-ink-900">위험성평가서 PDF</span>
              <span className="text-xs text-steel-700">데모 — 연동 예정</span>
            </li>
            <li className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <span className="text-ink-900">TBM 일지 기록</span>
              <span className="text-xs text-steel-700">데모 — 연동 예정</span>
            </li>
          </ul>
        </section>
      )}

      {erp?.status === "success" && (
        <a
          href="/"
          className="block min-h-[56px] rounded-xl bg-brand px-4 py-3 text-center text-base font-semibold text-white"
        >
          새 작업 평가하기
        </a>
      )}
    </div>
  );
}

// 모바일 요약 칩에 쓰는 미니 경보 띠(re-export 편의)
export { PanelAlertStrip };
