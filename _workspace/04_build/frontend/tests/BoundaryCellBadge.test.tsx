import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoundaryCellBadge } from "@/components/BoundaryCellBadge";

describe("BoundaryCellBadge", () => {
  it("grade 모드: 등급 + (잠정) 텍스트를 표시한다", () => {
    render(<BoundaryCellBadge mode="grade" grade="상" />);
    const badge = screen.getByTestId("boundary-badge");
    expect(badge).toHaveTextContent("상");
    expect(badge).toHaveTextContent("(잠정)");
  });

  it("register 모드: 기호 + (잠정) 텍스트를 표시한다", () => {
    render(<BoundaryCellBadge mode="register" symbol="O" />);
    const badge = screen.getByTestId("boundary-badge");
    expect(badge).toHaveTextContent("O");
    expect(badge).toHaveTextContent("(잠정)");
  });

  it("색상만이 아닌 텍스트 보조: aria-label에 '잠정'과 '확정 필요'가 포함된다", () => {
    render(<BoundaryCellBadge mode="grade" grade="중" />);
    const badge = screen.getByRole("status");
    const label = badge.getAttribute("aria-label") || "";
    expect(label).toContain("잠정");
    expect(label).toContain("확정");
  });

  it("아이콘(⚠)을 함께 표시한다 (비색상 표식)", () => {
    render(<BoundaryCellBadge mode="grade" grade="상" />);
    expect(screen.getByTestId("boundary-badge")).toHaveTextContent("⚠");
  });

  it("register 모드 aria-label은 '중점등록'을 쓰고 '중대재해 등록' 오용을 쓰지 않는다 (P0-③)", () => {
    render(<BoundaryCellBadge mode="register" symbol="O" />);
    const label = screen.getByRole("status").getAttribute("aria-label") || "";
    expect(label).toContain("중점등록");
    expect(label).not.toContain("중대재해");
  });
});
