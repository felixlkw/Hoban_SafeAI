/**
 * 기상 작업중지 룰엔진 — 정량 임계값 결정테이블 (순수 함수, 실제 동작).
 * 출처: 산업안전보건기준에 관한 규칙 §37/§140/§143/§383, KOSHA C-69/C-99,
 *       고용노동부 폭염 지침(2025.7.17 §559/§560), 국토부 콘크리트 타설 가이드.
 *       jha-dynamic-risk 스킬 weather_rules.md.
 *
 * 입력: 공종(trade) + WeatherContext → 발동 룰 목록 + 종합 경보 단계.
 */

import {
  AlertLevel,
  DynamicRiskResult,
  GeoFlag,
  GeoHazardContext,
  StoppageAction,
  TriggeredRule,
  WeatherContext,
} from "./types";

const LEVEL_ORDER: Record<AlertLevel, number> = { INFO: 0, WARN: 1, STOP: 2, EVAC: 3 };

export function maxLevel(levels: AlertLevel[]): AlertLevel {
  return levels.reduce<AlertLevel>(
    (acc, l) => (LEVEL_ORDER[l] > LEVEL_ORDER[acc] ? l : acc),
    "INFO",
  );
}

/** 분류(중공종/세부항목/대공종) → 룰 적용 공종 키 매핑 */
export function tradeFromClassification(input: {
  major_type?: string | null;
  sub_type?: string | null;
  detail_item?: string | null;
}): string {
  const blob = `${input.major_type ?? ""} ${input.sub_type ?? ""} ${input.detail_item ?? ""}`;
  if (/타워크레인/.test(blob)) return "타워크레인";
  if (/이동식\s*크레인|크롤러|카고크레인/.test(blob)) return "이동식크레인";
  if (/철골|볼팅|데크/.test(blob)) return "철골";
  if (/콘크리트|타설|양생/.test(blob)) return "콘크리트타설";
  if (/굴착|흙막이|터파기|토공/.test(blob)) return "굴착흙막이";
  if (/도장|페인트/.test(blob)) return "도장";
  if (/용접|용단/.test(blob)) return "용접";
  if (/비계|고소|옥상|곤돌라|달비계/.test(blob)) return "고소작업";
  if (/포장|도로/.test(blob)) return "도로포장";
  return "일반";
}

interface RuleDef {
  rule_id: string;
  trades: string[]; // 적용 공종 ("*"=전체)
  test: (w: WeatherContext) => { observed: number; threshold: number } | null;
  trade_label: string;
  legal_ref: string;
  action: StoppageAction;
  level: AlertLevel;
  message: (o: number) => string;
}

const RULES: RuleDef[] = [
  {
    rule_id: "WIND_TC_ERECT_10",
    trades: ["타워크레인"],
    test: (w) => (w.gust_ms > 10 ? { observed: w.gust_ms, threshold: 10 } : null),
    trade_label: "타워크레인 설치·해체",
    legal_ref: "산업안전보건기준에 관한 규칙 §37②",
    action: "STOP",
    level: "STOP",
    message: (o) => `순간풍속 ${o.toFixed(1)}m/s — 10m/s 초과로 타워크레인 설치·수리·점검·해체 작업을 중지해야 합니다.`,
  },
  {
    rule_id: "WIND_TC_OP_15",
    trades: ["타워크레인"],
    test: (w) => (w.gust_ms > 15 ? { observed: w.gust_ms, threshold: 15 } : null),
    trade_label: "타워크레인 운전",
    legal_ref: "산업안전보건기준에 관한 규칙 §37②",
    action: "STOP",
    level: "STOP",
    message: (o) => `순간풍속 ${o.toFixed(1)}m/s — 15m/s 초과로 타워크레인 운전작업을 중지해야 합니다.`,
  },
  {
    rule_id: "WIND_STEEL_10",
    trades: ["철골"],
    test: (w) => (w.wind_ms >= 10 ? { observed: w.wind_ms, threshold: 10 } : null),
    trade_label: "철골작업",
    legal_ref: "산업안전보건기준에 관한 규칙 §383",
    action: "STOP",
    level: "STOP",
    message: (o) => `풍속 ${o.toFixed(1)}m/s — 10m/s 이상으로 철골작업을 중지해야 합니다.`,
  },
  {
    rule_id: "WIND_MC_STOP_18",
    trades: ["이동식크레인"],
    test: (w) => (w.gust_ms >= 18 ? { observed: w.gust_ms, threshold: 18 } : null),
    trade_label: "이동식크레인",
    legal_ref: "KOSHA GUIDE C-99-2015",
    action: "STOP",
    level: "STOP",
    message: (o) => `순간풍속 ${o.toFixed(1)}m/s — 18m/s 이상으로 이동식크레인 작업을 중지해야 합니다.`,
  },
  {
    rule_id: "WIND_MC_DERATE_5",
    trades: ["이동식크레인"],
    test: (w) =>
      w.wind_ms >= 5 && w.wind_ms < 10 ? { observed: w.wind_ms, threshold: 5 } : null,
    trade_label: "이동식크레인 양중",
    legal_ref: "KOSHA GUIDE C-99-2015",
    action: "DERATE_20",
    level: "WARN",
    message: (o) => `풍속 ${o.toFixed(1)}m/s — 5m/s 이상으로 정격하중에서 20%를 감하여 양중해야 합니다.`,
  },
  {
    rule_id: "WIND_OUTCRANE_30",
    trades: ["타워크레인", "이동식크레인"],
    test: (w) => (w.gust_ms > 30 ? { observed: w.gust_ms, threshold: 30 } : null),
    trade_label: "옥외 양중기",
    legal_ref: "산업안전보건기준에 관한 규칙 §140·§143",
    action: "ANCHOR_CHECK",
    level: "EVAC",
    message: (o) => `순간풍속 ${o.toFixed(1)}m/s — 30m/s 초과. 이탈방지장치 작동 확인 및 인원 대피가 필요합니다.`,
  },
  {
    rule_id: "RAIN_STEEL_1",
    trades: ["철골"],
    test: (w) => (w.rain_mm_1h >= 1 ? { observed: w.rain_mm_1h, threshold: 1 } : null),
    trade_label: "철골작업",
    legal_ref: "산업안전보건기준에 관한 규칙 §383",
    action: "STOP",
    level: "STOP",
    message: (o) => `시간당 강우 ${o.toFixed(1)}mm — 1mm 이상으로 철골작업을 중지해야 합니다.`,
  },
  {
    rule_id: "SNOW_STEEL_1",
    trades: ["철골"],
    test: (w) => (w.snow_cm_1h >= 1 ? { observed: w.snow_cm_1h, threshold: 1 } : null),
    trade_label: "철골작업",
    legal_ref: "산업안전보건기준에 관한 규칙 §383",
    action: "STOP",
    level: "STOP",
    message: (o) => `시간당 강설 ${o.toFixed(1)}cm — 1cm 이상으로 철골작업을 중지해야 합니다.`,
  },
  {
    rule_id: "RAIN_CONCRETE",
    trades: ["콘크리트타설"],
    test: (w) => (w.rain_mm_1h > 0 || w.pty === "비" || w.pty === "소나기" ? { observed: w.rain_mm_1h, threshold: 0 } : null),
    trade_label: "콘크리트 타설",
    legal_ref: "국토교통부 콘크리트 타설 가이드(2024.12)",
    action: "RESTRICT",
    level: "WARN",
    message: (o) => `강우 중(${o.toFixed(1)}mm/h) — 콘크리트 타설은 원칙적으로 금지이며, 불가피 시 별도 계획서·승인이 필요합니다.`,
  },
  {
    rule_id: "RAIN_EXCAVATION",
    trades: ["굴착흙막이"],
    test: (w) => (w.rain_mm_1h >= 3 ? { observed: w.rain_mm_1h, threshold: 3 } : null),
    trade_label: "굴착·흙막이",
    legal_ref: "산업안전보건기준에 관한 규칙 §338(붕괴 방지)",
    action: "STOP",
    level: "STOP",
    message: (o) => `시간당 강우 ${o.toFixed(1)}mm — 굴착면 붕괴·침수 위험이 높아 작업중지를 검토해야 합니다.`,
  },
  // 폭염 (체감온도 기준, 전 공종)
  {
    rule_id: "HEAT_38",
    trades: ["*"],
    test: (w) => (w.apparent_temp_c >= 38 ? { observed: w.apparent_temp_c, threshold: 38 } : null),
    trade_label: "옥외작업 전반",
    legal_ref: "고용노동부 폭염 지침(권고)",
    action: "STOP_OUTDOOR",
    level: "STOP",
    message: (o) => `체감온도 ${o.toFixed(1)}℃ — 38℃ 이상. 긴급조치 외 옥외작업 중지를 권고합니다.`,
  },
  {
    rule_id: "HEAT_35",
    trades: ["*"],
    test: (w) =>
      w.apparent_temp_c >= 35 && w.apparent_temp_c < 38
        ? { observed: w.apparent_temp_c, threshold: 35 }
        : null,
    trade_label: "옥외작업 전반",
    legal_ref: "고용노동부 폭염 지침(권고)",
    action: "STOP_1417",
    level: "WARN",
    message: (o) => `체감온도 ${o.toFixed(1)}℃ — 35℃ 이상. 14~17시 옥외작업 중지를 권고합니다.`,
  },
  {
    rule_id: "HEAT_33",
    trades: ["*"],
    test: (w) =>
      w.apparent_temp_c >= 33 && w.apparent_temp_c < 35
        ? { observed: w.apparent_temp_c, threshold: 33 }
        : null,
    trade_label: "폭염작업 전반",
    legal_ref: "산업안전보건기준에 관한 규칙 §560③",
    action: "REST_20PER2H",
    level: "WARN",
    message: (o) => `체감온도 ${o.toFixed(1)}℃ — 33℃ 이상. 매 2시간 이내 20분 이상 휴식이 의무입니다.`,
  },
  {
    rule_id: "HEAT_31",
    trades: ["*"],
    test: (w) =>
      w.apparent_temp_c >= 31 && w.apparent_temp_c < 33
        ? { observed: w.apparent_temp_c, threshold: 31 }
        : null,
    trade_label: "폭염작업 전반",
    legal_ref: "산업안전보건기준에 관한 규칙 §559·560",
    action: "COOL_REST",
    level: "INFO",
    message: (o) => `체감온도 ${o.toFixed(1)}℃ — 31℃ 이상. 냉방·통풍, 작업시간 조정, 휴식 중 하나 이상 조치가 필요합니다.`,
  },
  {
    rule_id: "LIGHTNING",
    trades: ["고소작업", "타워크레인", "이동식크레인", "철골", "용접"],
    test: (w) => (w.lightning ? { observed: 1, threshold: 1 } : null),
    trade_label: "고소·양중·철골·용접",
    legal_ref: "KOSHA 낙뢰 안전 가이드",
    action: "STOP",
    level: "STOP",
    message: () => `낙뢰가 관측/임박했습니다. 고소·양중·철골·용접 작업을 중지하고 안전한 곳으로 대피하세요.`,
  },
];

/** 룰엔진 실행 — 공종 + 기상 → 발동 룰 */
export function evaluateWeatherRules(trade: string, w: WeatherContext): TriggeredRule[] {
  const fired: TriggeredRule[] = [];
  for (const r of RULES) {
    if (!r.trades.includes("*") && !r.trades.includes(trade)) continue;
    const hit = r.test(w);
    if (!hit) continue;
    fired.push({
      rule_id: r.rule_id,
      condition: `${r.trade_label}: ${hit.observed.toFixed(1)} (임계 ${hit.threshold})`,
      threshold: hit.threshold,
      observed: hit.observed,
      trade: r.trade_label,
      legal_ref: r.legal_ref,
      action: r.action,
      level: r.level,
      message: r.message(hit.observed),
    });
  }
  // 같은 공종에 중복(예 타워크레인 10/15) 발동 시 더 강한 것만 노출하도록 정렬
  return fired.sort((a, b) => LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level]);
}

/** 지형 재해 컨텍스트 → 위험 플래그 (공종 가중) */
export function evaluateGeoFlags(trade: string, g: GeoHazardContext): GeoFlag[] {
  const flags: GeoFlag[] = [];
  if (g.landslide_grade >= 3 && /굴착흙막이|고소작업|일반/.test(trade)) {
    flags.push({
      layer: "산사태위험지도",
      level: g.landslide_grade >= 4 ? "STOP" : "WARN",
      message: `산사태 위험 ${g.landslide_grade}등급 지역입니다. 사면·절토부 토사붕괴에 주의하고 강우 시 작업을 재검토하세요.`,
      source_note: "산림청 산사태정보시스템(데모 데이터)",
    });
  }
  if (g.flood_risk === "주의" || g.flood_risk === "위험") {
    flags.push({
      layer: "홍수위험지도",
      level: g.flood_risk === "위험" ? "STOP" : "WARN",
      message: `침수 ${g.flood_risk} 구역입니다. 지하·저지대 작업 시 침수·수몰에 대비하세요.`,
      source_note: "환경부 홍수위험지도(데모 데이터)",
    });
  }
  if (g.underground_utilities.length > 0 && /굴착흙막이/.test(trade)) {
    flags.push({
      layer: "지하공간통합지도",
      level: "WARN",
      message: `지하매설물(${g.underground_utilities.join(", ")})이 인접합니다. 굴착·천공 전 위치 확인 및 손상 방지 조치가 필요합니다.`,
      source_note: "지하공간통합지도/JIS(데모 데이터)",
    });
  }
  if (g.soft_ground && /굴착흙막이/.test(trade)) {
    flags.push({
      layer: "국토지반정보",
      level: "WARN",
      message: `연약지반 구간입니다. 흙막이 지보공 계측관리와 지반 보강을 강화하세요.`,
      source_note: "국토지반정보 시추공(데모 데이터)",
    });
  }
  if (g.near_high_voltage && /타워크레인|이동식크레인|고소작업/.test(trade)) {
    flags.push({
      layer: "고압선 인접",
      level: "WARN",
      message: `고압선이 인접합니다. 양중·고소작업 시 이격거리 확보 및 감전 방지 조치가 필요합니다.`,
      source_note: "V-World 주제도(데모 데이터)",
    });
  }
  return flags;
}

/** 동적 위험 종합 — 룰 + 지형 + 권고 + 폭염 휴식 + 승인필요 */
export function buildDynamicRisk(
  trade: string,
  weather: WeatherContext,
  geo: GeoHazardContext,
): DynamicRiskResult {
  const triggered = evaluateWeatherRules(trade, weather);
  const geoFlags = evaluateGeoFlags(trade, geo);

  const levels: AlertLevel[] = [
    ...triggered.map((t) => t.level),
    ...geoFlags.map((f) => f.level),
  ];
  const overall = levels.length ? maxLevel(levels) : "INFO";

  const recommendations = new Set<string>();
  triggered.forEach((t) => recommendations.add(t.message));
  geoFlags.forEach((f) => recommendations.add(f.message));
  if (recommendations.size === 0) {
    recommendations.add("현재 기상·지형 조건에서 추가 작업중지 사유는 없습니다. 정기 점검을 유지하세요.");
  }

  const heat33 = triggered.find((t) => t.rule_id === "HEAT_33" || t.rule_id === "HEAT_35" || t.rule_id === "HEAT_38");
  const heatRest = heat33
    ? { required: true, rule: "산업안전보건기준에 관한 규칙 §560③", cycle_min: 120, rest_min: 20 }
    : undefined;

  // STOP 이상이거나 폭염 의무 휴식이면 현장소장 승인 필요 (Human-in-the-loop)
  const approvalRequired =
    LEVEL_ORDER[overall] >= LEVEL_ORDER["STOP"] || !!heatRest;

  return {
    weather,
    geo,
    trade,
    triggered_rules: triggered,
    geo_flags: geoFlags,
    overall_level: overall,
    recommendations: Array.from(recommendations),
    human_approval_required: approvalRequired,
    heat_rest: heatRest,
    is_mock: weather.source === "mock" || geo.source === "mock",
  };
}
