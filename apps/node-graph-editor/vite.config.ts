import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Vite config for vizij-web/apps/node-graph-editor
 * - Uses plugin-react for fast refresh and JSX/TSX support
 * - Adds server.fs.allow so Vite can serve local workspace packages (e.g. vizij-rs/npm/*)
 *
 * Note: If you move the repo, adjust the allowedPaths accordingly.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Absolute path to the mono-repo root and the local wasm package folders we need to allow
const repoRoot = path.resolve(__dirname, "../../.."); // vizij_ws
// const localWasmPkg = path.resolve(
//   __dirname,
//   "../../vizij-rs/npm/@vizij/node-graph-wasm",
// );
// const localWasmPkgPkg = path.resolve(localWasmPkg, "pkg");

export default defineConfig({
  plugins: [react()],
  root: ".",
  resolve: {
    // Avoid resolving symlinked workspaces to their real path; keeps node_modules URLs stable.
    preserveSymlinks: true,
  },
  server: {
    port: 5174,
    fs: {
      // Allow serving files from the repo root and the wasm package location (and pkg subdir)
      // allow: [repoRoot, localWasmPkg, localWasmPkgPkg],
      allow: [repoRoot],
    },
    watch: {
      ignored: [
        "**/node_modules/**",
        "!**/node_modules/@vizij/node-graph-wasm/**",
      ],
    },
  },
  build: {
    outDir: "dist",
  },
  optimizeDeps: {
    // Keep the wasm shim out of the esbuild prebundle so its relative pkg/ URLs remain valid
    exclude: ["@vizij/node-graph-wasm"],
  },
  assetsInclude: ["**/*.wasm"],
});
