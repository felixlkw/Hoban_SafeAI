import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CompanionPanel, PanelAlertStrip, PanelView } from "@/components/chat/CompanionPanel";
import { PanelAlert } from "@/lib/panelAlert";

const infoAlert: PanelAlert = { level: "INFO", headline: "작업중지 경보 없음 · 정상 작업 가능", ruleCount: 0, region: "서울 중구" };
const stopAlert: PanelAlert = { level: "STOP", headline: "타워크레인 설치·해체 — 순간풍속 16.8m/s 초과", ruleCount: 2, region: "서울 중구" };

function setup(view: PanelView, autoView: PanelView, onViewChange = vi.fn()) {
  render(
    <CompanionPanel
      view={view}
      autoView={autoView}
      onViewChange={onViewChange}
      alert={view === "hazards" ? stopAlert : infoAlert}
      sheetOpen={false}
      onSheetClose={vi.fn()}
    >
      <div data-testid="stage-body">{view} 본문</div>
    </CompanionPanel>,
  );
  return { onViewChange };
}

describe("CompanionPanel — 상시 stage 패널", () => {
  it("항상 렌더되고 현재 view를 data-view로 노출(토글 없음)", () => {
    setup("briefing", "briefing");
    const panel = screen.getByTestId("companion-panel");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-view", "briefing");
    expect(screen.getByTestId("stage-body")).toHaveTextContent("briefing 본문");
  });

  it("stage가 바뀌면 콘텐츠가 교체된다(briefing → hazards)", () => {
    const { unmount } = render(
      <CompanionPanel view="briefing" autoView="briefing" onViewChange={vi.fn()} alert={infoAlert} sheetOpen={false} onSheetClose={vi.fn()}>
        <div data-testid="stage-body">briefing 본문</div>
      </CompanionPanel>,
    );
    expect(screen.getByTestId("stage-body")).toHaveTextContent("briefing 본문");
    unmount();
    render(
      <CompanionPanel view="hazards" autoView="hazards" onViewChange={vi.fn()} alert={stopAlert} sheetOpen={false} onSheetClose={vi.fn()}>
        <div data-testid="stage-body">hazards 본문</div>
      </CompanionPanel>,
    );
    expect(screen.getByTestId("stage-body")).toHaveTextContent("hazards 본문");
  });

  it("진행 단계에서 브리핑 탭이 노출되어 일시 복귀할 수 있다", async () => {
    const { onViewChange } = setup("hazards", "hazards");
    const briefingTab = screen.getByTestId("panel-tab-briefing");
    expect(briefingTab).toBeInTheDocument();
    await userEvent.click(briefingTab);
    expect(onViewChange).toHaveBeenCalledWith("briefing");
  });

  it("briefing 단계에서는 탭 그룹을 노출하지 않는다(단일 stage)", () => {
    setup("briefing", "briefing");
    expect(screen.queryByRole("tablist", { name: "패널 보기 전환" })).not.toBeInTheDocument();
  });
});

describe("PanelAlertStrip — 상시 경보 띠", () => {
  it("평시(INFO)는 status 역할 + 정보 톤, 경보 없음 문구", () => {
    render(<PanelAlertStrip alert={infoAlert} />);
    const strip = screen.getByTestId("panel-alert-strip");
    expect(strip).toHaveAttribute("data-level", "INFO");
    expect(strip).toHaveAttribute("role", "status");
    expect(strip).toHaveTextContent("작업중지 경보 없음");
  });

  it("STOP은 alert 역할 + 강조색 + 룰 개수 배지(색상+텍스트 병행)", () => {
    render(<PanelAlertStrip alert={stopAlert} />);
    const strip = screen.getByTestId("panel-alert-strip");
    expect(strip).toHaveAttribute("data-level", "STOP");
    expect(strip).toHaveAttribute("role", "alert");
    // 라벨 텍스트("작업중지")가 색상과 별개로 존재
    expect(strip).toHaveTextContent("작업중지");
    expect(strip).toHaveTextContent("룰 2");
  });
});
