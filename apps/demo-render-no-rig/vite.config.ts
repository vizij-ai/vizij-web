import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

const fixturesBrowserEntry = path.resolve(
  __dirname,
  "../../../vizij-rs/npm/@vizij/test-fixtures/dist/index.browser.js",
);

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
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
        "!**/node_modules/@vizij/animation-wasm/**",
        "!**/node_modules/@vizij/animation-react/**",
        "!**/node_modules/@vizij/orchestrator-wasm/**",
        "!**/node_modules/@vizij/orchestrator-react/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
        "!**/node_modules/@vizij/node-graph-react/**",
        "!**/node_modules/@vizij/test-fixtures/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    // Let Vite serve the wasm shim directly; pre-bundling breaks import.meta.url resolution
    exclude: [
      "@vizij/animation-wasm",
      "@vizij/orchestrator-wasm",
      "@vizij/node-graph-wasm",
    ],
    include: [
      "@vizij/animation-react",
      "@vizij/orchestrator-react",
      "@vizij/node-graph-react",
    ],
    force: true,
  },
});
