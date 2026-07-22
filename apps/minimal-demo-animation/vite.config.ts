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
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    // The device + module wasm packages are excluded from pre-bundling so Vite
    // handles their `new URL(..., import.meta.url)` wasm assets directly.
    exclude: ["@vizij/runtime", "@vizij/animation-module"],
  },
});
