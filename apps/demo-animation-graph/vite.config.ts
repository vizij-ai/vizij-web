import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/animation-wasm/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
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
