import { defineConfig } from "@playwright/test";

// The light suite boots the authoring workspace (the editing surface) and
// asserts it renders without page errors — cheap enough for CI on every push.
// Journey specs that drive real editing interactions are gated behind
// RUN_HEAVY=1 (pnpm run e2e:heavy) so they can be run on demand.
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:5199",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "pnpm --filter vizij-authoring exec vite --port 5199 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:5199",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    cwd: "..",
  },
});
