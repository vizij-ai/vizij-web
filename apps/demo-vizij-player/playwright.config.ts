import { defineConfig } from "@playwright/test";

const serverMode =
  process.env.VIZIJ_DEMO_E2E_SERVER_MODE === "preview" ? "preview" : "dev";
const port = Number(process.env.VIZIJ_DEMO_E2E_PORT ?? 5184);
const host = "127.0.0.1";
const baseURL = `http://${host}:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  timeout: 120_000,
  outputDir: "./test-results",
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    browserName: "chromium",
    headless: !process.env.PWDEBUG,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      serverMode === "preview"
        ? `pnpm --filter demo-vizij-player build && pnpm --filter demo-vizij-player preview --host ${host} --port ${port}`
        : `NODE_ENV=development pnpm --filter demo-vizij-player dev --host ${host} --port ${port}`,
    cwd: "../..",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
