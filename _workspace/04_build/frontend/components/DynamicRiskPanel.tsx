"use client";

import { DynamicRiskResult } from "@/lib/types";
import { alertToken, stoppageActionCopy } from "@/lib/tokens";
import { WeatherContextCard } from "./WeatherContextCard";
import { WEATHER_SCENARIOS, WeatherScenario } from "@/lib/dynamicRiskProvider";

/**
 * 동적 위험성평가 패널 — 기상·지형을 위험엔진에 결합한 결과.
 *  - 종합 작업중지 경보 배너 (INFO/WARN/STOP/EVAC, 색상+glyph+텍스트)
 *  - 발동된 작업중지 룰 (근거 법령 명시)
 *  - 폭염 휴식 의무 안내
 *  - 지형 재해 플래그
 *  - 현장소장 승인(Human-in-the-loop) — 자동 중지 금지
 *
 * 데모 시나리오 토글로 기상 상황을 바꿔 룰 발동을 시연.
 */

interface Props {
  risk: DynamicRiskResult;
  loading?: boolean;
  /** 데모용 기상 시나리오 변경 */
  scenario?: WeatherScenario;
  onScenarioChange?: (s: WeatherScenario) => void;
  /** 작업중지 승인 (현장소장) */
  onApprove?: () => void;
  approved?: boolean;
  approving?: boolean;
}

export function DynamicRiskPanel({
  risk,
  loading = false,
  scenario,
  onScenarioChange,
  onApprove,
  approved = false,
  approving = false,
}: Props) {
  const tok = alertToken(risk.overall_level);
  const needsApproval = risk.human_approval_required && !approved;
  // 경보 수준별 "실제 행위" 문구 (작업중지 기록/대피 지시/휴식 조치). "승인=작업재개 허가" 오독 방지.
  const actionCopy = stoppageActionCopy(risk.overall_level, { heatRest: risk.heat_rest?.required });

  return (
    <section aria-labelledby="dyn-title" className="space-y-4" data-testid="dynamic-risk-panel">
      {/* 제목은 컴패니언 패널 헤더가 표시 → 중복 방지로 sr-only(스크린리더용 섹션 라벨 유지). */}
      <h2 id="dyn-title" className="sr-only">
        동적 위험 (현장·기상·지형)
      </h2>
      {risk.is_mock && (
        <div className="flex justify-end">
          <span className="rounded-full border border-dashed border-steel-300 px-2 py-0.5 text-[11px] text-muted">
            데모 데이터 · 실 장비/API 연동 예정
          </span>
        </div>
      )}
      {/* 위험성평가 등급(상/중/하)과 구분 — 동적 위험은 '지금 작업 가능한가' 판단. */}
      <p className="rounded-md border border-line bg-surface-page px-3 py-2 text-xs text-ink-800" data-testid="dynamic-scope-note">
        ⓘ 이 판단은 <strong>위험성평가 등급(상/중/하)과 별개</strong>로, 현재 시점의 기상·지형 조건에 따른{" "}
        <strong>작업 가능 여부</strong>를 나타냅니다. 등급 산정 결과를 바꾸지 않습니다.
      </p>

      {/* 데모 시나리오 토글 */}
      {onScenarioChange && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="기상 시나리오 (데모)">
          <span className="text-xs text-muted">기상 상황(데모):</span>
          {WEATHER_SCENARIOS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="radio"
              aria-checked={scenario === s.key}
              onClick={() => onScenarioChange(s.key)}
              className={`min-h-touch rounded-full border px-3 py-1 text-sm ${
                scenario === s.key ? "bg-brand text-white" : "surface"
              }`}
              data-testid={`scenario-${s.key}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* 종합 경보 배너 */}
      <div
        role="alert"
        aria-live="polite"
        data-testid="alert-banner"
        data-level={risk.overall_level}
        className={`flex items-start gap-3 rounded-lg border-2 p-4 ${tok.borderClass} ${
          risk.overall_level === "INFO" ? "bg-[#EFF6FF]" : risk.overall_level === "WARN" ? "bg-[#FFFBEB]" : "bg-[#FEF2F2]"
        }`}
      >
        <span aria-hidden className="text-2xl leading-none">
          {tok.glyph}
        </span>
        <div className="flex-1">
          <p className={`text-base font-bold ${tok.textClass}`}>
            종합 경보: {tok.label}
            <span className="ml-1 font-normal text-muted">— {tok.meaning}</span>
          </p>
          {loading ? (
            <p className="mt-1 text-sm text-muted">기상·지형 데이터를 분석하고 있습니다…</p>
          ) : (
            <ul className="mt-1 space-y-0.5 text-sm">
              {risk.recommendations.map((r, i) => (
                <li key={i}>· {r}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 기상 카드 */}
      <WeatherContextCard weather={risk.weather} />

      {/* 폭염 휴식 의무 */}
      {risk.heat_rest?.required && (
        <div className="rounded-lg border-2 border-[#F59E0B] bg-[#FFFBEB] p-4" data-testid="heat-rest">
          <p className="flex items-center gap-2 text-base font-bold text-[#B45309]">
            <span aria-hidden>🌡</span> 폭염 휴식 의무
          </p>
          <p className="mt-1 text-sm text-ink-800">
            체감온도 33℃ 이상 — 매 {risk.heat_rest.cycle_min / 60}시간 이내 {risk.heat_rest.rest_min}분 이상 휴식을
            부여해야 합니다. (의무, {risk.heat_rest.rule})
          </p>
          <p className="mt-1 text-xs text-muted">
            ※ 체감온도 측정·기록은 연말까지 보관 의무가 있습니다(2025.7.17 시행).
          </p>
        </div>
      )}

      {/* 발동 룰 목록 */}
      {risk.triggered_rules.length > 0 && (
        <div data-testid="triggered-rules">
          <h3 className="mb-2 text-base font-bold">작업중지·제한 판정 ({risk.triggered_rules.length})</h3>
          <ul className="space-y-2">
            {risk.triggered_rules.map((rule) => {
              const rt = alertToken(rule.level);
              return (
                <li
                  key={rule.rule_id}
                  className={`surface rounded-md border-l-4 ${rt.borderClass} border p-3`}
                  data-testid="rule-item"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-sm font-medium">{rule.message}</p>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold text-white ${rt.bgClass}`}
                      aria-label={`경보 ${rt.label}`}
                    >
                      {rt.glyph} {rt.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">⚖ {rule.legal_ref} · 대상: {rule.trade}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 지형 재해 플래그 */}
      {risk.geo_flags.length > 0 && (
        <div data-testid="geo-flags">
          <h3 className="mb-2 text-base font-bold">지형 재해 ({risk.geo_flags.length})</h3>
          <ul className="space-y-2">
            {risk.geo_flags.map((f, i) => {
              const ft = alertToken(f.level);
              return (
                <li key={i} className="surface rounded-md border p-3" data-testid="geo-flag-item">
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex-1 text-sm">{f.message}</p>
                    <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-bold text-white ${ft.bgClass}`}>
                      {ft.glyph} {ft.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">🗺 {f.layer} · {f.source_note}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 현장소장 승인 (Human-in-the-loop) */}
      {needsApproval && onApprove && (
        <div className="rounded-lg border-2 border-[#DC2626] bg-[#FEF2F2] p-4" data-testid="approval-gate">
          <p className="text-base font-bold text-[#991B1B]">{actionCopy.gateTitle}</p>
          <p className="mt-1 text-sm text-ink-800">{actionCopy.gateBody}</p>
          <p className="mt-1 text-xs text-muted">
            ※ 이 확인은 <strong>작업 재개 허가가 아니라</strong> 위 조치를 실제로 시행했음을 기록하는 절차입니다.
          </p>
          <button
            type="button"
            disabled={approving}
            onClick={onApprove}
            className="mt-3 min-h-[56px] w-full rounded-lg bg-[#DC2626] px-4 text-base font-semibold text-white disabled:opacity-50"
            data-testid="approve-stoppage"
          >
            {approving ? actionCopy.buttonBusyLabel : actionCopy.buttonLabel}
          </button>
        </div>
      )}
      {/* 작업자 등 권한 없는 사용자: 조치 기록 버튼 대신 안내(읽기 전용). */}
      {needsApproval && !onApprove && (
        <div className="rounded-lg border-2 border-[#DC2626] bg-[#FEF2F2] p-4" data-testid="approval-readonly">
          <p className="text-base font-bold text-[#991B1B]">{actionCopy.gateTitle}</p>
          <p className="mt-1 text-sm text-ink-800">{actionCopy.gateBody}</p>
          <p className="mt-1 text-xs text-muted">
            이 조치 기록은 <strong>안전관리자·현장소장</strong>이 진행합니다. 작업자는 조치를 직접 기록할 수 없습니다.
          </p>
        </div>
      )}
      {risk.human_approval_required && approved && (
        <div className="rounded-md border border-[#16A34A] bg-[#F0FDF4] p-3 text-sm" data-testid="approval-done">
          <span className="font-semibold text-[#15803D]">✓ {actionCopy.doneLabel}</span>
          <span className="ml-1 text-muted">— TBM 일지·감사 로그에 기록되었습니다.</span>
        </div>
      )}
    </section>
  );
}
