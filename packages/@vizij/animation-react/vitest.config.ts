import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    pool: "threads",
  },
  optimizeDeps: {
    exclude: ["@vizij/animation"],
  },
  assetsInclude: ["**/*.wasm"],
});
