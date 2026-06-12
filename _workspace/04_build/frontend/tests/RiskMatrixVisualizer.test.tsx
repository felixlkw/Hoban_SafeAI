import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RiskMatrixVisualizer } from "@/components/RiskMatrixVisualizer";

describe("RiskMatrixVisualizer", () => {
  it("5×5 = 25개 셀을 렌더링한다", () => {
    render(<RiskMatrixVisualizer />);
    expect(screen.getAllByRole("gridcell")).toHaveLength(25);
  });

  it("각 셀 aria-label에 등급과 곱셈값을 텍스트로 제공한다(색상만 의존 금지)", () => {
    render(<RiskMatrixVisualizer />);
    // 강도5 빈도5 = 25, 상
    expect(
      screen.getByRole("gridcell", { name: /강도5 빈도5, 등급 상, 곱 25/ }),
    ).toBeInTheDocument();
    // 강도1 빈도1 = 1, 하
    expect(
      screen.getByRole("gridcell", { name: /강도1 빈도1, 등급 하, 곱 1/ }),
    ).toBeInTheDocument();
  });

  it("경계셀(4×4=16)을 라벨에 명시한다", () => {
    render(<RiskMatrixVisualizer />);
    expect(
      screen.getByRole("gridcell", { name: /강도4 빈도4.*경계셀/ }),
    ).toBeInTheDocument();
  });

  it("현재 위험요인 셀을 강조 표기한다", () => {
    render(<RiskMatrixVisualizer severity={4} frequency={4} />);
    expect(
      screen.getByRole("gridcell", { name: /강도4 빈도4.*현재 위험요인/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/현재 강도 4 × 빈도 4 = 16/)).toBeInTheDocument();
  });

  it("범례에 상/중/하 의미를 텍스트로 표기한다", () => {
    render(<RiskMatrixVisualizer />);
    expect(screen.getByText(/즉시 개선 필요/)).toBeInTheDocument();
    expect(screen.getByText(/경계셀 \(4×4=16/)).toBeInTheDocument();
  });
});
