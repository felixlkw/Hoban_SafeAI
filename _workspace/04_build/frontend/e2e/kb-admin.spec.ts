import { test, expect } from "@playwright/test";

/**
 * KB 관리 화면 e2e (mock 모드).
 * 흐름: 안전관리자 진입 → 검색 → 편집 → 등급 미리보기 확인 → 저장 → 재인덱싱 토스트.
 * 권한 게이트(worker 차단)도 함께 검증.
 */

async function switchRole(page: import("@playwright/test").Page, role: string) {
  await page.getByLabel("역할 전환").selectOption(role);
}

test.describe("KB 관리 화면", () => {
  test("worker는 접근 거부, safety_manager는 목록을 본다", async ({ page }) => {
    await page.goto("/admin/kb");
    await switchRole(page, "worker");
    await expect(page.getByTestId("kb-forbidden")).toBeVisible();

    await switchRole(page, "safety_manager");
    await expect(page.getByTestId("reindex-widget")).toBeVisible();
    await expect(page.getByTestId("kb-row").first()).toBeVisible();
  });

  test("검색 → 편집 → 등급 미리보기 → 저장 → 재인덱싱 토스트", async ({ page }) => {
    await page.goto("/admin/kb");
    await switchRole(page, "safety_manager");
    await expect(page.getByTestId("kb-row").first()).toBeVisible();

    // 검색
    await page.getByTestId("kb-search").fill("와이어로프");
    await page.getByTestId("kb-search-submit").click();
    await expect(page.getByTestId("kb-row").first()).toBeVisible();

    // 첫 행 편집
    await page.getByTestId("kb-row").first().getByRole("button", { name: "편집" }).click();
    const dialog = page.getByTestId("kb-edit-dialog");
    await expect(dialog).toBeVisible();

    // 등급 미리보기: 강도5 × 빈도4 = 20 → 상
    await page.getByTestId("kb-severity").selectOption("5");
    await page.getByTestId("kb-frequency").selectOption("4");
    await expect(page.getByTestId("grade-preview")).toContainText("상");
    await expect(page.getByTestId("grade-preview")).toContainText("20");

    // 저장 → 재인덱싱 폴링 → 갱신 토스트.
    // 모바일 바텀시트에서 스크롤 컨테이너 hit-test 불안정 회피 → 포커스 후 키보드 활성화.
    const save = page.getByTestId("kb-save");
    await save.focus();
    await save.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("kb-toast").first()).toBeVisible();
    // idle 복귀 후 "지식베이스 갱신됨" 토스트 (폴링 2s)
    await expect(page.getByText(/지식베이스 갱신됨/)).toBeVisible({ timeout: 15000 });
  });

  test("경계셀(강도4×빈도4) 편집 시 잠정 안내 + 중점등록 직접 선택 노출", async ({ page }) => {
    await page.goto("/admin/kb");
    await switchRole(page, "safety_manager");
    await page.getByTestId("kb-new").click();
    await expect(page.getByTestId("kb-edit-dialog")).toBeVisible();
    await page.getByTestId("kb-severity").selectOption("4");
    await page.getByTestId("kb-frequency").selectOption("4");
    await expect(page.getByTestId("grade-preview")).toContainText("경계셀");
    await expect(page.getByTestId("kb-boundary-O")).toBeVisible();
    await expect(page.getByTestId("kb-boundary-X")).toBeVisible();
  });
});
