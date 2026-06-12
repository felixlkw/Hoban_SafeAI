import { test, expect, Page } from "@playwright/test";

/**
 * 동적 위험(기상·지형) e2e — mock 모드.
 * 작업중지 룰 발동 → 경보 배너 → 현장소장 승인 게이트 → 등록 차단/해제.
 */

async function toAssess(page: Page, desc: string) {
  // 현장소장 조치 확인·확정은 안전관리자 권한(P0-④) → e2e는 safety_manager 역할로 수행.
  await page.addInitScript(() => window.localStorage.setItem("jha_role", "safety_manager"));
  await page.goto("/");
  await page.getByLabel("메시지 입력").fill(desc);
  await page.getByTestId("chat-send").click();
  await page.getByTestId("confirm-classification").click();
  // 컴패니언 패널은 dynamic stage로 자동 전환. 모바일은 패널이 시트라
  // '동적 위험' 요약 카드를 눌러 시트를 연다(데스크톱은 무해 — 이미 표시됨).
  const dynOpener = page.getByTestId("artifact-opener").filter({ hasText: "동적 위험" });
  await dynOpener.click();
  await page.getByTestId("dynamic-risk-panel").waitFor();
}

test.describe("동적 위험성평가", () => {
  test("타워크레인+강풍: 작업중지 경보 + 현장소장 승인 전 등록 차단", async ({ page }) => {
    await toAssess(page, "5층 옥상에서 타워크레인(T형) 해체 분해 작업을 진행합니다");

    // 종합 경보 STOP
    const banner = page.getByTestId("alert-banner");
    await expect(banner).toHaveAttribute("data-level", "STOP");

    // 풍속 작업중지 룰 발동(근거 법령 포함)
    await expect(page.getByTestId("triggered-rules")).toContainText("타워크레인");
    await expect(page.getByTestId("triggered-rules")).toContainText("§37");

    // 승인 게이트 노출 + 등록 차단
    await expect(page.getByTestId("approval-gate")).toBeVisible();
    await expect(page.getByTestId("finalize-button")).toBeDisabled();

    // 현장소장 승인 → 채팅에 승인 echo(모바일은 시트를 닫아 채팅 확인)
    // force: 배경 채팅 smooth-scroll로 인한 stability 대기 회피(버튼 자체는 시트 내 고정).
    // 버튼 라벨은 경보 수준별 실제 행위(작업중지 조치 기록). "승인" 단어로 작업 재개 허가 오독 방지.
    await expect(page.getByTestId("approve-stoppage")).toContainText("작업중지 조치 기록");
    await page.getByTestId("approve-stoppage").click({ force: true });
    const sheetClose = page.getByTestId("panel-sheet-close");
    if (await sheetClose.isVisible().catch(() => false)) await sheetClose.click({ force: true });
    await expect(page.getByText(/작업중지 조치를 시행했음을 확인합니다/).first()).toBeVisible();
    // 동적 위험(기상·지형) 작업중지 사유는 해소됨 — 게이트 차단 목록에서 사라짐
    await expect(page.getByTestId("finalize-gate")).not.toContainText("작업중지 사유(기상·지형)");
    // (경계셀은 별도 — 안전관리자 확정이 남아 finalize는 여전히 차단됨이 정상)
  });

  test("폭염 시나리오 토글: 휴식 의무 안내 표시", async ({ page }) => {
    await toAssess(page, "5층 옥상에서 타워크레인(T형) 해체 분해 작업을 진행합니다");
    await page.getByTestId("scenario-heatwave").click();
    await expect(page.getByTestId("heat-rest")).toBeVisible();
    await expect(page.getByTestId("heat-rest")).toContainText("20분");
  });

  test("태풍·낙뢰 시나리오: 대피(EVAC) 경보", async ({ page }) => {
    await toAssess(page, "5층 옥상에서 타워크레인(T형) 해체 분해 작업을 진행합니다");
    await page.getByTestId("scenario-storm").click({ force: true });
    await expect(page.getByTestId("alert-banner")).toHaveAttribute("data-level", "EVAC");
  });

  test("굴착+호우: 지형 재해 플래그(침수·지하매설물) 표시", async ({ page }) => {
    await toAssess(page, "지하 흙막이 굴착 및 터파기 토공 작업을 수행합니다");
    await expect(page.getByTestId("geo-flags")).toBeVisible();
    await expect(page.getByTestId("geo-flags")).toContainText("침수");
    // 기상 카드 격자 좌표 표시(실제 LCC 변환)
    await expect(page.getByTestId("weather-card")).toContainText("격자");
  });
});
