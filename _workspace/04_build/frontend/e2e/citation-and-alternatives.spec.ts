import { test, expect } from "@playwright/test";

/**
 * 인용 원문 검증 + 분류 대안 선택 e2e.
 * AI 추천은 제안일 뿐 — 사용자가 대안 선택/인용 검증 가능해야 한다.
 */

test.describe("인용 패널 & 분류 대안", () => {
  test("분류 대안 후보를 펼쳐 선택하면 분류가 바뀐다", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("메시지 입력").fill("5층 옥상 타워크레인(T형) 해체 분해 작업");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("classification-card")).toBeVisible();

    await page.getByTestId("alt-toggle").click();
    await expect(page.getByTestId("alt-list")).toBeVisible();
    await page.getByTestId("alt-option").first().click();

    // 선택한 대안(L형)이 입력값에 반영
    await expect(page.getByLabel("중공종")).toHaveValue("타워크레인(L형)");
    // 수정 안내 노출
    await expect(page.getByText(/분류를 수정했습니다/)).toBeVisible();
  });

  test("위험요인 인용 칩 클릭 → 원문 패널 열림 → ESC로 닫힘", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("메시지 입력").fill("5층 옥상 타워크레인(T형) 해체 분해 작업");
    await page.getByTestId("chat-send").click();
    await page.getByTestId("confirm-classification").click();

    // 컴패니언 패널은 상시(데스크톱) / 시트(모바일). '위험요인 평가' 요약 카드로 hazards stage로 포커스.
    const hazardOpener = page.getByTestId("artifact-opener").filter({ hasText: "위험요인 평가" });
    await hazardOpener.waitFor();
    await hazardOpener.click();
    await expect(page.getByTestId("hazard-matrix")).toBeVisible();

    await page.getByTestId("citation-link").first().click();
    const panel = page.getByTestId("citation-panel");
    await expect(panel).toBeVisible();
    // inline prefetch 원문 표시
    await expect(panel).toContainText("R00042");
    await expect(panel).toContainText("원문");

    // 인용 패널만 닫기(아티팩트 ESC 충돌 회피 — 명시적 닫기 버튼)
    await page.getByRole("button", { name: "인용 패널 닫기" }).click();
    await expect(panel).toHaveCount(0);
  });
});
