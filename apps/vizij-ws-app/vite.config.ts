import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  assetsInclude: ["**/*.gltf", "**/*.glb"],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: [
        "**/src-tauri/**",
        "**/node_modules/**",
        "!**/node_modules/@vizij/orchestrator-wasm/**",
        "!**/node_modules/@vizij/orchestrator-react/**",
        "!**/node_modules/@vizij/render/**",
        "!**/node_modules/@vizij/utils/**",
      ],
    },
    fs: {
      allow: [resolve(__dirname, "../.."), resolve(__dirname, "../../..")],
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
}));
