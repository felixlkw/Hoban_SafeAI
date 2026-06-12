/**
 * 상시 경보 띠(SafetyStrip) 상태 산출 — 컴패니언 패널 최상단 1줄.
 *
 * 설계: ux_companion_panel.md §4 추천안(B + C의 상시 경보 띠 1줄).
 * 현재 기상 시나리오 + (선택)확정 공종으로 weatherRules를 평가해 종합 경보 단계를 도출.
 * 작업 분류 확정 전(idle)에는 공종 미상 → "일반" 공종 + 전 공종 룰(폭염/낙뢰)만 반영.
 *
 * 평시(INFO)는 차분한 정보 톤, STOP/EVAC는 강조색(alertToken). 채팅 상단 배너와 동일 데이터.
 */

import { AlertLevel } from "./types";
import { WeatherScenario } from "./dynamicRiskProvider";
import { evaluateWeatherRules, maxLevel } from "./weatherRules";
import { latLonToGrid } from "./weatherGrid";
import { WeatherContext } from "./types";

export interface PanelAlert {
  level: AlertLevel;
  /** 한 줄 요약(경보 띠 문구) */
  headline: string;
  /** 발동 룰 개수 */
  ruleCount: number;
  region: string;
}

// idle 단계 경보 산출용 경량 기상 컨텍스트(공종 미상). dynamicRiskProvider 프리셋과 정합.
function weatherForScenario(scenario: WeatherScenario): WeatherContext {
  const { nx, ny } = latLonToGrid(37.5665, 126.978);
  const base: WeatherContext = {
    observed_at: new Date().toISOString(),
    grid_nx: nx,
    grid_ny: ny,
    region_name: "서울 중구",
    temp_c: 24,
    apparent_temp_c: 25,
    humidity_pct: 55,
    wind_ms: 3.2,
    gust_ms: 5.1,
    rain_mm_1h: 0,
    snow_cm_1h: 0,
    pty: "없음",
    lightning: false,
    pm10: 35,
    warnings: [],
    source: "mock",
  };
  switch (scenario) {
    case "windy":
      return { ...base, wind_ms: 11.4, gust_ms: 16.8, warnings: [{ code: "WIND_ADVISORY", label: "강풍주의보", level: "주의보", region: base.region_name }] };
    case "rainy":
      return { ...base, temp_c: 21, apparent_temp_c: 22, humidity_pct: 90, wind_ms: 6, gust_ms: 9.5, rain_mm_1h: 4.5, pty: "비", warnings: [{ code: "HEAVY_RAIN_ADVISORY", label: "호우주의보", level: "주의보", region: base.region_name }] };
    case "heatwave":
      return { ...base, temp_c: 34, apparent_temp_c: 35.6, humidity_pct: 68, warnings: [{ code: "HEAT_WARNING", label: "폭염경보", level: "경보", region: base.region_name }] };
    case "storm":
      return { ...base, wind_ms: 22, gust_ms: 31.5, rain_mm_1h: 9, pty: "소나기", lightning: true, warnings: [{ code: "TYPHOON_WARNING", label: "태풍경보", level: "경보", region: base.region_name }] };
    case "calm":
    default:
      return base;
  }
}

/**
 * 경보 띠 상태. trade 미지정 시 "일반"(전 공종 공통 룰만), 기상특보가 있으면 그 라벨을 우선 표기.
 */
export function panelAlertFor(scenario: WeatherScenario | undefined, trade = "일반"): PanelAlert {
  const w = weatherForScenario(scenario ?? "calm");
  const fired = evaluateWeatherRules(trade, w);
  const level = fired.length ? maxLevel(fired.map((f) => f.level)) : "INFO";
  const warnLabel = w.warnings[0]?.label;

  let headline: string;
  if (level === "INFO") {
    headline = warnLabel ? `${warnLabel} — 현재 작업중지 사유는 없습니다` : "작업중지 경보 없음 · 정상 작업 가능";
  } else {
    const lead = warnLabel ? `${warnLabel} · ` : "";
    headline = `${lead}${fired[0]?.trade ?? trade} ${fired[0]?.message ?? ""}`.trim();
  }
  return { level, headline, ruleCount: fired.length, region: w.region_name };
}
