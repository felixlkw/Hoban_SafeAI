import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErpRegistrationStatus } from "@/components/ErpRegistrationStatus";

describe("ErpRegistrationStatus", () => {
  it("pending: 큐 순번을 표시하고 재시도 버튼은 없다", () => {
    render(<ErpRegistrationStatus erp={{ status: "pending", erp_id: null, queue_position: 2 }} />);
    expect(screen.getByTestId("erp-status")).toHaveAttribute("data-erp-status", "pending");
    expect(screen.getByText(/대기 순번/)).toBeInTheDocument();
    expect(screen.queryByTestId("erp-retry")).not.toBeInTheDocument();
  });

  it("success: ERP 등록번호를 표시한다", () => {
    render(<ErpRegistrationStatus erp={{ status: "success", erp_id: "JHA-2026-ABC123" }} />);
    expect(screen.getByText("JHA-2026-ABC123")).toBeInTheDocument();
    expect(screen.getByText(/등록 완료/)).toBeInTheDocument();
  });

  it("failed: 사유·시도횟수를 한국어로 안내하고 재시도 버튼을 노출한다", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ErpRegistrationStatus
        erp={{ status: "failed", erp_id: null, attempts: 2, last_error: "ERP 타임아웃" }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByText(/등록에 실패했습니다/)).toBeInTheDocument();
    expect(screen.getByText(/ERP 타임아웃/)).toBeInTheDocument();
    await user.click(screen.getByTestId("erp-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("session_expired: 자동 저장·재로그인 안내를 표시한다", () => {
    render(<ErpRegistrationStatus erp={{ status: "session_expired", erp_id: null }} onRetry={() => {}} />);
    expect(screen.getByRole("heading", { name: /세션이 만료/ })).toBeInTheDocument();
    expect(screen.getByText(/자동 저장/)).toBeInTheDocument();
  });
});
