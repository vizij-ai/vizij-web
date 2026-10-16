import { defineConfig } from "@playwright/test";

const serverMode =
  process.env.VIZIJ_E2E_SERVER_MODE === "dev" ? "dev" : "preview";
const port = offsetPort(serverMode === "dev" ? 4176 : 4175);
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
        ? `NODE_ENV=development pnpm --filter vizij-authoring dev --host ${host} --port ${port} --strictPort`
        : `pnpm --filter vizij-authoring build && pnpm --filter vizij-authoring preview --host ${host} --port ${port} --strictPort`,
    cwd: "../..",
    url: baseURL,
    timeout: 120_000,
    // A server already answering on the port fails the run unless reuse is
    // asked for: it may be another checkout's, serving another build.
    reuseExistingServer: process.env.VIZIJ_E2E_REUSE_SERVER === "1",
  },
});

/**
 * `base` shifted by `VIZIJ_E2E_PORT_OFFSET` (default 0), so that checkouts
 * running this suite at the same time each serve on their own port.
 */
function offsetPort(base: number): number {
  const raw = process.env.VIZIJ_E2E_PORT_OFFSET ?? "0";
  const port = base + Number(raw);
  if (!/^\d+$/.test(raw) || port > 65_535) {
    throw new Error(
      `VIZIJ_E2E_PORT_OFFSET must be a non-negative integer that keeps port ${base} within 65535, got "${raw}"`,
    );
  }
  return port;
}
