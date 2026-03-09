import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.pw.ts",
  timeout: 120_000,
  outputDir: "./test-results",
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    headless: !process.env.PWDEBUG,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke",
      grep: /@smoke/,
    },
    {
      name: "workflow",
      grep: /@workflow/,
    },
  ],
  webServer: {
    command:
      "pnpm --filter vizij-authoring build && pnpm --filter vizij-authoring preview --host 127.0.0.1 --port 4175",
    cwd: "../..",
    url: "http://127.0.0.1:4175",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
