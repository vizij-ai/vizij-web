import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/runtime/**",
        "!**/node_modules/@vizij/animation-module/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: [
      "@vizij/runtime",
      "@vizij/animation-module",
      "@vizij/node-graph-wasm",
    ],
  },
});
