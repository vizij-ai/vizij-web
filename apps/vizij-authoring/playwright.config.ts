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
  // One at a time. Every test here boots the app, a WASM runtime and a large
  // GLB face; running several at once exhausts memory and they fail for
  // contention rather than for anything real. Playwright's default of
  // cores/2 happens to be 1 on a two-core CI runner, so this mainly stops
  // the suite going red on a developer machine with more cores.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    browserName: "chromium",
    headless: !process.env.PWDEBUG,
    // Headless Chromium has no GPU, and this app is a WebGL app: without a
    // software backend `Error creating WebGL context.` is thrown and the whole
    // React tree unmounts, leaving an empty document. Every locator then fails
    // as "element(s) not found" or hangs until the test timeout, which reads
    // as a flaky test rather than as a browser with no GL.
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
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
      serverMode === "dev"
        ? `NODE_ENV=development pnpm --filter vizij-authoring dev --host ${host} --port ${port}`
        : `pnpm --filter vizij-authoring build && pnpm --filter vizij-authoring preview --host ${host} --port ${port}`,
    cwd: "../..",
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
