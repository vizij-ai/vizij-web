import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  server: {
    fs: {
      allow: [resolve(__dirname, "../.."), resolve(__dirname, "../../..")],
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/render/**",
        "!**/node_modules/@vizij/utils/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    exclude: ["@vizij/arora-web-wasm"],
    include: ["@vizij/render"],
  },
});
