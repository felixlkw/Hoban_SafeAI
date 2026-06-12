import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RefuseNotice } from "@/components/RefuseNotice";

describe("RefuseNotice", () => {
  it("partial 모드: 일부 평가 안내 + 미평가 영역 목록을 표시한다", () => {
    render(<RefuseNotice mode="partial" gapAreas={["질식(밀폐공간)"]} />);
    expect(screen.getByTestId("refuse-notice")).toHaveAttribute("data-mode", "partial");
    expect(screen.getByText(/일부 위험요인만 자동 평가/)).toBeInTheDocument();
    expect(screen.getByText("질식(밀폐공간)")).toBeInTheDocument();
  });

  it("full 모드: 자동 평가 미제공 안내를 표시한다", () => {
    render(<RefuseNotice mode="full" />);
    expect(screen.getByTestId("refuse-notice")).toHaveAttribute("data-mode", "full");
    expect(screen.getByText(/자동 평가를 제공하지 않습니다/)).toBeInTheDocument();
  });

  it("담당자 연락처(다음 행동 안내)를 항상 표시한다", () => {
    render(<RefuseNotice mode="full" contact="안전보건팀 내선 9999" />);
    expect(screen.getByText(/안전보건팀 내선 9999/)).toBeInTheDocument();
  });

  it("role=alert 로 스크린리더에 즉시 알린다", () => {
    render(<RefuseNotice mode="partial" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("백엔드 warnings 메시지를 함께 노출한다", () => {
    render(<RefuseNotice mode="partial" warnings={["산소측정 대책 미생성"]} />);
    expect(screen.getByText(/산소측정 대책 미생성/)).toBeInTheDocument();
  });
});
