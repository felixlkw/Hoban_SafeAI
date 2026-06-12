import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 고대비(High Contrast) 오버라이드 레이어 회귀 가드.
 *
 * 배경: 컴포넌트가 CSS 변수가 아닌 Tailwind 유틸리티(bg-white, text-ink-*,
 *  border-line, bg-brand, bg-[#…])로 색을 하드코딩 → data-contrast="high"에서
 *  변수만 뒤집혀도 이 색들이 그대로 남아 "일부만 반전"되는 어색함이 생겼다.
 *  globals.css의 [data-contrast="high"] 유틸리티 오버라이드 레이어가 이를 일괄
 *  재매핑한다. 이 테스트는 핵심 remap이 사라지지 않도록 보호한다.
 *  (jsdom은 Tailwind를 컴파일하지 않으므로 CSS 소스 단위로 검증.)
 */

const css = readFileSync(resolve(__dirname, "../app/globals.css"), "utf8");

// [data-contrast="high"] 오버라이드 블록만 추출(첫 등장 이후)
const hcStart = css.indexOf('고대비 유틸리티 오버라이드');
const hcBlock = hcStart >= 0 ? css.slice(hcStart) : "";

describe("고대비 유틸리티 오버라이드 레이어 (globals.css)", () => {
  it("오버라이드 레이어가 존재한다", () => {
    expect(hcStart).toBeGreaterThan(0);
    expect(hcBlock).toContain('[data-contrast="high"]');
  });

  it("핵심 약속: 검정 서피스·흰 텍스트·흰 보더·노란 포커스", () => {
    // 포커스 노랑(파일 상단의 기존 규칙)
    expect(css).toMatch(/\[data-contrast="high"\] :focus-visible\s*\{[^}]*#fde047/i);
    // 근검정 서피스
    expect(hcBlock).toMatch(/#0a0a0a/i);
    // 흰 텍스트/보더
    expect(hcBlock).toMatch(/#ffffff/i);
  });

  it.each([
    // 중립 서피스 → 검정 계열로 반전되어야 함
    ".bg-white",
    ".bg-surface",
    ".bg-surface-tint",
    ".bg-surface-sunken",
    // 중립 텍스트
    ".text-ink-900",
    ".text-ink-800",
    ".text-steel-700",
    // 보더/링
    ".border-line",
    ".ring-line",
  ])("중립 유틸리티 %s 가 고대비에서 재매핑된다", (util) => {
    expect(hcBlock).toContain(util);
  });

  it("브랜드 오렌지 CTA는 밝은 변형(#ff8a2a)으로 유지된다", () => {
    expect(hcBlock).toMatch(/#ff8a2a/i);
    // .text-white 보다 우선하도록 이중 클래스 specificity
    expect(hcBlock).toContain(".bg-brand.bg-brand");
  });

  it("위험등급 솔리드 배지(상/중/하)는 흰 윤곽선으로 분리된다", () => {
    // 상/중/하 배지 배경 유틸 셀렉터 존재
    expect(hcBlock).toContain("DC2626"); // 상
    expect(hcBlock).toContain("F97316"); // 중
    expect(hcBlock).toContain("16A34A"); // 하
    expect(hcBlock).toMatch(/box-shadow:\s*inset 0 0 0 1\.5px #fff/i);
  });

  it("라이트 시맨틱 배너는 어두운 틴트로 반전된다(에러 wash 등)", () => {
    expect(hcBlock).toContain("FEF2F2"); // 에러 wash 셀렉터
    // 어두운 틴트 값 존재
    expect(hcBlock).toMatch(/#2a0d0d/i);
  });
});
