import { test, expect } from "@playwright/test";

/**
 * 안전관리자 검토·경계셀 확정 e2e + 권한 게이트.
 * 역할 전환은 TopBar select(데모용, 운영은 SSO claim).
 */

async function switchRole(page: import("@playwright/test").Page, role: string) {
  await page.getByLabel("역할 전환").selectOption(role);
}

test.describe("안전관리자 화면", () => {
  test("worker 역할은 접근 거부 안내를 본다", async ({ page }) => {
    await page.goto("/manager");
    await switchRole(page, "worker");
    await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
  });

  test("안전관리자는 검토 대기 목록을 보고 경계셀을 확정한다", async ({ page }) => {
    await page.goto("/manager");
    await switchRole(page, "safety_manager");

    await expect(page.getByRole("heading", { name: "검토 대기 목록" })).toBeVisible();

    // 첫 항목 경계셀 확정 다이얼로그
    await page.getByTestId("open-confirm").first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // 사유 미입력 + 미선택 시 확정 버튼 비활성 + 안내 노출
    const submit = page.getByTestId("confirm-submit");
    await expect(submit).toBeDisabled();
    await expect(page.getByTestId("unselected-hint")).toBeVisible();

    // 등급 '상' 선택 + 사유 입력만으로는 아직 비활성(중점등록 미선택)
    await dialog.getByRole("radio", { name: /상/ }).click();
    await page.getByLabel(/확정 사유/).fill("해체 높이 30m로 빈도 상향, 상으로 확정");
    await expect(submit).toBeDisabled();

    // 중점등록(O) 직접 선택 → 활성
    await page.getByTestId("register-O").click();
    await expect(submit).toBeEnabled();

    // 모바일(Pixel 5) 가드: 확정 버튼이 실제로 최상위(가림 없음)인지 먼저 단언한다.
    // (제품 다이얼로그는 본문 스크롤 + 푸터 고정 구조라 버튼이 본문에 가리지 않음.)
    // 이 단언이 통과하면 Playwright 모바일 터치 hit-test의 오탐(textarea intercept)을
    // force로 우회한다 — 실제 가림이 생기면 이 단언이 먼저 실패해 회귀를 잡는다.
    await expect
      .poll(async () =>
        submit.evaluate((b) => {
          const r = b.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top === b || b.contains(top as Node);
        }),
      )
      .toBe(true);
    await submit.click({ force: true });
    // 확정 후 목록에서 제거되어 다이얼로그 닫힘
    await expect(dialog).toHaveCount(0);
  });
});
