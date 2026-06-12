import { describe, it, expect } from "vitest";
import { computeGradePreview } from "@/lib/types";

/**
 * 등급·중점등록 미리보기 — 서버 재계산 규칙(하≤9/중10~15/상≥16, 상⇔O, 곱16 경계셀)과
 * 클라이언트 미리보기가 일치하는지 검증.
 */
describe("computeGradePreview (등급 미리보기 = 서버 규칙)", () => {
  it("곱 ≤ 9 → 하 · 중점등록 X", () => {
    const p = computeGradePreview(3, 3); // 9
    expect(p.grade).toBe("하");
    expect(p.criticalRegister).toBe("X");
    expect(p.boundaryCell).toBe(false);
  });

  it("곱 10~15 → 중 · 중점등록 X", () => {
    expect(computeGradePreview(3, 5).grade).toBe("중"); // 15
    expect(computeGradePreview(5, 2).grade).toBe("중"); // 10
    expect(computeGradePreview(3, 5).criticalRegister).toBe("X");
  });

  it("곱 ≥ 16 → 상 · 중점등록 O (비경계셀)", () => {
    const p = computeGradePreview(5, 4); // 20
    expect(p.grade).toBe("상");
    expect(p.criticalRegister).toBe("O");
    expect(p.boundaryCell).toBe(false);
  });

  it("강도4 × 빈도4 = 16 → 경계셀(잠정 상). 라벨에 '경계셀' 안내 포함", () => {
    const p = computeGradePreview(4, 4);
    expect(p.boundaryCell).toBe(true);
    expect(p.grade).toBe("상");
    expect(p.label).toContain("경계셀");
    expect(p.label).toContain("16");
  });

  it("경계셀 중점등록은 입력(O/X)을 존중한다", () => {
    expect(computeGradePreview(4, 4, "X").criticalRegister).toBe("X");
    expect(computeGradePreview(4, 4, "O").criticalRegister).toBe("O");
    // 미지정 시 잠정 O
    expect(computeGradePreview(4, 4).criticalRegister).toBe("O");
  });
});
