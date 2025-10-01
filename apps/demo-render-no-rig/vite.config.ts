import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  resolve: {
    preserveSymlinks: true,
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
