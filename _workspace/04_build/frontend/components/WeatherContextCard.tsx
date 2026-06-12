"use client";

import { WeatherContext } from "@/lib/types";

/**
 * 실시간 기상 컨텍스트 카드 — 현장 격자 기준 기온/체감/풍속/강수 + 특보.
 * 데이터 출처(목업/실API)를 배지로 명시.
 */

export function WeatherContextCard({ weather }: { weather: WeatherContext }) {
  const w = weather;
  const items = [
    { label: "기온", value: `${w.temp_c.toFixed(0)}℃`, sub: `체감 ${w.apparent_temp_c.toFixed(0)}℃`, hot: w.apparent_temp_c >= 31 },
    { label: "풍속", value: `${w.wind_ms.toFixed(1)}m/s`, sub: `순간 ${w.gust_ms.toFixed(1)}m/s`, hot: w.gust_ms >= 10 },
    { label: "강수", value: `${w.rain_mm_1h.toFixed(1)}mm/h`, sub: w.pty, hot: w.rain_mm_1h >= 1 },
    { label: "습도", value: `${w.humidity_pct}%`, sub: w.lightning ? "낙뢰 ⚡" : `미세먼지 ${w.pm10 ?? "-"}`, hot: w.lightning },
  ];

  return (
    <section aria-label="실시간 기상" className="surface rounded-lg border p-4" data-testid="weather-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-base font-bold">
          <span aria-hidden>🌦</span> 실시간 기상 · {w.region_name}
        </h3>
        <span
          className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-muted"
          title={`기상청 격자 nx=${w.grid_nx}, ny=${w.grid_ny}`}
        >
          {w.source === "mock" ? "데모 데이터" : "기상청 실시간"} · 격자 {w.grid_nx},{w.grid_ny}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((it) => (
          <div
            key={it.label}
            className={`rounded-md border p-2 ${it.hot ? "border-[#F59E0B] bg-[#FFFBEB]" : "surface"}`}
          >
            <dt className="text-xs text-muted">{it.label}</dt>
            <dd className={`text-lg font-bold ${it.hot ? "text-[#B45309]" : ""}`}>{it.value}</dd>
            <dd className="text-[11px] text-muted">{it.sub}</dd>
          </div>
        ))}
      </dl>

      {w.warnings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {w.warnings.map((warn) => (
            <span
              key={warn.code}
              className="inline-flex items-center gap-1 rounded-md bg-[#DC2626] px-2 py-1 text-xs font-bold text-white"
              aria-label={`기상특보 ${warn.label} ${warn.level}`}
            >
              <span aria-hidden>📢</span>
              {warn.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
