"use client";

/**
 * 경계셀 배지 — KRAS 곱16(강도4×빈도4) 경계 또는 "O (잠정)" 중점등록 잠정 상태 표시.
 *
 * 색상만으로 정보 전달 금지 원칙 → 아이콘(⚠)+텍스트("잠정") 병행, title/aria-label 보조.
 * 두 모드:
 *  - grade: 위험등급 경계 → "상(잠정)" 식
 *  - register: 중점등록(산안법상 중점 관리 대상) → "O(잠정)" 식
 */

interface Props {
  /** "grade" → 위험등급 경계셀 / "register" → 중점등록 잠정 */
  mode?: "grade" | "register";
  /** grade 모드일 때 잠정 등급 (상/중) */
  grade?: string;
  /** register 모드일 때 표시 기호 (O 등) */
  symbol?: string;
  className?: string;
}

export function BoundaryCellBadge({ mode = "grade", grade = "상", symbol = "O", className = "" }: Props) {
  const isGrade = mode === "grade";
  const core = isGrade ? grade : symbol;
  const aria = isGrade
    ? `위험등급 ${grade} (잠정) — 경계셀로 안전관리자 확정 필요`
    : `중점등록 ${symbol} (잠정) — 안전관리자 확정 필요`;

  return (
    <span
      role="status"
      aria-label={aria}
      title={aria}
      className={`inline-flex items-center gap-1 rounded-md border-2 border-dashed border-[#CA8A04] bg-[#FEF9C3] px-2 py-0.5 text-sm font-semibold text-[#854D0E] ${className}`}
      data-testid="boundary-badge"
    >
      <span aria-hidden className="text-base leading-none">
        ⚠
      </span>
      <span>
        {core}
        <span className="ml-0.5 font-normal">(잠정)</span>
      </span>
    </span>
  );
}
