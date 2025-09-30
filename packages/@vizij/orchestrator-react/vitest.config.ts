import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
  },
  optimizeDeps: {
    exclude: ["@vizij/orchestrator-wasm"],
  },
  assetsInclude: ["**/*.wasm"],
  resolve: {
    alias: {
      "@vizij/orchestrator-wasm": resolve(
        __dirname,
        "test/__stubs__/orchestrator-wasm.ts",
      ),
    },
  },
});
