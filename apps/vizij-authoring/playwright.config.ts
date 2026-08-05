import { defineConfig } from "@playwright/test";

const serverMode =
  process.env.VIZIJ_E2E_SERVER_MODE === "dev" ? "dev" : "preview";
const port = serverMode === "dev" ? 4176 : 4175;
const host = "127.0.0.1";
const baseURL = `http://${host}:${port}`;

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
    baseURL,
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
    {
      // Visual regression baselines for the UI primitive layer. Kept out of the
      // smoke/workflow gates so a deliberate restyle cannot block a functional
      // check, and so snapshots are only compared on an explicit run.
      name: "visual",
      grep: /@visual/,
    },
  ],
  webServer: {
    command:
      serverMode === "dev"
        ? `NODE_ENV=development pnpm --filter vizij-authoring dev --host ${host} --port ${port}`
        : `pnpm --filter vizij-authoring build && pnpm --filter vizij-authoring preview --host ${host} --port ${port}`,
    cwd: "../..",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
