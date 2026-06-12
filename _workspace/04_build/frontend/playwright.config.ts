import { defineConfig, devices } from "@playwright/test";

/**
 * e2e — mock 모드(NEXT_PUBLIC_USE_MOCK=true)로 프로덕션 빌드를 기동해
 * 데모 4시나리오의 전체 사용자 흐름을 검증한다. 백엔드 불필요.
 *
 * 데스크톱 + 모바일(현장 작업자) 2개 프로젝트.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  // 단일 mock prod 서버(next start)는 다수 동시 컨텍스트(특히 desktop+mobile 동시 실행)에서
  // 응답이 느려져 timeout flaky를 유발한다. 워커 수를 제한해 서버 부하를 안정화.
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    // 모션을 끄면 메시지 transform 애니메이션·smooth 스크롤이 즉시 완료되어
    // 모바일 sticky 컴포저/시트의 hit-test 레이스(intercepts pointer events)가 사라진다.
    // (제품도 globals.css에서 prefers-reduced-motion을 존중 — WCAG 2.3.3.)
    reducedMotion: "reduce",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    // 빌드 산출물을 mock 모드로 기동 (3100 포트로 e2e 격리)
    command: "npm run start:mock",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_USE_MOCK: "true", PORT: "3100" },
  },
});
