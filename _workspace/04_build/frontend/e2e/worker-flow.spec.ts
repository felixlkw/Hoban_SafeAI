import { test, expect, Page } from "@playwright/test";

/**
 * worker 전체 흐름 e2e — mock 모드.
 * 시나리오 1(타워크레인 경계셀) / 2(굴착 정상) / 3(밀폐공간 부분거절) / 4(석면 전체거절).
 */

async function setRole(page: Page, role: "worker" | "safety_manager" | "admin") {
  await page.addInitScript((r) => window.localStorage.setItem("jha_role", r), role);
}

async function submitWork(page: Page, desc: string) {
  await page.goto("/");
  // 챗 컴포저로 작업 입력 → 세션 챗으로 이동
  await page.getByLabel("메시지 입력").fill(desc);
  await page.getByTestId("chat-send").click();
  await expect(page).toHaveURL(/\/session\//);
}

test.describe("worker 자연어 입력 → 세션 흐름", () => {
  test("시나리오1: 타워크레인 해체 → 경계셀 → 작업자는 확정 불가·검토 요청 (P0-④)", async ({ page }) => {
    await setRole(page, "worker");
    await submitWork(page, "5층 옥상에서 타워크레인(T형) 해체 분해 작업을 진행합니다");

    // 분류 카드
    await expect(page.getByTestId("classification-card")).toBeVisible();
    await expect(page.getByLabel("대공종")).toHaveValue("가설공사");

    // 위험요인 분석 진행
    await page.getByTestId("confirm-classification").click();

    // 컴패니언 패널은 상시 — 위험요인 요약 카드를 눌러 'hazards' stage로 포커스
    const hazardOpener = page.getByTestId("artifact-opener").filter({ hasText: "위험요인 평가" });
    await hazardOpener.click();
    await expect(page.getByTestId("hazard-matrix")).toBeVisible();

    // 경계셀 배지 + 잠정 중점등록
    await expect(page.getByTestId("boundary-badge").first()).toContainText("잠정");

    // 모바일 시트를 닫아 채팅으로(데스크톱은 닫기 버튼 숨김 — 무시)
    const sheetClose = page.getByTestId("panel-sheet-close");
    if (await sheetClose.isVisible().catch(() => false)) await sheetClose.click({ force: true });

    // P0-④: 작업자는 finalize-button 없음. 검토 요청 CTA만 노출.
    await expect(page.getByTestId("finalize-button")).toHaveCount(0);
    await expect(page.getByTestId("request-review")).toBeVisible();
    // 검토 요청 → 완료 배지
    await page.getByTestId("request-review").click();
    await expect(page.getByTestId("review-requested")).toBeVisible();
  });

  test("시나리오2: 굴착·흙막이 → 안전관리자 → 기상 평온 시 정상 → ERP 등록 성공", async ({ page }) => {
    await setRole(page, "safety_manager");
    await submitWork(page, "지하 흙막이 굴착 및 터파기 토공 작업을 수행합니다");

    await page.getByTestId("confirm-classification").click();

    // 굴착 기본 시나리오는 '호우' → 작업중지 룰로 등록 차단됨(외부위험=내부위험).
    // 동적 위험 요약 카드로 패널(시트)을 열고 기상 '평온'으로 토글하면 동적 위험이 해소됨.
    await page.getByTestId("artifact-opener").filter({ hasText: "동적 위험" }).click();
    await page.getByTestId("dynamic-risk-panel").waitFor();
    await page.getByTestId("scenario-calm").click({ force: true });
    await page.waitForTimeout(700);
    // 모바일 시트가 채팅을 덮으므로 닫는다(데스크톱은 닫기 버튼이 숨겨져 있어 무시됨)
    const sheetClose = page.getByTestId("panel-sheet-close");
    if (await sheetClose.isVisible().catch(() => false)) await sheetClose.click({ force: true });

    const finalizeBtn = page.getByTestId("finalize-button");
    await expect(finalizeBtn).toBeEnabled();
    await finalizeBtn.click();

    // 등록 후 '결과 보기' 카드로 패널(registered stage)을 연다(모바일=시트).
    await page.getByTestId("artifact-opener").filter({ hasText: "ERP 등록 결과" }).click();

    // ERP 등록 상태(대기→성공)
    await expect(page.getByTestId("erp-status").first()).toBeVisible();
    await expect(page.getByTestId("erp-status").first()).toHaveAttribute("data-erp-status", "success", {
      timeout: 8000,
    });
    await expect(page.getByTestId("erp-status").first()).toContainText(/등록 완료/);
  });

  test("시나리오3: 밀폐공간 → 부분거절(데이터 갭 안내)", async ({ page }) => {
    await submitWork(page, "E/V PIT 밀폐공간 내부 점검 및 청소 작업입니다");

    await page.getByTestId("confirm-classification").click();

    // 부분 거절 안내 + 질식 갭
    const refuse = page.getByTestId("refuse-notice");
    await expect(refuse).toBeVisible();
    await expect(refuse).toHaveAttribute("data-mode", "partial");
    await expect(refuse).toContainText("질식");
    // 추락은 평가됨 — 위험요인 요약 카드를 눌러 패널을 hazards stage로 포커스
    await page.getByTestId("artifact-opener").filter({ hasText: "위험요인 평가" }).click();
    await expect(page.getByTestId("hazard-card").first()).toBeVisible();
  });

  test("시나리오4: 석면 → 전체거절(분류 단계에서 차단)", async ({ page }) => {
    // '해체'(타워 키워드) 회피 — 석면/화학 키워드로 refused_full 유도
    await submitWork(page, "기존 건물 내장재 석면 제거 및 처리 작업을 진행합니다");

    const refuse = page.getByTestId("refuse-notice");
    await expect(refuse).toBeVisible();
    await expect(refuse).toHaveAttribute("data-mode", "full");
    await expect(refuse).toContainText("자동 평가를 제공하지 않습니다");
    // 분류 카드는 렌더되지 않음
    await expect(page.getByTestId("classification-card")).toHaveCount(0);
  });
});
