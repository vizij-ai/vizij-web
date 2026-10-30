import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveDevHttpsOptions } from "./dev-certificate.mjs";

const https = resolveDevHttpsOptions();

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  server: {
    https,
    fs: {
      allow: [
        resolve(import.meta.dirname, "../.."),
        resolve(import.meta.dirname, "../../.."),
      ],
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
    exclude: ["@vizij/runtime"],
    include: ["@vizij/render"],
  },
});
