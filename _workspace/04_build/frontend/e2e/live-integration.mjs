// 실연동 통합 캡처 — frontend(3000) ↔ backend(8000), NEXT_PUBLIC_USE_MOCK 미설정.
// worker JWT를 localStorage에 주입(백엔드 AUTH_ENABLED=true 통과). 백엔드는 Mock Claude 모드.
import { chromium } from "@playwright/test";
import fs from "fs";

const BASE = "http://localhost:3000";
const OUT = "C:/Users/felix/OneDrive/문서/Project/Hoban_EHS_PoC_withDetails/_workspace/05_integration/screenshots";
fs.mkdirSync(OUT, { recursive: true });

const WTOK = fs.readFileSync("C:/Users/felix/OneDrive/문서/Project/Hoban_EHS_PoC_withDetails/_workspace/05_integration/_wtok.txt", "utf-8").trim();
const MTOK = fs.readFileSync("C:/Users/felix/OneDrive/문서/Project/Hoban_EHS_PoC_withDetails/_workspace/05_integration/_mtok.txt", "utf-8").trim();

const browser = await chromium.launch();
const fails = [];

async function newPage(token, role) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 1000 } });
  await ctx.addInitScript(([t, r]) => {
    window.localStorage.setItem("jha_token", t);
    window.localStorage.setItem("jha_role", r);
  }, [token, role]);
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("  [console.error]", m.text().slice(0, 160)); });
  page.on("response", (res) => {
    if (res.url().includes("/v1/") && res.status() >= 400) {
      console.log("  [HTTP", res.status(), "]", res.url().replace(BASE, ""));
      fails.push(`${res.status()} ${res.url()}`);
    }
  });
  return page;
}

// ── LIVE1: 홈 → 분류 카드 (worker) ──
const page = await newPage(WTOK, "safety_manager"); // safety_manager로 finalize까지 주행
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/LIVE1_home.png` });
console.log("LIVE1 home captured");

// 타워크레인 해체 입력
await page.getByLabel("메시지 입력").fill("5층 옥상에서 타워크레인(T형) 해체 분해 작업을 진행합니다");
await page.getByTestId("chat-send").click();
await page.waitForURL(/\/session\//, { timeout: 15000 });
console.log("session navigated:", page.url().replace(BASE, ""));

// 분류 카드 대기 (실 백엔드 classify)
await page.getByTestId("classification-card").waitFor({ timeout: 20000 });
const major = await page.getByLabel("대공종").inputValue().catch(() => "(n/a)");
console.log("LIVE2 classification 대공종 =", major);
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/LIVE2_classify.png`, fullPage: true });
console.log("LIVE2 classify captured");

// 분류 확정 → 위험요인(실 백엔드 assess)
await page.getByTestId("confirm-classification").click();
const hazardOpener = page.getByTestId("artifact-opener").filter({ hasText: "위험요인 평가" });
await hazardOpener.waitFor({ timeout: 20000 });
await hazardOpener.click();
await page.getByTestId("hazard-matrix").waitFor({ timeout: 10000 });
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/LIVE3_hazards.png`, fullPage: true });
console.log("LIVE3 hazards captured");

// boundary 배지 확인(타워크레인 = 곱16 경계셀 기대)
const boundaryCount = await page.getByTestId("boundary-badge").count();
console.log("boundary-badge count =", boundaryCount);

console.log("LIVE FAILS(4xx/5xx):", fails.length ? fails.join("; ") : "none");
await browser.close();
console.log("DONE");
