import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// A private port, so a server another checkout runs on 4175 is never reused.
const port = 4198;
const host = "127.0.0.1";
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: `http://${host}:${port}` },
  webServer: {
    command: `pnpm --filter vizij-authoring build && pnpm --filter vizij-authoring preview --host ${host} --port ${port} --strictPort`,
    cwd: "../..",
    url: `http://${host}:${port}`,
    timeout: 300_000,
    reuseExistingServer: false,
  },
});
