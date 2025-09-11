import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Important: don't realpath npm links; keep them under node_modules/
    preserveSymlinks: true,
  },
  server: {
    // Un-ignore these linked deps inside node_modules
    watch: {
      // anymatch supports negation; first ignore, then unignore our packages
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
        "!**/node_modules/@vizij/node-graph-react/**",
      ],
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    // Prevent pre-bundling the wasm ESM shim in dev; let Vite handle it directly
    exclude: ["@vizij/node-graph-wasm"],
    // Force Vite to include the React binding so named exports (e.g. useNodeOutput) are available
    include: ["@vizij/node-graph-react"],
    // Ensure re-optimization when config changes or local package updates
    force: true,
  },
});
