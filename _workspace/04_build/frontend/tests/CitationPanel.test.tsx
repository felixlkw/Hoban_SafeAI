import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CitationPanel } from "@/components/CitationPanel";
import type { CitationDetail } from "@/lib/types";

const detail: CitationDetail = {
  text: "해체 중 부재 단부에서 작업자 추락 / 안전대 부착설비 설치 후 안전대 체결",
  meta: {
    major_type: "가설공사",
    sub_type: "타워크레인(T형)",
    detail_item: "해체·분해",
    accident_type: "추락",
    source_row: 42,
    legal_refs: ["§43"],
  },
  score: 8.7,
};

const writeText = vi.fn().mockResolvedValue(undefined);

describe("CitationPanel — 감사 친화형 보강", () => {
  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("법령 전체명 + 조항 제목을 구조화해 보여준다", () => {
    render(<CitationPanel chunkId="R00042" detail={detail} onClose={() => {}} />);
    const legal = screen.getByTestId("legal-detail");
    expect(legal).toHaveTextContent("산업안전보건기준에 관한 규칙 제43조");
    expect(legal).toHaveTextContent("개구부");
  });

  it("원 데이터 행(공종 경로·위험요인)과 검색 적합도를 표시한다", () => {
    render(<CitationPanel chunkId="R00042" detail={detail} onClose={() => {}} />);
    const body = screen.getByTestId("citation-body");
    expect(body).toHaveTextContent("가설공사 › 타워크레인(T형) › 해체·분해");
    expect(screen.getByTestId("citation-score")).toHaveTextContent("8.7");
  });

  it("근거 복사 버튼이 법령+원문을 클립보드로 복사하고 피드백을 보여준다", async () => {
    const user = userEvent.setup();
    // userEvent.setup()이 navigator.clipboard를 자체 stub으로 덮으므로 setup 이후 재정의.
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<CitationPanel chunkId="R00042" detail={detail} onClose={() => {}} />);
    await user.click(screen.getByTestId("copy-evidence"));
    expect(writeText).toHaveBeenCalledOnce();
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("산업안전보건기준에 관한 규칙 제43조");
    expect(copied).toContain("위험요인:");
    await waitFor(() => expect(screen.getByTestId("copy-evidence")).toHaveTextContent("복사했습니다"));
  });
});
