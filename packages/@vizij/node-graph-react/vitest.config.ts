import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    pool: "forks",
  },
  optimizeDeps: {
    exclude: ["@vizij/node-graph"], // its wasm loads itself by a relative URL
  },
  assetsInclude: ["**/*.wasm"],
});
