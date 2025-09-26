import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
  },
  optimizeDeps: {
    exclude: ["@vizij/node-graph-wasm"], // ← important
  },
  assetsInclude: ["**/*.wasm"],
});
