import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AppProviders } from "@/components/AppProviders";
import KbAdminPage from "@/app/admin/kb/page";

/**
 * KB 관리 화면 — RoleGate 차단 + 편집 다이얼로그 등급 미리보기 + 삭제 확인.
 * api는 kbMock 경유로 실제 in-memory 시뮬레이션을 사용(USE_MOCK 분기는 빌드 env에
 * 의존하므로, 테스트에서는 api 모듈을 kbMock로 직접 매핑한다).
 */
vi.mock("@/lib/api", async () => {
  const kb = await import("@/lib/kbMock");
  return {
    listKbRows: kb.listKbRows,
    getKbRow: kb.getKbRow,
    createKbRow: kb.createKbRow,
    updateKbRow: kb.updateKbRow,
    deleteKbRow: kb.deleteKbRow,
    kbStats: kb.kbStats,
    kbReindex: kb.kbReindex,
  };
});

import { _resetKbMock } from "@/lib/kbMock";

function renderPage() {
  return render(
    <AppProviders>
      <KbAdminPage />
    </AppProviders>,
  );
}

describe("KB 관리 화면", () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetKbMock();
  });

  it("worker 역할은 접근 거부 안내(RoleGate 차단)를 본다", () => {
    window.localStorage.setItem("jha_role", "worker");
    renderPage();
    expect(screen.getByTestId("kb-forbidden")).toBeInTheDocument();
    expect(screen.queryByTestId("reindex-widget")).not.toBeInTheDocument();
  });

  it("safety_manager는 목록·재인덱싱 위젯을 본다", async () => {
    window.localStorage.setItem("jha_role", "safety_manager");
    renderPage();
    expect(screen.getByTestId("reindex-widget")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("kb-row").length).toBeGreaterThan(0));
  });

  it("편집 다이얼로그: 강도×빈도 변경 시 등급 미리보기가 갱신된다", async () => {
    window.localStorage.setItem("jha_role", "safety_manager");
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("kb-row").length).toBeGreaterThan(0));

    // 신규 행 다이얼로그 열기(편집 폼과 동일)
    fireEvent.click(screen.getByTestId("kb-new"));
    const preview = await screen.findByTestId("grade-preview");

    // 강도5 × 빈도4 = 20 → 상
    fireEvent.change(screen.getByTestId("kb-severity"), { target: { value: "5" } });
    fireEvent.change(screen.getByTestId("kb-frequency"), { target: { value: "4" } });
    await waitFor(() => expect(preview.textContent).toContain("상"));
    expect(preview.textContent).toContain("20");

    // 강도4 × 빈도4 = 16 → 경계셀 안내
    fireEvent.change(screen.getByTestId("kb-severity"), { target: { value: "4" } });
    await waitFor(() => expect(preview.textContent).toContain("경계셀"));
  });

  it("삭제 확인 다이얼로그는 소프트 삭제 안내를 표시한다", async () => {
    window.localStorage.setItem("jha_role", "safety_manager");
    renderPage();
    await waitFor(() => expect(screen.getAllByTestId("kb-row").length).toBeGreaterThan(0));

    const delButtons = screen.getAllByText("삭제");
    fireEvent.click(delButtons[0]);
    const dialog = await screen.findByTestId("kb-delete-dialog");
    expect(dialog.textContent).toContain("소프트 삭제");
    expect(dialog.textContent).toContain("복구");
    expect(screen.getByTestId("kb-delete-confirm")).toBeInTheDocument();
  });
});
