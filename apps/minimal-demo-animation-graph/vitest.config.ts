import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vitest/config";

const resolveFromRoot = (...segments: string[]) =>
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ...segments);

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: [],
    globals: true,
  },
  resolve: {
    alias: {
      "@vizij/node-graph": resolveFromRoot("test-shims", "node-graph-wasm.ts"),
    },
  },
});
