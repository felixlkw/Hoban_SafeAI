import { describe, it, expect } from "vitest";
import { assess, legalRefMeta } from "@/lib/mock";

/**
 * P1-1 법적 인용 보강 — safety_legal_citation_matrix.md 기준 재해형태별 필수 조문 반영.
 *  - 추락: §42·§43·§44 / 낙하: §14·§15·§20 / 협착: §20·§87·§142
 */
describe("mock hazard legal_refs (P1-1)", () => {
  it("타워크레인 시나리오의 모든 위험요인에 legal_refs가 채워진다", async () => {
    const r = await assess("mock-tower-legal");
    // detectScenario 기본은 tower
    expect(r.hazards.length).toBeGreaterThan(0);
    for (const h of r.hazards) {
      expect(h.legal_refs && h.legal_refs.length).toBeGreaterThan(0);
    }
  });

  it("추락 위험요인은 §42·§43·§44를 포함한다", async () => {
    const r = await assess("mock-tower-fall");
    const fall = r.hazards.find((h) => h.accident_type === "추락")!;
    const joined = (fall.legal_refs ?? []).join(" ");
    expect(joined).toContain("§42");
    expect(joined).toContain("§43");
    expect(joined).toContain("§44");
  });

  it("협착 위험요인은 §20·§87·§142를 포함한다 (이전 빈 배열 보강)", async () => {
    const r = await assess("mock-tower-pinch");
    const pinch = r.hazards.find((h) => h.accident_type === "협착")!;
    const joined = (pinch.legal_refs ?? []).join(" ");
    expect(joined).toContain("§20");
    expect(joined).toContain("§87");
    expect(joined).toContain("§142");
  });
});

describe("legalRefMeta — 시행규칙 §43 분기 (중점등록 vs 개구부)", () => {
  it("시행규칙 §43은 중점관리 작업계획서로 해석한다", () => {
    const m = legalRefMeta("산업안전보건법 시행규칙 §43");
    expect(m?.lawName).toContain("시행규칙");
    expect(m?.articleTitle).toContain("작업계획서");
  });

  it("안전보건규칙 §43은 개구부 방호로 해석한다", () => {
    const m = legalRefMeta("산업안전보건기준에 관한 규칙 §43");
    expect(m?.articleTitle).toContain("개구부");
  });
});
