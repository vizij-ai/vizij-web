import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolveDevHttpsOptions } from "./dev-certificate.mjs";

const https = resolveDevHttpsOptions();

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  server: {
    https,
    fs: {
      allow: [resolve(__dirname, "../.."), resolve(__dirname, "../../..")],
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/orchestrator-wasm/**",
        "!**/node_modules/@vizij/orchestrator-react/**",
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
    exclude: ["@vizij/orchestrator-wasm"],
    include: ["@vizij/orchestrator-react", "@vizij/render"],
  },
});
