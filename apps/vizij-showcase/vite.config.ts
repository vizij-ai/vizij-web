import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { resolve } from "node:path";

const workspaceRoot = resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  assetsInclude: ["**/*.glb"],
  resolve: {
    alias: {
      "@vizij/runtime-react": resolve(
        workspaceRoot,
        "packages/@vizij/runtime-react/src",
      ),
      "@vizij/render": resolve(workspaceRoot, "packages/@vizij/render/src"),
      "@vizij/node-graph-authoring": resolve(
        workspaceRoot,
        "packages/@vizij/node-graph-authoring/src",
      ),
      "@vizij/utils": resolve(workspaceRoot, "packages/@vizij/utils/src"),
    },
  },
  server: {
    fs: {
      allow: [workspaceRoot, resolve(workspaceRoot, "..")],
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
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
    exclude: [
      "@vizij/node-graph-wasm",
      "@vizij/runtime",
      "@vizij/animation-module",
    ],
    include: ["@vizij/render"],
  },
});
