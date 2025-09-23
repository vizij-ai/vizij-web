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
const localWasmPkg = path.resolve(
  __dirname,
  "../../vizij-rs/npm/@vizij/node-graph-wasm",
);
const localWasmPkgPkg = path.resolve(localWasmPkg, "pkg");

export default defineConfig({
  plugins: [react()],
  root: ".",
  server: {
    port: 5174,
    fs: {
      // Allow serving files from the repo root and the wasm package location (and pkg subdir)
      allow: [repoRoot, localWasmPkg, localWasmPkgPkg],
    },
  },
  build: {
    outDir: "dist",
  },
});
