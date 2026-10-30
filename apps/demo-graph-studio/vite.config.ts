import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The directory holding this checkout, so a linked sibling vizij-rs checkout's
// wasm packages can be served.
const repoRoot = path.resolve(import.meta.dirname, "../../..");

export default defineConfig({
  plugins: [react()],
  root: ".",
  resolve: {
    alias: {
      "@vizij/authoring-shared": path.resolve(
        import.meta.dirname,
        "../vizij-authoring/src/shared/index.ts",
      ),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [repoRoot],
    },
    watch: {
      ignored: ["**/node_modules/**", "!**/node_modules/@vizij/node-graph/**"],
    },
  },
  build: {
    outDir: "dist",
  },
  optimizeDeps: {
    // Pre-bundling the wasm shim would break its relative pkg/ URLs.
    exclude: ["@vizij/node-graph"],
  },
  assetsInclude: ["**/*.wasm"],
});
