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
    // Un-ignore this linked dep inside node_modules
    watch: {
      // anymatch supports negation; first ignore, then unignore our package
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/animation-wasm/**",
        "!**/node_modules/@vizij/test-fixtures/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    // Prevent pre-bundling the wasm ESM shim in dev; let Vite handle it directly
    exclude: ["@vizij/animation-wasm"],
  },
});
