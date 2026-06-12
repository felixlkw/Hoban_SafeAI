import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { HobanLogo, HobanSymbol, HobanFullLogo } from "@/components/HobanLogo";

describe("HobanLogo (공식 CI 기반)", () => {
  it("심볼은 호반 CI 2블럭(오렌지/그레이)을 렌더한다", () => {
    const { container } = render(<HobanSymbol />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBe(2);
    const fills = Array.from(rects).map((r) => r.getAttribute("fill"));
    expect(fills).toContain("#ED6C00"); // HOBAN Orange (공식)
    expect(fills).toContain("#898A8D"); // HOBAN Gray (공식)
  });

  it("로고 심볼에 접근성 라벨이 있다", () => {
    render(<HobanLogo variant="symbol" />);
    expect(screen.getByRole("img", { name: "호반 로고" })).toBeInTheDocument();
  });

  it("풀 로고는 HOBAN 공식 워드마크(path)와 접근성 라벨을 가진다", () => {
    const { container } = render(<HobanFullLogo />);
    expect(screen.getByRole("img", { name: "호반(HOBAN)" })).toBeInTheDocument();
    // 2블럭 심볼 + HOBAN 워드마크 path
    expect(container.querySelectorAll("rect").length).toBe(2);
    expect(container.querySelector("path")).toBeInTheDocument();
  });

  it("wordmark variant는 공식 로고 + JHA 서브브랜드를 표시한다", () => {
    render(<HobanLogo variant="wordmark" />);
    expect(screen.getByRole("img", { name: "호반(HOBAN)" })).toBeInTheDocument();
    expect(screen.getByText("JHA")).toBeInTheDocument();
  });
});
