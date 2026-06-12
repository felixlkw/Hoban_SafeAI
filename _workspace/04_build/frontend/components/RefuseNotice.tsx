"use client";

/**
 * 거절(refuse) 안내 — RAG 가드레일이 평가를 거절/부분거절한 경우.
 *
 *  - partial: 일부 위험요인만 평가됨(예: 추락만, 질식 갭). 나머지는 수동 작성 안내.
 *  - full: 표준 데이터 범위 밖 → 전체 거절. 추측 평가 미제공.
 *
 * 친절한 한국어 + 다음 행동 안내 + 담당자 연락처 (영어 코드 금지).
 */

interface Props {
  mode: "partial" | "full";
  /** 데이터 갭 영역 (예: ["질식(밀폐공간)"]) */
  gapAreas?: string[];
  /** 백엔드 경고 메시지 */
  warnings?: string[];
  /** 담당자 연락처 (기본 EHS팀) */
  contact?: string;
  className?: string;
}

export function RefuseNotice({
  mode,
  gapAreas = [],
  warnings = [],
  contact = "안전보건팀 내선 1234",
  className = "",
}: Props) {
  const partial = mode === "partial";

  return (
    <section
      role="alert"
      aria-live="polite"
      data-testid="refuse-notice"
      data-mode={mode}
      className={`rounded-lg border-2 p-4 ${
        partial ? "border-[#F97316] bg-[#FFF7ED]" : "border-[#DC2626] bg-[#FEF2F2]"
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {partial ? "⚠️" : "🛑"}
        </span>
        <div className="flex-1">
          <h3 className={`text-base font-bold ${partial ? "text-[#9A3412]" : "text-[#991B1B]"}`}>
            {partial
              ? "일부 위험요인만 자동 평가되었습니다"
              : "이 작업은 자동 평가를 제공하지 않습니다"}
          </h3>

          <p className="mt-1 text-sm text-ink-800">
            {partial
              ? "AI가 신뢰할 수 있는 표준 데이터가 있는 항목만 평가했습니다. 아래 미평가 영역은 안전관리자가 직접 작성해 주세요. 추측으로 채우지 않습니다."
              : "입력하신 작업은 PoC 표준 위험요인 데이터 범위를 벗어납니다. AI가 근거 없이 추측한 평가를 제공하지 않습니다. 아래 안내에 따라 진행해 주세요."}
          </p>

          {gapAreas.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-ink-800">
                {partial ? "수동 작성이 필요한 영역" : "데이터 미보유 영역"}
              </p>
              <ul className="mt-1 list-disc pl-5 text-sm text-ink-800">
                {gapAreas.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm text-steel-700">
              {warnings.map((w, i) => (
                <li key={i}>· {w}</li>
              ))}
            </ul>
          )}

          <div className="mt-4 rounded-md bg-white/70 p-3 text-sm">
            <p className="font-semibold text-ink-800">다음 행동</p>
            <ol className="mt-1 list-decimal pl-5 text-ink-800">
              {partial ? (
                <>
                  <li>자동 평가된 항목을 검토·확정합니다.</li>
                  <li>미평가 영역은 표준 절차(KOSHA Guide 등)를 참고해 직접 추가합니다.</li>
                  <li>완료 후 안전관리자 승인을 요청합니다.</li>
                </>
              ) : (
                <>
                  <li>해당 작업의 전용 위험성평가 양식을 사용하세요.</li>
                  <li>관련 법령(석면안전관리법, MSDS 등) 전문가 검토를 받으세요.</li>
                  <li>데이터 보강이 필요하면 담당자에게 요청하세요.</li>
                </>
              )}
            </ol>
            <p className="mt-2 text-steel-700">
              문의: <span className="font-semibold text-ink-800">{contact}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
