import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppProviders, RoleGate } from "@/components/AppProviders";

/**
 * P0-④ RoleGate — worker는 확정·등록 액션 차단, safety_manager/admin만 허용.
 * AppProviders 기본 역할은 worker(localStorage 미설정 시).
 */
describe("RoleGate (P0-④)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  function renderGate() {
    return render(
      <AppProviders>
        <RoleGate allow={["safety_manager", "admin"]} fallback={<div>검토 요청 대체</div>}>
          <div>확정·등록 영역</div>
        </RoleGate>
      </AppProviders>,
    );
  }

  it("기본 역할(worker)에서는 fallback(검토 요청)만 보인다", () => {
    renderGate(); // localStorage 미설정 → worker
    expect(screen.queryByText("확정·등록 영역")).not.toBeInTheDocument();
    expect(screen.getByText("검토 요청 대체")).toBeInTheDocument();
  });

  it("safety_manager 역할에서는 보호된 children이 보인다", () => {
    window.localStorage.setItem("jha_role", "safety_manager");
    renderGate();
    expect(screen.getByText("확정·등록 영역")).toBeInTheDocument();
    expect(screen.queryByText("검토 요청 대체")).not.toBeInTheDocument();
  });

  it("admin 역할도 허용된다", () => {
    window.localStorage.setItem("jha_role", "admin");
    renderGate();
    expect(screen.getByText("확정·등록 영역")).toBeInTheDocument();
  });
});
