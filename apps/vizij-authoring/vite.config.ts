import { fileURLToPath } from "node:url";
import fs from "node:fs";
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
/**
 * Where the linked `@vizij/*` wasm packages actually live on disk.
 *
 * `pnpm run wasm:link` symlinks them at a sibling vizij-rs checkout, and the
 * dev server has to be allowed to serve the `.wasm` behind that symlink or it
 * answers 403 and the runtime fails to init. The relative allow-entry below
 * covers a normal clone (`vizij-web/` and `vizij-rs/` side by side) but not a
 * git worktree, which sits three directories deeper — so resolve the real
 * paths instead of assuming a layout.
 */
const linkedVizijDirs = (() => {
  const scopeDir = path.resolve(workspaceRoot, "node_modules/@vizij");
  let entries: string[];
  try {
    entries = fs.readdirSync(scopeDir);
  } catch {
    return [];
  }
  const roots = new Set<string>();
  for (const entry of entries) {
    try {
      const real = fs.realpathSync(path.join(scopeDir, entry));
      // Only somewhere outside the workspace needs allow-listing.
      if (!real.startsWith(workspaceRoot)) {
        roots.add(path.dirname(path.dirname(real)));
      }
    } catch {
      // A broken link is the linker's problem, not the dev server's.
    }
  }
  return [...roots];
})();

const reactPath = path.resolve(__dirname, "node_modules/react");
const reactDomPath = path.resolve(__dirname, "node_modules/react-dom");
export default defineConfig(({ mode }) => {
  const nodeEnv =
    mode === "production"
      ? "production"
      : mode === "test"
        ? "test"
        : "development";

  return {
    plugins: [react(), tailwindcss()],
    assetsInclude: ["**/*.glb"],
    define: {
      "process.env.NODE_ENV": JSON.stringify(nodeEnv),
    },
    resolve: {
      dedupe: ["react", "react-dom", "three"],
      alias: {
        "@vizij/node-graph-authoring": path.resolve(
          workspaceRoot,
          "packages/@vizij/node-graph-authoring/src",
        ),
        "@vizij/node-graph-react": path.resolve(
          workspaceRoot,
          "packages/@vizij/node-graph-react/src",
        ),
        "@vizij/runtime-react": path.resolve(
          workspaceRoot,
          "packages/@vizij/runtime-react/src",
        ),
        "@vizij/render": path.resolve(
          workspaceRoot,
          "packages/@vizij/render/src",
        ),
        "@vizij/utils": path.resolve(
          workspaceRoot,
          "packages/@vizij/utils/src",
        ),
        "@vizij/authoring-shared": path.resolve(
          __dirname,
          "src/shared/index.ts",
        ),
        react: reactPath,
        "react-dom": reactDomPath,
        three: threePath,
      },
    },
    server: {
      fs: {
        allow: ["../../../", ...linkedVizijDirs],
      },
      watch: {
        ignored: [
          "**/node_modules/**",
          "!**/node_modules/@vizij/animation/**",
          "!**/node_modules/@vizij/animation-react/**",
          "!**/node_modules/@vizij/node-graph/**",
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
        "@vizij/animation",
        "@vizij/node-graph",
        "@vizij/runtime",
        "@vizij/animation-module",
      ],
      include: ["@vizij/node-graph-react"],
      force: true,
    },
    test: {
      pool: "threads",
      environment: "jsdom",
      setupFiles: ["./src/test/setupVitest.ts"],
    },
  };
});
