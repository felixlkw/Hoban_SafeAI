import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatComposer } from "@/components/chat/ChatComposer";

describe("ChatComposer — 카드 대기 액션 바 전환", () => {
  it("disabled + stepName이면 입력창 대신 고정 액션 바를 보여준다", () => {
    render(<ChatComposer onSend={() => {}} disabled stepName="공종 분류" onScrollToCard={() => {}} />);
    const bar = screen.getByTestId("composer-action-bar");
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent("공종 분류");
    // 흐린 입력창(textarea)은 노출하지 않는다
    expect(screen.queryByLabelText("메시지 입력")).not.toBeInTheDocument();
  });

  it("카드로 이동 버튼이 스크롤 콜백을 호출한다", async () => {
    const user = userEvent.setup();
    const onScroll = vi.fn();
    render(<ChatComposer onSend={() => {}} disabled stepName="ERP 등록" onScrollToCard={onScroll} />);
    await user.click(screen.getByTestId("scroll-to-card"));
    expect(onScroll).toHaveBeenCalledOnce();
  });

  it("입력 가능 상태에선 기존 컴포저(입력창)를 그대로 노출한다", () => {
    render(<ChatComposer onSend={() => {}} />);
    expect(screen.getByLabelText("메시지 입력")).toBeInTheDocument();
    expect(screen.queryByTestId("composer-action-bar")).not.toBeInTheDocument();
  });

  it("stepName 없는 비활성(예: 완료)은 액션 바 대신 힌트를 보여준다", () => {
    render(<ChatComposer onSend={() => {}} disabled disabledHint="평가가 완료되었습니다." />);
    expect(screen.queryByTestId("composer-action-bar")).not.toBeInTheDocument();
    expect(screen.getByText("평가가 완료되었습니다.")).toBeInTheDocument();
  });
});

describe("ChatComposer — 보조 단서 valuePatch 삽입", () => {
  it("valuePatch nonce 변경 시 입력값을 덮어쓴다", () => {
    const { rerender } = render(
      <ChatComposer onSend={() => {}} valuePatch={{ text: "", nonce: 0 }} />,
    );
    const ta = screen.getByLabelText("메시지 입력") as HTMLTextAreaElement;
    expect(ta.value).toBe("");
    rerender(<ChatComposer onSend={() => {}} valuePatch={{ text: "타워크레인 해체 (장소: 옥상)", nonce: 1 }} />);
    expect((screen.getByLabelText("메시지 입력") as HTMLTextAreaElement).value).toBe("타워크레인 해체 (장소: 옥상)");
  });

  it("입력 시 onValueChange로 외부에 통지한다", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChatComposer onSend={() => {}} onValueChange={onChange} />);
    await user.type(screen.getByLabelText("메시지 입력"), "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });
});
