import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const host = process.env.TAURI_DEV_HOST;
const workspaceRoot = resolve(__dirname, "../..");

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  assetsInclude: ["**/*.gltf", "**/*.glb"],
  clearScreen: false,
  resolve: {
    alias: {
      "@vizij/node-graph-authoring": resolve(
        workspaceRoot,
        "packages/@vizij/node-graph-authoring/src",
      ),
    },
  },
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
        "!**/node_modules/@vizij/node-graph-wasm/**",
        "!**/node_modules/@vizij/node-graph-react/**",
        "!**/node_modules/@vizij/node-graph-authoring/**",
        "!**/node_modules/@vizij/render/**",
        "!**/node_modules/@vizij/utils/**",
        "!**/node_modules/@vizij/runtime-react/**",
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
    exclude: [
      "@vizij/orchestrator-wasm",
      "@vizij/node-graph-wasm",
    ],
    include: [
      "@vizij/orchestrator-react",
      "@vizij/node-graph-react",
      "@vizij/node-graph-authoring",
      "@vizij/render",
      "@vizij/runtime-react",
    ],
    force: true,
  },
}));
