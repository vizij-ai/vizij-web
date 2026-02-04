import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..", "..");
const require = createRequire(import.meta.url);
const threeEntry = require.resolve("three");
const threePath = path.resolve(path.dirname(threeEntry), "..");
const reactPath = path.resolve(__dirname, "node_modules/react");
const reactDomPath = path.resolve(__dirname, "node_modules/react-dom");
export default defineConfig({
  plugins: [react(), tailwindcss()],
  assetsInclude: ["**/*.glb"],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@vizij/node-graph-authoring": path.resolve(
        workspaceRoot,
        "packages/@vizij/node-graph-authoring/src",
      ),
      "@vizij/authoring-shared": path.resolve(__dirname, "src/shared/index.ts"),
      react: reactPath,
      "react-dom": reactDomPath,
      three: threePath,
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
