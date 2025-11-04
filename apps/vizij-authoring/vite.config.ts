import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");
export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  resolve: {
    alias: {
      "@vizij/node-graph-authoring": path.resolve(
        workspaceRoot,
        "packages/@vizij/node-graph-authoring/src",
      ),
    },
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
        "!**/node_modules/@vizij/node-graph-authoring/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
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
  test: {
    pool: "threads",
    environment: "jsdom",
  },
});
