import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const fixturesBrowserEntry = path.resolve(
  __dirname,
  "../../../vizij-rs/npm/@vizij/test-fixtures/dist/index.browser.js",
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@vizij/test-fixtures": fixturesBrowserEntry,
    },
  },
  server: {
    fs: {
      allow: ["../../../"],
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/orchestrator-wasm/**",
        "!**/node_modules/@vizij/test-fixtures/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@vizij/orchestrator-wasm"],
  },
});
