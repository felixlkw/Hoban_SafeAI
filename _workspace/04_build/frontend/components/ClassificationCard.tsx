"use client";

import { useMemo, useState } from "react";
import { Classification, ClassificationAlternative } from "@/lib/types";
import { confidenceToken } from "@/lib/tokens";

/**
 * 분류 추천 카드 — 대공종/중공종/세부항목 + confidence 바.
 * 대안 후보 인라인 드롭다운으로 한 클릭 수정. AI 추천은 "제안"일 뿐 — 항상 수정 가능.
 */

interface Props {
  classification: Classification;
  /** 사용자 확정/수정 시 콜백 (확정된 분류 전달) */
  onConfirm: (confirmed: { major_type: string; sub_type: string; detail_item: string }) => void;
  confirming?: boolean;
}

interface Editable {
  major_type: string;
  sub_type: string;
  detail_item: string;
}

function ConfidenceBar({ value }: { value: number }) {
  const tok = confidenceToken(value);
  const pct = Math.round(value * 100);
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">AI 신뢰도</span>
        <span className={`font-semibold ${tok.textClass}`}>
          {tok.level} · {pct}%
        </span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10"
        role="meter"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`AI 분류 신뢰도 ${tok.level} ${pct}퍼센트`}
      >
        <div className={`h-full ${tok.bgClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function ClassificationCard({ classification, onConfirm, confirming = false }: Props) {
  const [edited, setEdited] = useState<Editable>({
    major_type: classification.major_type ?? "",
    sub_type: classification.sub_type ?? "",
    detail_item: classification.detail_item ?? "",
  });
  const [showAlts, setShowAlts] = useState(false);

  const alternatives = classification.alternatives ?? [];
  const hasAlts = alternatives.length > 0;

  const isDirty = useMemo(
    () =>
      edited.major_type !== (classification.major_type ?? "") ||
      edited.sub_type !== (classification.sub_type ?? "") ||
      edited.detail_item !== (classification.detail_item ?? ""),
    [edited, classification],
  );

  function applyAlternative(alt: ClassificationAlternative) {
    setEdited((prev) => ({
      major_type: alt.major_type ?? prev.major_type,
      sub_type: alt.sub_type ?? (alt.level === "sub" ? alt.label : prev.sub_type),
      detail_item: alt.detail_item ?? (alt.level === "detail" ? alt.label : prev.detail_item),
    }));
    setShowAlts(false);
  }

  return (
    <section
      aria-labelledby="cls-title"
      data-testid="classification-card"
      className="surface rounded-lg border p-4"
    >
      <div className="flex items-center justify-between">
        <h2 id="cls-title" className="text-lg font-semibold">
          작업 분류 추천
        </h2>
        <span className="text-xs text-muted">AI 제안 · 수정 가능</span>
      </div>

      <ConfidenceBar value={classification.confidence} />

      {/* 분류 3단 — 직접 편집 가능 */}
      <div className="mt-4 space-y-3">
        {(
          [
            ["major_type", "대공종"],
            ["sub_type", "중공종"],
            ["detail_item", "세부항목"],
          ] as [keyof Editable, string][]
        ).map(([field, label]) => (
          <div key={field}>
            <label htmlFor={`cls-${field}`} className="block text-sm font-medium text-muted">
              {label}
            </label>
            <input
              id={`cls-${field}`}
              type="text"
              value={edited[field]}
              onChange={(e) => setEdited((p) => ({ ...p, [field]: e.target.value }))}
              className="surface mt-1 min-h-touch w-full rounded-md border px-3 py-2 text-base"
            />
          </div>
        ))}
      </div>

      {/* 대안 후보 드롭다운 */}
      {hasAlts && (
        <div className="mt-4">
          <button
            type="button"
            aria-expanded={showAlts}
            aria-controls="cls-alts"
            onClick={() => setShowAlts((v) => !v)}
            className="surface min-h-touch w-full rounded-md border px-3 py-2 text-left text-sm font-medium"
            data-testid="alt-toggle"
          >
            다른 분류 후보 {alternatives.length}건 보기 {showAlts ? "▲" : "▼"}
          </button>
          {showAlts && (
            <ul id="cls-alts" className="mt-2 space-y-2" data-testid="alt-list">
              {alternatives.map((alt, i) => {
                const tok = confidenceToken(alt.confidence);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => applyAlternative(alt)}
                      className="surface flex min-h-touch w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left hover:bg-black/5"
                      data-testid="alt-option"
                    >
                      <span className="text-sm">{alt.label}</span>
                      <span className={`shrink-0 text-xs font-semibold ${tok.textClass}`}>
                        {tok.level} · {Math.round(alt.confidence * 100)}%
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {isDirty && (
        <p className="mt-3 text-sm text-[#A16207]" role="status">
          ✏ 분류를 수정했습니다. 확정 시 수정한 내용으로 위험요인을 평가합니다.
        </p>
      )}

      <button
        type="button"
        disabled={confirming}
        onClick={() => onConfirm(edited)}
        className="mt-4 min-h-[56px] w-full rounded-lg bg-brand px-4 text-lg font-semibold text-white disabled:opacity-50"
        data-testid="confirm-classification"
      >
        {confirming ? "위험요인 분석 중…" : "이 분류로 위험요인 분석 ▶"}
      </button>
    </section>
  );
}
