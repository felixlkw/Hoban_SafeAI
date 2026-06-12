"use client";

import { useMemo, useState } from "react";
import { Hazard, CitationDetail } from "@/lib/types";
import { riskToken } from "@/lib/tokens";
import { BoundaryCellBadge } from "./BoundaryCellBadge";

/**
 * 위험요인·대책 매트릭스 — 재해형태별 그룹 + 위험요인 카드.
 * 각 카드: 강도×빈도×등급, 개선대책 체크리스트, 인용 링크(클릭→CitationPanel).
 *
 * 등급 색상 + glyph + 텍스트 라벨 병행 (색상만 의존 금지).
 */

interface Props {
  hazards: Hazard[];
  /** 인용 클릭 시 chunk_id 전달 */
  onCitationClick: (chunkId: string, detail?: CitationDetail) => void;
  /** 등급 수정 가능 여부 (안전관리자 검토 단계) */
  editable?: boolean;
  /** 등급 수정 콜백 */
  onGradeChange?: (hazardIndex: number, grade: "상" | "중" | "하") => void;
}

export function HazardMatrix({ hazards, onCitationClick, editable = false, onGradeChange }: Props) {
  // 재해형태별 그룹핑 (원래 인덱스 보존)
  const groups = useMemo(() => {
    const m = new Map<string, { hazard: Hazard; index: number }[]>();
    hazards.forEach((h, index) => {
      const key = h.accident_type || "기타";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push({ hazard: h, index });
    });
    return Array.from(m.entries());
  }, [hazards]);

  if (hazards.length === 0) {
    return <p className="text-sm text-muted">표시할 위험요인이 없습니다.</p>;
  }

  return (
    <div className="space-y-5" data-testid="hazard-matrix">
      {groups.map(([accidentType, items]) => (
        <section key={accidentType} aria-labelledby={`grp-${accidentType}`}>
          <h3 id={`grp-${accidentType}`} className="mb-2 flex items-center gap-2 text-base font-bold">
            <span aria-hidden>🏷</span>
            {accidentType}
            <span className="text-sm font-normal text-muted">({items.length})</span>
          </h3>
          <div className="space-y-3">
            {items.map(({ hazard, index }) => (
              <HazardCard
                key={index}
                hazard={hazard}
                index={index}
                onCitationClick={onCitationClick}
                editable={editable}
                onGradeChange={onGradeChange}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function HazardCard({
  hazard,
  index,
  onCitationClick,
  editable,
  onGradeChange,
}: {
  hazard: Hazard;
  index: number;
  onCitationClick: Props["onCitationClick"];
  editable?: boolean;
  onGradeChange?: Props["onGradeChange"];
}) {
  const tok = riskToken(hazard.risk_grade);
  const product = hazard.severity * hazard.frequency;

  return (
    <article
      className={`surface rounded-lg border-l-4 ${tok.borderClass} border p-4`}
      data-testid="hazard-card"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="flex-1 text-base font-medium">{hazard.description}</p>
        {hazard.boundary_cell ? (
          <BoundaryCellBadge mode="grade" grade={hazard.risk_grade} />
        ) : (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-sm font-bold ${tok.bgClass}`}
            style={{ color: tok.onColor }}
            aria-label={`위험등급 ${hazard.risk_grade} — ${tok.meaning}`}
          >
            <span aria-hidden>{tok.glyph}</span>
            {hazard.risk_grade}
          </span>
        )}
      </div>

      {/* 강도×빈도×등급 */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>강도 {hazard.severity}</span>
        <span aria-hidden>×</span>
        <span>빈도 {hazard.frequency}</span>
        <span aria-hidden>=</span>
        <span className="font-semibold">곱 {product}</span>
      </div>

      {/* 등급 수정 (검토 단계) */}
      {editable && onGradeChange && (
        <div className="mt-3" role="radiogroup" aria-label={`${hazard.accident_type} 위험등급 확정`}>
          <span className="mr-2 text-sm font-medium">등급 확정:</span>
          {(["상", "중", "하"] as const).map((g) => {
            const gt = riskToken(g);
            const active = hazard.risk_grade === g && !hazard.boundary_cell;
            return (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onGradeChange(index, g)}
                className={`mr-2 min-h-touch rounded-md border px-3 py-1 text-sm font-semibold ${
                  active ? `${gt.bgClass} text-white` : "surface"
                }`}
              >
                <span aria-hidden>{gt.glyph} </span>
                {g}
              </button>
            );
          })}
        </div>
      )}

      {/* 개선대책 체크리스트 — 미체크 시작, 사용자가 적용 확인(체크). */}
      {hazard.controls && hazard.controls.length > 0 && <ControlsChecklist controls={hazard.controls} />}

      {/* 인용 링크 */}
      {hazard.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">근거:</span>
          {hazard.citations.map((cid) => (
            <button
              key={cid}
              type="button"
              onClick={() => onCitationClick(cid, hazard.citation_detail?.[cid])}
              className="min-h-touch rounded-full border border-brand-500 px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
              data-testid="citation-link"
              aria-label={`인용 원문 ${cid} 보기`}
            >
              📄 {cid}
            </button>
          ))}
        </div>
      )}

      {/* 법령 인용: 있으면 표시, 없으면 "확인 필요" 경고 배지(법적 인용 의무 — matrix §1). */}
      {hazard.legal_refs && hazard.legal_refs.length > 0 ? (
        <p className="mt-2 text-xs text-muted">⚖ {hazard.legal_refs.join(" · ")}</p>
      ) : (
        <p
          className="mt-2 inline-flex items-center gap-1 rounded-md border border-[#CA8A04] bg-[#FEF9C3] px-2 py-0.5 text-xs font-semibold text-[#854D0E]"
          role="status"
          data-testid="legal-ref-warning"
        >
          <span aria-hidden>⚠</span> 법령 인용 확인 필요 — 안전관리자 검토 시 조문 보강
        </p>
      )}
    </article>
  );
}

/**
 * 개선대책 체크리스트 — 미체크로 시작. 사용자가 각 대책을 "적용 확인"(체크).
 * 전부 체크 전에는 다음 단계 경고(차단은 아님 — 와이어프레임 정합).
 */
function ControlsChecklist({ controls }: { controls: string[] }) {
  const [checked, setChecked] = useState<boolean[]>(() => controls.map(() => false));
  const doneCount = checked.filter(Boolean).length;
  const allDone = doneCount === controls.length;

  return (
    <div className="mt-3" data-testid="controls-checklist">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">개선대책 적용 확인</p>
        <span className={`text-xs font-semibold ${allDone ? "text-[#15803D]" : "text-[#A16207]"}`} aria-live="polite">
          {doneCount}/{controls.length} 적용
        </span>
      </div>
      <ul className="mt-1 space-y-1">
        {controls.map((c, i) => (
          <li key={i}>
            <label className="flex min-h-touch cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() =>
                  setChecked((prev) => {
                    const next = [...prev];
                    next[i] = !next[i];
                    return next;
                  })
                }
                aria-label={`개선대책 적용 확인: ${c}`}
                data-testid="control-checkbox"
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#16A34A]"
              />
              <span className={checked[i] ? "text-ink-800" : "font-medium"}>
                {c}
                {checked[i] && <span className="ml-1 text-xs font-semibold text-[#15803D]">✓ 적용 확인</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!allDone && (
        <p className="mt-1 text-xs text-[#A16207]" role="status">
          ⚠ 미적용 대책이 있습니다. 모든 개선대책을 적용 확인한 뒤 등록하는 것을 권장합니다.
        </p>
      )}
    </div>
  );
}
