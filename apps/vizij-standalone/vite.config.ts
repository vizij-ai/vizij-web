import { resolve } from "node:path";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    // A locally linked @vizij/runtime (the wasm link workflow) lives beside
    // this checkout.
    fs: {
      allow: [resolve(__dirname, "../.."), resolve(__dirname, "../../..")],
    },
  },
  // The runtime's wasm loads itself; pre-bundling would break its URL.
  optimizeDeps: {
    exclude: ["@vizij/runtime"],
  },
}));
