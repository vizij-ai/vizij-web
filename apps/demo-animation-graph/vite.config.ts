import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const fixturesBrowserEntry = path.resolve(
  __dirname,
  "../../../vizij-rs/npm/@vizij/test-fixtures/dist/src/index.browser.js",
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@vizij/test-fixtures": fixturesBrowserEntry,
    },
  },
  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/animation-wasm/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
        "!**/node_modules/@vizij/test-fixtures/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@vizij/animation-wasm", "@vizij/node-graph-wasm"],
  },
});
