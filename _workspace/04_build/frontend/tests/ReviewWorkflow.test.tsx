import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReviewWorkflow, FinalizeGate } from "@/components/ReviewWorkflow";

describe("ReviewWorkflow", () => {
  it("현재 단계 진행률을 progressbar로 표시한다", () => {
    render(<ReviewWorkflow current="assess" />);
    // assess = 3/4 단계 → 75%
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("현재 단계에 aria-current=step를 부여한다", () => {
    render(<ReviewWorkflow current="classify" />);
    const current = screen.getByText("분류 검토");
    expect(current).toHaveAttribute("aria-current", "step");
  });
});

describe("FinalizeGate", () => {
  it("차단 사유가 있으면 등록 버튼을 비활성화하고 사유를 나열한다", () => {
    render(
      <FinalizeGate
        blockingReasons={["경계셀 확정 필요", "안전관리자 검토 필요"]}
        onFinalize={() => {}}
      />,
    );
    expect(screen.getByTestId("finalize-button")).toBeDisabled();
    expect(screen.getByText("경계셀 확정 필요")).toBeInTheDocument();
    expect(screen.getByText("안전관리자 검토 필요")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("차단 사유가 없으면 등록 버튼을 활성화하고 클릭 시 콜백을 호출한다", async () => {
    const user = userEvent.setup();
    const onFinalize = vi.fn();
    render(<FinalizeGate blockingReasons={[]} onFinalize={onFinalize} />);
    const btn = screen.getByTestId("finalize-button");
    expect(btn).toBeEnabled();
    await user.click(btn);
    expect(onFinalize).toHaveBeenCalledOnce();
  });

  it("finalizing 중에는 버튼을 비활성화한다", () => {
    render(<FinalizeGate blockingReasons={[]} onFinalize={() => {}} finalizing />);
    expect(screen.getByTestId("finalize-button")).toBeDisabled();
    expect(screen.getByText(/등록 처리 중/)).toBeInTheDocument();
  });
});
