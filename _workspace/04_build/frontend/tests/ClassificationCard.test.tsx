import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClassificationCard } from "@/components/ClassificationCard";
import { Classification } from "@/lib/types";

const baseClassification: Classification = {
  major_type: "가설공사",
  sub_type: "타워크레인(T형)",
  detail_item: "해체·분해",
  confidence: 0.82,
  alternatives: [
    { label: "타워크레인(L형)", level: "sub", sub_type: "타워크레인(L형)", confidence: 0.41 },
    { label: "타워크레인 인상", level: "sub", sub_type: "타워크레인 인상", confidence: 0.33 },
  ],
};

describe("ClassificationCard", () => {
  it("분류 3단(대/중/세부)과 신뢰도를 표시한다", () => {
    render(<ClassificationCard classification={baseClassification} onConfirm={() => {}} />);
    expect(screen.getByDisplayValue("가설공사")).toBeInTheDocument();
    expect(screen.getByDisplayValue("타워크레인(T형)")).toBeInTheDocument();
    expect(screen.getByDisplayValue("해체·분해")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "82");
  });

  it("대안 후보 드롭다운을 펼치고 선택하면 분류가 바뀐다", async () => {
    const user = userEvent.setup();
    render(<ClassificationCard classification={baseClassification} onConfirm={() => {}} />);

    expect(screen.queryByTestId("alt-list")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("alt-toggle"));
    expect(screen.getByTestId("alt-list")).toBeInTheDocument();

    const options = screen.getAllByTestId("alt-option");
    await user.click(options[0]); // 타워크레인(L형)
    expect(screen.getByDisplayValue("타워크레인(L형)")).toBeInTheDocument();
  });

  it("확정 시 편집된 분류를 콜백으로 전달한다", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<ClassificationCard classification={baseClassification} onConfirm={onConfirm} />);
    await user.click(screen.getByTestId("confirm-classification"));
    expect(onConfirm).toHaveBeenCalledWith({
      major_type: "가설공사",
      sub_type: "타워크레인(T형)",
      detail_item: "해체·분해",
    });
  });

  it("AI 추천은 '제안·수정 가능'으로 표기되어 결정 인상을 주지 않는다", () => {
    render(<ClassificationCard classification={baseClassification} onConfirm={() => {}} />);
    expect(screen.getByText(/수정 가능/)).toBeInTheDocument();
  });
});
