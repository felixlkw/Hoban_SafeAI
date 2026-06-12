import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatMessage, TypingIndicator, QuickReplies } from "@/components/chat/ChatPrimitives";

describe("ChatMessage", () => {
  it("어시스턴트/사용자 발신자를 스크린리더용으로 구분한다", () => {
    const { rerender } = render(<ChatMessage role="assistant">안녕하세요</ChatMessage>);
    expect(screen.getByText("호반 안전 도우미:")).toBeInTheDocument();
    rerender(<ChatMessage role="user">타워크레인 해체</ChatMessage>);
    expect(screen.getByText("나:")).toBeInTheDocument();
  });

  it("각 메시지는 role=article", () => {
    render(<ChatMessage role="assistant">x</ChatMessage>);
    expect(screen.getByRole("article")).toBeInTheDocument();
  });
});

describe("TypingIndicator", () => {
  it("입력 중 상태를 aria-label로 알린다", () => {
    render(<TypingIndicator />);
    expect(screen.getByLabelText("호반 안전 도우미가 입력 중입니다")).toBeInTheDocument();
  });
});

describe("QuickReplies", () => {
  it("칩 클릭 시 value를 콜백으로 전달한다", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <QuickReplies
        replies={[{ label: "타워크레인 해체", value: "tower" }]}
        onPick={onPick}
      />,
    );
    await user.click(screen.getByTestId("quick-reply"));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ value: "tower" }));
  });

  it("replies가 비면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<QuickReplies replies={[]} onPick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
