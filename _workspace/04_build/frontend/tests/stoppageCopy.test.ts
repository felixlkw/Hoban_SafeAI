import { describe, it, expect } from "vitest";
import { stoppageActionCopy } from "@/lib/tokens";
import { legalRefMeta } from "@/lib/mock";

describe("stoppageActionCopy — 경보 수준별 실제 행위 문구", () => {
  it("STOP은 작업중지 조치 기록 문구를 쓴다", () => {
    const c = stoppageActionCopy("STOP");
    expect(c.buttonLabel).toContain("작업중지 조치 기록");
    expect(c.chatUser).toContain("작업중지 조치를 시행");
  });

  it("EVAC은 대피 지시 완료 문구를 쓴다", () => {
    const c = stoppageActionCopy("EVAC");
    expect(c.buttonLabel).toContain("대피 지시 완료");
    expect(c.chatUser).toContain("대피 지시를 완료");
  });

  it("폭염(WARN+heatRest)은 휴식/보호 조치 문구를 쓴다", () => {
    const c = stoppageActionCopy("WARN", { heatRest: true });
    expect(c.buttonLabel).toContain("휴식/보호 조치 완료");
  });

  it("모든 수준에서 '승인'이 작업 재개 허가로 읽히지 않도록 조치 이행 기록임을 명시한다", () => {
    for (const lvl of ["STOP", "EVAC"]) {
      const c = stoppageActionCopy(lvl);
      expect(c.chatAssistant).toContain("작업 재개 허가가 아니라");
      expect(c.buttonLabel).not.toContain("승인");
      expect(c.doneLabel).not.toContain("승인");
    }
  });
});

describe("legalRefMeta — 법령 전체명·조항명 보강", () => {
  it("§43은 산업안전보건기준에 관한 규칙 제43조로 확장된다", () => {
    const m = legalRefMeta("산업안전보건기준에 관한 규칙 §43");
    expect(m?.lawName).toBe("산업안전보건기준에 관한 규칙");
    expect(m?.article).toBe("제43조");
    expect(m?.articleTitle).toContain("개구부");
  });

  it("짧은 표기 §37도 강풍 작업중지 조항으로 매핑된다", () => {
    const m = legalRefMeta("§37");
    expect(m?.article).toBe("제37조");
    expect(m?.articleTitle).toContain("강풍");
  });

  it("매핑 없는 임의 표기는 null", () => {
    expect(legalRefMeta("§9999")).toBeNull();
  });
});
