/**
 * 디자인 토큰 — 호반 JHA PoC
 *
 * 호반 디자인 시스템 부재 → PoC 자체 토큰. 추후 호반 가이드 흡수 가능하도록
 * 의미(semantic) 단위로 추상화. 색상만으로 정보 전달 금지 → 모든 등급에 text label 병행.
 *
 * 출처: safety-domain-expert 등급 색상 의미 / ux_components.md.
 */

export type RiskGrade = "상" | "중" | "하";

export interface RiskToken {
  /** 등급 라벨 (색상 외 필수 텍스트) */
  label: RiskGrade;
  /** 배경/마커 색상 (Hex) */
  color: string;
  /** 색상 위 가독 텍스트 색상 */
  onColor: string;
  /** 보조 설명 (스크린리더/툴팁) */
  meaning: string;
  /** 색상 외 표식 (비색상 표현 — 패턴/기호) */
  glyph: string;
  /** Tailwind 배경/텍스트 클래스 */
  bgClass: string;
  textClass: string;
  borderClass: string;
}

export const RISK_TOKENS: Record<RiskGrade, RiskToken> = {
  상: {
    label: "상",
    color: "#DC2626",
    onColor: "#FFFFFF",
    meaning: "높음 — 즉시 개선 필요",
    glyph: "▲", // 색상 외 표식
    bgClass: "bg-[#DC2626]",
    textClass: "text-[#DC2626]",
    borderClass: "border-[#DC2626]",
  },
  중: {
    label: "중",
    color: "#F97316",
    onColor: "#FFFFFF",
    meaning: "보통 — 개선 계획 수립",
    glyph: "■",
    bgClass: "bg-[#F97316]",
    textClass: "text-[#C2410C]",
    borderClass: "border-[#F97316]",
  },
  하: {
    label: "하",
    color: "#16A34A",
    onColor: "#FFFFFF",
    meaning: "낮음 — 현 수준 관리",
    glyph: "●",
    bgClass: "bg-[#16A34A]",
    textClass: "text-[#15803D]",
    borderClass: "border-[#16A34A]",
  },
};

export function riskToken(grade: string | null | undefined): RiskToken {
  if (grade === "상" || grade === "중" || grade === "하") return RISK_TOKENS[grade];
  return RISK_TOKENS["하"];
}

/** 강도×빈도(1~5) → 등급 매핑 (KRAS: 곱 ≤9 하 / 10~15 중 / ≥16 상) */
export function gradeFromScore(severity: number, frequency: number): RiskGrade {
  const product = severity * frequency;
  if (product >= 16) return "상";
  if (product >= 10) return "중";
  return "하";
}

/** 곱16 경계셀 판정 (강도4×빈도4) */
export function isBoundaryCell(severity: number, frequency: number): boolean {
  return severity === 4 && frequency === 4;
}

/** confidence(0~1) → 신뢰도 표시 토큰 */
export interface ConfidenceToken {
  level: "높음" | "보통" | "낮음";
  color: string;
  textClass: string;
  bgClass: string;
}

export function confidenceToken(c: number): ConfidenceToken {
  if (c >= 0.8)
    return { level: "높음", color: "#16A34A", textClass: "text-[#15803D]", bgClass: "bg-[#16A34A]" };
  if (c >= 0.5)
    return { level: "보통", color: "#CA8A04", textClass: "text-[#A16207]", bgClass: "bg-[#CA8A04]" };
  return { level: "낮음", color: "#DC2626", textClass: "text-[#DC2626]", bgClass: "bg-[#DC2626]" };
}

/** 검색 score(>0) → 강함/보통/약함 라벨 */
export function scoreLabel(score: number | undefined): string {
  if (score === undefined) return "—";
  if (score >= 8) return `${score.toFixed(1)} (강함)`;
  if (score >= 5) return `${score.toFixed(1)} (보통)`;
  return `${score.toFixed(1)} (약함)`;
}

/** 간격/레이아웃 토큰 */
export const SPACING = {
  touchTarget: "min-h-touch min-w-touch", // ≥44px
  gloveButton: "min-h-[56px]", // 장갑 착용 버튼
};

/** 동적 위험 경보 단계 토큰 (색상만 의존 금지 — glyph+라벨 병행) */
export type AlertLevelKey = "INFO" | "WARN" | "STOP" | "EVAC";
export interface AlertToken {
  label: string;
  glyph: string;
  meaning: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}
export const ALERT_TOKENS: Record<AlertLevelKey, AlertToken> = {
  INFO: {
    label: "정보",
    glyph: "ⓘ",
    meaning: "참고 — 정기 점검 유지",
    bgClass: "bg-[#3B82F6]",
    textClass: "text-[#1D4ED8]",
    borderClass: "border-[#3B82F6]",
  },
  WARN: {
    label: "경고",
    glyph: "▲",
    meaning: "주의 — 관리감독자 확인·시정",
    bgClass: "bg-[#F59E0B]",
    textClass: "text-[#B45309]",
    borderClass: "border-[#F59E0B]",
  },
  STOP: {
    label: "작업중지",
    glyph: "✋",
    meaning: "작업중지 검토 — 현장소장 확인 필요",
    bgClass: "bg-[#DC2626]",
    textClass: "text-[#991B1B]",
    borderClass: "border-[#DC2626]",
  },
  EVAC: {
    label: "대피",
    glyph: "⛔",
    meaning: "즉시 대피 — 인원 철수",
    bgClass: "bg-[#7F1D1D]",
    textClass: "text-[#7F1D1D]",
    borderClass: "border-[#7F1D1D]",
  },
};
export function alertToken(level: string): AlertToken {
  return ALERT_TOKENS[(level as AlertLevelKey)] ?? ALERT_TOKENS.INFO;
}

/**
 * 현장소장 조치 문구 — 경보 수준별 "실제 행위"로 분리.
 *
 * 배경(안전 오해 방지): "승인"이라는 단어가 현장에서 "작업을 계속해도 된다"는
 * 작업 재개 허가로 오독될 수 있다. 따라서 게이트의 버튼·완료 상태·채팅 동기화
 * 문구는 "조치를 승인"이 아니라 실제 수행한 조치(작업중지 기록/대피 지시/휴식 부여)를
 * 명시한다. 공통 확인 행위는 "현장소장 확인 완료"로 통일.
 *
 *  - EVAC → 대피 지시 완료
 *  - STOP → 작업중지 조치 기록
 *  - WARN(폭염 등) → 휴식/보호 조치 완료
 */
export interface StoppageActionCopy {
  /** 게이트 제목 (확인이 필요한 행위) */
  gateTitle: string;
  /** 게이트 본문 안내 */
  gateBody: string;
  /** 실행 버튼 라벨 (idle) */
  buttonLabel: string;
  /** 실행 중 라벨 */
  buttonBusyLabel: string;
  /** 완료 상태 라벨 (배지) */
  doneLabel: string;
  /** 채팅: 사용자 버블(현장소장 1인칭) */
  chatUser: string;
  /** 채팅: 어시스턴트 확인 응답 */
  chatAssistant: string;
}

export function stoppageActionCopy(
  level: string,
  opts?: { heatRest?: boolean },
): StoppageActionCopy {
  // 폭염 휴식 의무는 WARN으로 들어오므로 heatRest 플래그로 구분.
  if (opts?.heatRest && level !== "STOP" && level !== "EVAC") {
    return {
      gateTitle: "현장소장 확인이 필요합니다 (폭염 휴식 조치)",
      gateBody:
        "체감온도 상승으로 폭염 휴식·보호 조치 사유가 발생했습니다. 시스템은 작업을 자동으로 제어하지 않습니다. 현장소장이 휴식·보호 조치를 실제로 완료했는지 확인해 주세요.",
      buttonLabel: "휴식/보호 조치 완료 · 현장소장 확인",
      buttonBusyLabel: "기록 중…",
      doneLabel: "휴식/보호 조치 완료 · 현장소장 확인 완료",
      chatUser: "현장소장으로서 폭염 휴식·보호 조치를 완료했음을 확인합니다.",
      chatAssistant:
        "휴식/보호 조치 완료가 TBM 일지·감사 로그에 기록되었습니다. 작업 재개 허가가 아니라 조치 이행 기록입니다. 이제 평가를 확정하고 등록할 수 있습니다.",
    };
  }
  if (level === "EVAC") {
    return {
      gateTitle: "현장소장 확인이 필요합니다 (대피 지시)",
      gateBody:
        "즉시 대피 사유가 발생했습니다. 시스템은 작업을 자동으로 중지하지 않습니다. 현장소장이 인원 대피 지시를 실제로 완료했는지 확인해 주세요.",
      buttonLabel: "대피 지시 완료 · 현장소장 확인",
      buttonBusyLabel: "기록 중…",
      doneLabel: "대피 지시 완료 · 현장소장 확인 완료",
      chatUser: "현장소장으로서 인원 대피 지시를 완료했음을 확인합니다.",
      chatAssistant:
        "대피 지시 완료가 TBM 일지·감사 로그에 기록되었습니다. 작업 재개 허가가 아니라 대피 조치 이행 기록입니다. 안전이 확보된 뒤에만 평가를 확정·등록하세요.",
    };
  }
  // STOP (기본)
  return {
    gateTitle: "현장소장 확인이 필요합니다 (작업중지 조치)",
    gateBody:
      "작업중지·제한 사유가 발생했습니다. 시스템은 작업을 자동으로 중지하지 않습니다. 현장소장이 작업중지 조치를 실제로 시행했는지 확인해 주세요.",
    buttonLabel: "작업중지 조치 기록 · 현장소장 확인",
    buttonBusyLabel: "기록 중…",
    doneLabel: "작업중지 조치 기록 · 현장소장 확인 완료",
    chatUser: "현장소장으로서 작업중지 조치를 시행했음을 확인합니다.",
    chatAssistant:
      "작업중지 조치 기록이 TBM 일지·감사 로그에 기록되었습니다. 작업 재개 허가가 아니라 작업중지 이행 기록입니다. 위험이 해소된 뒤에만 평가를 확정·등록하세요.",
  };
}
