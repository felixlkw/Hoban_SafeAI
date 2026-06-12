import { test, expect, Page } from "@playwright/test";

/**
 * P0-① 챗 자유 입력(질문·정정) + P0-② 되돌리기/거절 경로 e2e (mock 모드).
 */

async function toAssessAsManager(page: Page, desc: string) {
  await page.addInitScript(() => window.localStorage.setItem("jha_role", "safety_manager"));
  await page.goto("/");
  await page.getByLabel("메시지 입력").fill(desc);
  await page.getByTestId("chat-send").click();
  await page.getByTestId("confirm-classification").click();
}

test.describe("챗 자유 입력 + 되돌리기/거절", () => {
  test("P0-①: 카드 대기 중 '질문·정정' 토글로 자유 입력 활성 + 일반 질문 안내", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("jha_role", "worker"));
    await page.goto("/");
    await page.getByLabel("메시지 입력").fill("5층 옥상 타워크레인(T형) 해체 분해 작업");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("classification-card")).toBeVisible();

    // 분류 단계 → 액션 바에 자유 입력 토글
    const openInput = page.getByTestId("open-free-input");
    await expect(openInput).toBeVisible();
    await openInput.click();

    // 입력 활성 → 일반 질문 전송 → 카드 우선 안내 응답
    await page.getByLabel("메시지 입력").fill("이거 어떻게 하는 건가요?");
    await page.getByTestId("chat-send").click();
    await expect(page.getByText(/카드 기반 진행을 우선합니다/).first()).toBeVisible();
  });

  test("P0-②: 분류 확정 후 '분류 다시 선택'으로 classify 단계 복귀", async ({ page }) => {
    await toAssessAsManager(page, "5층 옥상 타워크레인(T형) 해체 분해 작업");
    // 위험요인 산출 후 분류 카드에 재분류 버튼 노출
    const reclassify = page.getByTestId("reclassify");
    await reclassify.waitFor();
    await reclassify.click();
    await expect(page.getByText(/분류 단계로 돌아갑니다/).first()).toBeVisible();
    // 새 분류 카드가 다시 노출됨
    await expect(page.getByTestId("classification-card").last()).toBeVisible();
  });

  test("P0-②: 위험요인 카드에서 '이 평가 거절' → 사유 입력 후 거절 종료", async ({ page }) => {
    await toAssessAsManager(page, "5층 옥상 타워크레인(T형) 해체 분해 작업");
    const rejectOpen = page.getByTestId("reject-open");
    await rejectOpen.waitFor();
    await rejectOpen.click();
    // 사유 5자 미만이면 확정 비활성
    const confirm = page.getByTestId("reject-confirm");
    await expect(confirm).toBeDisabled();
    await page.getByLabel("거절 사유").fill("실제 작업 범위와 불일치하여 수동 재작성 필요");
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText(/거절 상태로 종료/).first()).toBeVisible();
  });
});
