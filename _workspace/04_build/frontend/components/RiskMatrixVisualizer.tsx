"use client";

import { gradeFromScore, isBoundaryCell, riskToken } from "@/lib/tokens";

/**
 * KRAS 5×5 위험도 매트릭스 시각화.
 * 가로=빈도(1~5), 세로=강도(1~5). 곱 ≤9 하(초록) / 10~15 중(주황) / ≥16 상(빨강).
 * 곱16(4×4) 경계셀은 점선 테두리로 강조.
 *
 * 색상만으로 정보 전달 금지 → 각 셀에 등급 glyph(▲■●)+곱셈값 텍스트.
 */

interface Props {
  /** 현재 위험요인의 강도(1~5) */
  severity?: number;
  /** 현재 위험요인의 빈도(1~5) */
  frequency?: number;
  /** 강조할 셀 좌표 표시 여부 */
  highlight?: boolean;
  compact?: boolean;
}

const LEVELS = [5, 4, 3, 2, 1]; // 세로(강도) 위→아래

export function RiskMatrixVisualizer({
  severity,
  frequency,
  highlight = true,
  compact = false,
}: Props) {
  return (
    <figure aria-label="KRAS 5x5 위험도 매트릭스" className="surface rounded-lg border p-3">
      <figcaption className="mb-2 text-sm font-semibold">
        위험도 매트릭스 (강도 × 빈도)
        {severity && frequency && (
          <span className="ml-1 font-normal text-muted">
            — 현재 강도 {severity} × 빈도 {frequency} = {severity * frequency}
          </span>
        )}
      </figcaption>
      <div className="flex">
        {/* 세로축 라벨 */}
        <div className="mr-1 flex flex-col justify-around pr-1 text-[10px] text-muted">
          <span className="writing-vertical select-none">강도 ▲</span>
        </div>
        <div className="flex-1">
          <table className="w-full border-collapse" role="grid">
            <tbody>
              {LEVELS.map((sev) => (
                <tr key={sev}>
                  <th
                    scope="row"
                    className="w-6 px-1 text-right text-xs text-muted"
                    aria-label={`강도 ${sev}`}
                  >
                    {sev}
                  </th>
                  {[1, 2, 3, 4, 5].map((freq) => {
                    const grade = gradeFromScore(sev, freq);
                    const tok = riskToken(grade);
                    const boundary = isBoundaryCell(sev, freq);
                    const isCurrent =
                      highlight && severity === sev && frequency === freq;
                    return (
                      <td
                        key={freq}
                        role="gridcell"
                        aria-label={`강도${sev} 빈도${freq}, 등급 ${grade}, 곱 ${sev * freq}${
                          boundary ? ", 경계셀" : ""
                        }${isCurrent ? ", 현재 위험요인" : ""}`}
                        className={`relative border border-white/40 text-center align-middle ${tok.bgClass} ${
                          compact ? "h-7" : "h-9"
                        } ${boundary ? "ring-2 ring-inset ring-[#CA8A04]" : ""} ${
                          isCurrent ? "outline outline-[3px] outline-offset-[-3px] outline-black" : ""
                        }`}
                      >
                        <span
                          className="text-[10px] font-bold"
                          style={{ color: tok.onColor }}
                          aria-hidden
                        >
                          {tok.glyph}
                          {boundary && "*"}
                        </span>
                        {isCurrent && (
                          <span
                            aria-hidden
                            className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-white"
                          >
                            ●
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th scope="col" aria-hidden></th>
                {[1, 2, 3, 4, 5].map((f) => (
                  <th
                    key={f}
                    scope="col"
                    className="px-1 text-center text-xs text-muted"
                    aria-label={`빈도 ${f}`}
                  >
                    {f}
                  </th>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="mt-1 text-center text-[10px] text-muted">빈도 ▶</div>
        </div>
      </div>

      {/* 범례 (색상+glyph+텍스트 병행) */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {(["상", "중", "하"] as const).map((g) => {
          const tok = riskToken(g);
          return (
            <li key={g} className="flex items-center gap-1">
              <span className={`inline-block h-3 w-3 rounded-sm ${tok.bgClass}`} aria-hidden />
              <span aria-hidden>{tok.glyph}</span>
              <span>
                {g} ({tok.meaning})
              </span>
            </li>
          );
        })}
        <li className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-inset ring-[#CA8A04]" aria-hidden />
          <span>* 경계셀 (4×4=16, 확정 필요)</span>
        </li>
      </ul>
    </figure>
  );
}
