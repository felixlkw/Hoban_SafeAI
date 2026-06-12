import { describe, it, expect } from "vitest";
import { panelAlertFor } from "@/lib/panelAlert";

describe("panelAlertFor — 상시 경보 띠 산출", () => {
  it("평온(calm) + 일반 공종 → INFO, 작업중지 룰 없음", () => {
    const a = panelAlertFor("calm", "일반");
    expect(a.level).toBe("INFO");
    expect(a.ruleCount).toBe(0);
    expect(a.headline).toContain("작업중지 경보 없음");
  });

  it("강풍(windy) + 타워크레인 → STOP (순간풍속 10/15 초과)", () => {
    const a = panelAlertFor("windy", "타워크레인");
    expect(a.level).toBe("STOP");
    expect(a.ruleCount).toBeGreaterThan(0);
    expect(a.headline).toMatch(/타워크레인/);
  });

  it("폭염(heatwave)은 전 공종 공통 룰 → 일반 공종에서도 경보가 잡힌다", () => {
    const a = panelAlertFor("heatwave", "일반");
    // 체감 35.6℃ → WARN(14~17시 중지) 이상
    expect(["WARN", "STOP"]).toContain(a.level);
    expect(a.headline).toContain("폭염경보");
  });

  it("태풍·낙뢰(storm) + 타워크레인 → EVAC(30m/s 초과)", () => {
    const a = panelAlertFor("storm", "타워크레인");
    expect(a.level).toBe("EVAC");
  });

  it("scenario 미지정(undefined)은 calm으로 취급 → INFO", () => {
    const a = panelAlertFor(undefined, "타워크레인");
    expect(a.level).toBe("INFO");
  });
});
