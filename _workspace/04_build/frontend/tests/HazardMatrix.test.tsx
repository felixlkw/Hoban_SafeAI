import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HazardMatrix } from "@/components/HazardMatrix";
import { Hazard } from "@/lib/types";

const hazards: Hazard[] = [
  {
    accident_type: "추락",
    description: "해체 중 부재 단부에서 작업자 추락",
    severity: 4,
    frequency: 4,
    risk_grade: "상",
    boundary_cell: true,
    controls: ["안전대 부착설비 설치", "작업발판 선설치"],
    citations: ["R00042", "R00128"],
    legal_refs: ["§43"],
    citation_detail: {
      R00042: { text: "원문 42", meta: { source_row: 42 }, score: 8.7 },
    },
  },
  {
    accident_type: "추락",
    description: "동일 재해형태 두 번째 위험요인",
    severity: 3,
    frequency: 2,
    risk_grade: "중",
    boundary_cell: false,
    controls: ["보호구 착용"],
    citations: ["R00200"],
  },
  {
    accident_type: "낙하",
    description: "와이어 해지 중 부재 낙하",
    severity: 5,
    frequency: 4,
    risk_grade: "상",
    boundary_cell: false,
    controls: ["하부 출입통제"],
    citations: ["R00210"],
  },
];

describe("HazardMatrix", () => {
  it("재해형태별로 그룹핑하고 각 그룹 건수를 표시한다", () => {
    render(<HazardMatrix hazards={hazards} onCitationClick={() => {}} />);
    // 추락 그룹 헤더(2건), 낙하 그룹 헤더(1건)
    expect(screen.getByRole("heading", { name: /추락/ })).toHaveTextContent("(2)");
    expect(screen.getByRole("heading", { name: /낙하/ })).toHaveTextContent("(1)");
    expect(screen.getAllByTestId("hazard-card")).toHaveLength(3);
  });

  it("경계셀 위험요인은 (잠정) 배지, 일반은 등급 라벨을 표시한다", () => {
    render(<HazardMatrix hazards={hazards} onCitationClick={() => {}} />);
    expect(screen.getByTestId("boundary-badge")).toHaveTextContent("상");
    // 낙하 상 등급(경계셀 아님)도 텍스트로 표기
    const cards = screen.getAllByTestId("hazard-card");
    expect(within(cards[2]).getByText("상")).toBeInTheDocument();
  });

  it("인용 칩 클릭 시 chunk_id와 inline detail을 콜백으로 전달한다", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<HazardMatrix hazards={hazards} onCitationClick={onClick} />);
    const links = screen.getAllByTestId("citation-link");
    await user.click(links[0]); // R00042
    expect(onClick).toHaveBeenCalledWith("R00042", expect.objectContaining({ text: "원문 42" }));
  });

  it("강도×빈도=곱 값을 표시한다", () => {
    render(<HazardMatrix hazards={hazards} onCitationClick={() => {}} />);
    expect(screen.getAllByText(/곱 16/)[0]).toBeInTheDocument(); // 4×4
    expect(screen.getByText(/곱 20/)).toBeInTheDocument(); // 5×4
  });

  it("editable일 때 등급 라디오로 수정 콜백을 호출한다", async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();
    render(<HazardMatrix hazards={hazards} editable onGradeChange={onGrade} onCitationClick={() => {}} />);
    // 첫 카드(추락 경계셀)의 '중' 등급 버튼 클릭
    const groups = screen.getAllByRole("radiogroup");
    const midBtn = within(groups[0]).getByRole("radio", { name: /중/ });
    await user.click(midBtn);
    expect(onGrade).toHaveBeenCalledWith(0, "중");
  });

  it("위험요인이 없으면 안내 문구를 표시한다", () => {
    render(<HazardMatrix hazards={[]} onCitationClick={() => {}} />);
    expect(screen.getByText(/표시할 위험요인이 없습니다/)).toBeInTheDocument();
  });

  it("legal_refs가 비면 '법령 인용 확인 필요' 경고 배지를 렌더한다 (P1-1)", () => {
    render(<HazardMatrix hazards={hazards} onCitationClick={() => {}} />);
    // hazards[1](legal_refs 없음), hazards[2](없음) → 경고 배지 2개, hazards[0]은 §43 있음
    const warns = screen.getAllByTestId("legal-ref-warning");
    expect(warns.length).toBe(2);
    expect(warns[0]).toHaveTextContent("법령 인용 확인 필요");
  });

  it("개선대책은 미체크로 시작하고 체크 시 '적용 확인'과 카운트가 갱신된다 (P1-2)", async () => {
    const user = userEvent.setup();
    render(<HazardMatrix hazards={hazards} onCitationClick={() => {}} />);
    const lists = screen.getAllByTestId("controls-checklist");
    // 첫 카드: 대책 2건, 시작 시 0/2 + 미적용 경고
    expect(within(lists[0]).getByText("0/2 적용")).toBeInTheDocument();
    const boxes = within(lists[0]).getAllByTestId("control-checkbox");
    expect(boxes[0]).not.toBeChecked();
    await user.click(boxes[0]);
    expect(boxes[0]).toBeChecked();
    expect(within(lists[0]).getByText("1/2 적용")).toBeInTheDocument();
    expect(within(lists[0]).getByText("✓ 적용 확인")).toBeInTheDocument();
    // 전부 체크 → 미적용 경고 사라짐
    await user.click(boxes[1]);
    expect(within(lists[0]).getByText("2/2 적용")).toBeInTheDocument();
    expect(within(lists[0]).queryByText(/미적용 대책이 있습니다/)).not.toBeInTheDocument();
  });
});
