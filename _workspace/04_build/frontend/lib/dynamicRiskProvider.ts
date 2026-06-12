/**
 * 동적 위험 데이터 provider — 목업↔실API 교체 지점.
 * jha-dynamic-risk 스킬: provider 출력 스키마가 계약. 룰엔진·UI는 불변.
 *
 * 현재: MockProvider (결정론적 데모 데이터).
 * 추후: KmaWeatherProvider / VWorldGeoProvider 추가 후 factory 분기만 교체.
 */

import { GeoHazardContext, WeatherContext } from "./types";
import { latLonToGrid } from "./weatherGrid";
import { buildDynamicRisk, tradeFromClassification } from "./weatherRules";
import { DynamicRiskResult } from "./types";

export interface WeatherProvider {
  getWeather(lat: number, lon: number): Promise<WeatherContext>;
}
export interface GeoHazardProvider {
  getGeoHazard(lat: number, lon: number, address: string): Promise<GeoHazardContext>;
}

// ─── 데모 현장 프리셋 (시나리오별 좌표·기상·지형) ──────────────
// 키워드/세션 시나리오에 매핑해 결정론적으로 위험 상황을 재현.
export type WeatherScenario = "calm" | "windy" | "rainy" | "heatwave" | "storm";

interface SitePreset {
  address: string;
  lat: number;
  lon: number;
  region: string;
}

const SITE_PRESETS: Record<string, SitePreset> = {
  default: { address: "서울특별시 중구 세종대로 110", lat: 37.5665, lon: 126.978, region: "서울 중구" },
  slope: { address: "강원특별자치도 평창군 대관령면", lat: 37.6873, lon: 128.7558, region: "평창 대관령" },
  riverside: { address: "경기도 여주시 강변로", lat: 37.2984, lon: 127.6371, region: "여주" },
};

function weatherFor(scenario: WeatherScenario, preset: SitePreset): WeatherContext {
  const { nx, ny } = latLonToGrid(preset.lat, preset.lon);
  const base: WeatherContext = {
    observed_at: new Date().toISOString(),
    grid_nx: nx,
    grid_ny: ny,
    region_name: preset.region,
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
      return {
        ...base,
        wind_ms: 11.4,
        gust_ms: 16.8, // 타워크레인 운전(15) + 설치/해체(10) 초과
        warnings: [{ code: "WIND_ADVISORY", label: "강풍주의보", level: "주의보", region: preset.region }],
      };
    case "rainy":
      return {
        ...base,
        temp_c: 21,
        apparent_temp_c: 22,
        humidity_pct: 90,
        wind_ms: 6.0,
        gust_ms: 9.5,
        rain_mm_1h: 4.5, // 철골(1) + 굴착(3) 초과
        pty: "비",
        warnings: [{ code: "HEAVY_RAIN_ADVISORY", label: "호우주의보", level: "주의보", region: preset.region }],
      };
    case "heatwave":
      return {
        ...base,
        temp_c: 34,
        apparent_temp_c: 35.6, // 35℃ 이상 → 14~17시 중지 권고 + 33℃ 휴식 의무 라인
        humidity_pct: 68,
        warnings: [{ code: "HEAT_WARNING", label: "폭염경보", level: "경보", region: preset.region }],
      };
    case "storm":
      return {
        ...base,
        wind_ms: 22.0,
        gust_ms: 31.5, // 30 초과 → EVAC
        rain_mm_1h: 9.0,
        pty: "소나기",
        lightning: true,
        warnings: [
          { code: "TYPHOON_WARNING", label: "태풍경보", level: "경보", region: preset.region },
          { code: "HEAVY_RAIN_WARNING", label: "호우경보", level: "경보", region: preset.region },
        ],
      };
    case "calm":
    default:
      return base;
  }
}

function geoFor(presetKey: string, preset: SitePreset): GeoHazardContext {
  const common = { lat: preset.lat, lon: preset.lon, address: preset.address, source: "mock" as const };
  if (presetKey === "slope") {
    return {
      ...common,
      landslide_grade: 4,
      flood_risk: "관심",
      underground_utilities: [],
      soft_ground: false,
      slope_deg: 32,
      near_high_voltage: false,
    };
  }
  if (presetKey === "riverside") {
    return {
      ...common,
      landslide_grade: 1,
      flood_risk: "주의",
      underground_utilities: ["하수관"],
      soft_ground: true,
      slope_deg: 4,
      near_high_voltage: false,
    };
  }
  return {
    ...common,
    landslide_grade: 1,
    flood_risk: "없음",
    underground_utilities: ["가스관", "전력선"],
    soft_ground: false,
    slope_deg: 6,
    near_high_voltage: true,
  };
}

export class MockDynamicRiskProvider {
  constructor(
    private scenario: WeatherScenario = "calm",
    private presetKey: keyof typeof SITE_PRESETS = "default",
  ) {}

  preset(): SitePreset {
    return SITE_PRESETS[this.presetKey] ?? SITE_PRESETS.default;
  }

  async getWeather(): Promise<WeatherContext> {
    await delay(250);
    return weatherFor(this.scenario, this.preset());
  }
  async getGeoHazard(): Promise<GeoHazardContext> {
    await delay(200);
    return geoFor(this.presetKey as string, this.preset());
  }
}

/**
 * 분류 + 데모 시나리오 → 동적 위험 결과.
 * 세션 시나리오(타워크레인/굴착/밀폐공간)에 기상·지형 프리셋을 매핑.
 */
export async function fetchDynamicRisk(
  classification: { major_type?: string | null; sub_type?: string | null; detail_item?: string | null },
  opts?: { weatherScenario?: WeatherScenario; presetKey?: keyof typeof SITE_PRESETS },
): Promise<DynamicRiskResult> {
  const trade = tradeFromClassification(classification);

  // 공종별 기본 데모 시나리오 (사용자가 토글로 변경 가능)
  let scenario: WeatherScenario = opts?.weatherScenario ?? "calm";
  let presetKey: keyof typeof SITE_PRESETS = opts?.presetKey ?? "default";
  if (!opts?.weatherScenario) {
    if (trade === "타워크레인") scenario = "windy";
    else if (trade === "굴착흙막이") {
      scenario = "rainy";
      presetKey = "riverside";
    } else if (trade === "철골") scenario = "rainy";
    else scenario = "calm";
  }
  if (!opts?.presetKey && trade === "굴착흙막이") presetKey = "riverside";

  const provider = new MockDynamicRiskProvider(scenario, presetKey);
  const [weather, geo] = await Promise.all([provider.getWeather(), provider.getGeoHazard()]);
  return buildDynamicRisk(trade, weather, geo);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const WEATHER_SCENARIOS: { key: WeatherScenario; label: string }[] = [
  { key: "calm", label: "평온" },
  { key: "windy", label: "강풍" },
  { key: "rainy", label: "호우" },
  { key: "heatwave", label: "폭염" },
  { key: "storm", label: "태풍·낙뢰" },
];
