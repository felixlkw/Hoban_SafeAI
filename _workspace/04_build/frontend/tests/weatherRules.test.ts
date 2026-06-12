import { describe, it, expect } from "vitest";
import {
  evaluateWeatherRules,
  evaluateGeoFlags,
  buildDynamicRisk,
  tradeFromClassification,
  maxLevel,
} from "@/lib/weatherRules";
import { latLonToGrid } from "@/lib/weatherGrid";
import { WeatherContext, GeoHazardContext } from "@/lib/types";

function weather(p: Partial<WeatherContext>): WeatherContext {
  return {
    observed_at: "2026-06-11T09:00:00+09:00",
    grid_nx: 60,
    grid_ny: 127,
    region_name: "테스트",
    temp_c: 24,
    apparent_temp_c: 25,
    humidity_pct: 55,
    wind_ms: 3,
    gust_ms: 5,
    rain_mm_1h: 0,
    snow_cm_1h: 0,
    pty: "없음",
    lightning: false,
    pm10: 30,
    warnings: [],
    source: "mock",
    ...p,
  };
}
function geo(p: Partial<GeoHazardContext>): GeoHazardContext {
  return {
    lat: 37.5,
    lon: 127,
    address: "테스트",
    landslide_grade: 0,
    flood_risk: "없음",
    underground_utilities: [],
    soft_ground: false,
    slope_deg: 0,
    near_high_voltage: false,
    source: "mock",
    ...p,
  };
}

describe("tradeFromClassification", () => {
  it("타워크레인/철골/굴착/콘크리트를 공종으로 매핑한다", () => {
    expect(tradeFromClassification({ sub_type: "타워크레인(T형)" })).toBe("타워크레인");
    expect(tradeFromClassification({ detail_item: "철골 볼팅" })).toBe("철골");
    expect(tradeFromClassification({ sub_type: "흙막이 공사", detail_item: "굴착·터파기" })).toBe("굴착흙막이");
    expect(tradeFromClassification({ detail_item: "콘크리트 타설" })).toBe("콘크리트타설");
  });
});

describe("evaluateWeatherRules — 풍속", () => {
  it("타워크레인: 순간풍속 16.8m/s → 운전(15)+설치/해체(10) 중지 룰 발동", () => {
    const rules = evaluateWeatherRules("타워크레인", weather({ gust_ms: 16.8, wind_ms: 11 }));
    const ids = rules.map((r) => r.rule_id);
    expect(ids).toContain("WIND_TC_OP_15");
    expect(ids).toContain("WIND_TC_ERECT_10");
    expect(rules.every((r) => r.level === "STOP" || r.level === "EVAC")).toBe(true);
  });

  it("타워크레인: 순간풍속 8m/s(평온)면 풍속 룰 미발동", () => {
    const rules = evaluateWeatherRules("타워크레인", weather({ gust_ms: 8, wind_ms: 5 }));
    expect(rules.filter((r) => r.rule_id.startsWith("WIND_TC")).length).toBe(0);
  });

  it("이동식크레인: 평균풍속 6m/s → 정격 20% 감(DERATE_20, WARN)", () => {
    const rules = evaluateWeatherRules("이동식크레인", weather({ wind_ms: 6, gust_ms: 8 }));
    const derate = rules.find((r) => r.rule_id === "WIND_MC_DERATE_5");
    expect(derate?.action).toBe("DERATE_20");
    expect(derate?.level).toBe("WARN");
  });

  it("옥외 양중기: 순간풍속 31.5m/s → 대피(EVAC)", () => {
    const rules = evaluateWeatherRules("타워크레인", weather({ gust_ms: 31.5 }));
    expect(rules.find((r) => r.rule_id === "WIND_OUTCRANE_30")?.level).toBe("EVAC");
  });
});

describe("evaluateWeatherRules — 강우/철골", () => {
  it("철골: 시간당 강우 1.0mm 이상 → 중지(§383)", () => {
    const rules = evaluateWeatherRules("철골", weather({ rain_mm_1h: 1.2 }));
    const rain = rules.find((r) => r.rule_id === "RAIN_STEEL_1");
    expect(rain?.level).toBe("STOP");
    expect(rain?.legal_ref).toContain("§383");
  });
  it("철골: 강우 0.5mm면 미발동(임계 1)", () => {
    const rules = evaluateWeatherRules("철골", weather({ rain_mm_1h: 0.5 }));
    expect(rules.find((r) => r.rule_id === "RAIN_STEEL_1")).toBeUndefined();
  });
});

describe("evaluateWeatherRules — 폭염", () => {
  it("체감 33.5℃ → 2시간당 20분 휴식 의무(HEAT_33), 35/38은 미발동(경계 배타)", () => {
    const rules = evaluateWeatherRules("일반", weather({ apparent_temp_c: 33.5 }));
    expect(rules.find((r) => r.rule_id === "HEAT_33")?.action).toBe("REST_20PER2H");
    expect(rules.find((r) => r.rule_id === "HEAT_35")).toBeUndefined();
    expect(rules.find((r) => r.rule_id === "HEAT_31")).toBeUndefined();
  });
  it("체감 38.2℃ → 옥외작업 중지(HEAT_38)", () => {
    const rules = evaluateWeatherRules("일반", weather({ apparent_temp_c: 38.2 }));
    expect(rules.find((r) => r.rule_id === "HEAT_38")?.action).toBe("STOP_OUTDOOR");
  });
  it("체감 31.5℃ → 냉방·휴식 조치(INFO)", () => {
    const rules = evaluateWeatherRules("일반", weather({ apparent_temp_c: 31.5 }));
    expect(rules.find((r) => r.rule_id === "HEAT_31")?.level).toBe("INFO");
  });
});

describe("evaluateGeoFlags", () => {
  it("굴착: 지하매설물 인접 → 경고 플래그", () => {
    const flags = evaluateGeoFlags("굴착흙막이", geo({ underground_utilities: ["가스관"] }));
    expect(flags.some((f) => f.layer === "지하공간통합지도")).toBe(true);
  });
  it("산사태 4등급 + 굴착 → STOP 플래그", () => {
    const flags = evaluateGeoFlags("굴착흙막이", geo({ landslide_grade: 4 }));
    expect(flags.find((f) => f.layer === "산사태위험지도")?.level).toBe("STOP");
  });
  it("침수 위험 구역 → STOP 플래그", () => {
    const flags = evaluateGeoFlags("일반", geo({ flood_risk: "위험" }));
    expect(flags.find((f) => f.layer === "홍수위험지도")?.level).toBe("STOP");
  });
});

describe("buildDynamicRisk — 종합", () => {
  it("강풍 타워크레인: overall STOP, 승인 필요", () => {
    const dr = buildDynamicRisk("타워크레인", weather({ gust_ms: 16.8, wind_ms: 11 }), geo({}));
    expect(dr.overall_level).toBe("STOP");
    expect(dr.human_approval_required).toBe(true);
    expect(dr.triggered_rules.length).toBeGreaterThan(0);
  });
  it("평온 일반작업: overall INFO, 승인 불필요, 권고 기본 메시지", () => {
    const dr = buildDynamicRisk("일반", weather({}), geo({}));
    expect(dr.overall_level).toBe("INFO");
    expect(dr.human_approval_required).toBe(false);
    expect(dr.recommendations[0]).toContain("추가 작업중지 사유는 없습니다");
  });
  it("체감 34℃: 폭염 휴식 의무 객체 생성 + 승인 필요", () => {
    const dr = buildDynamicRisk("일반", weather({ apparent_temp_c: 34 }), geo({}));
    expect(dr.heat_rest?.required).toBe(true);
    expect(dr.heat_rest?.rest_min).toBe(20);
    expect(dr.human_approval_required).toBe(true);
  });
});

describe("maxLevel", () => {
  it("가장 높은 경보 단계를 반환한다", () => {
    expect(maxLevel(["INFO", "WARN", "STOP"])).toBe("STOP");
    expect(maxLevel(["INFO", "EVAC", "WARN"])).toBe("EVAC");
    expect(maxLevel(["INFO"])).toBe("INFO");
  });
});

describe("latLonToGrid (기상청 LCC)", () => {
  it("서울시청(37.5665,126.978) → 격자 약 (60,127)", () => {
    const g = latLonToGrid(37.5665, 126.978);
    expect(g.nx).toBeGreaterThanOrEqual(59);
    expect(g.nx).toBeLessThanOrEqual(61);
    expect(g.ny).toBeGreaterThanOrEqual(126);
    expect(g.ny).toBeLessThanOrEqual(128);
  });
  it("정수 격자좌표를 반환한다", () => {
    const g = latLonToGrid(35.1796, 129.0756); // 부산
    expect(Number.isInteger(g.nx)).toBe(true);
    expect(Number.isInteger(g.ny)).toBe(true);
  });
});
