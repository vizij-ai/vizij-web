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
      // `@base-ui/react` now has two consumers (this app and `@semio/ui`), and
      // it keeps a module-level portal/dismissal stack — two copies means
      // clicks inside one library's popup read as "outside" to the other. It is
      // deduped here because it is a declared dependency and so resolvable from
      // this root.
      //
      // `@react-three/fiber` is deliberately NOT deduped: it is a dependency of
      // `@semio/ui` and a peer of `@vizij/render`, but is not declared by this
      // app, so it does not exist in `apps/vizij-authoring/node_modules`.
      // Listing it here makes Vite resolve it from this root and the build fails
      // with "Rollup failed to resolve import @react-three/fiber". It needs no
      // dedupe anyway — pnpm resolves exactly one instance (9.5.0), verified via
      // `ls node_modules/.pnpm/@react-three+fiber@*`.
      dedupe: ["react", "react-dom", "three", "@base-ui/react"],
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
        allow: ["../../../"],
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
      server: {
        deps: {
          // `@semio/ui`'s ESM bundle does `import { clamp } from "lodash"` — a
          // named import from a CommonJS module. Vite's dev/build pipeline
          // applies CJS interop, but Vitest externalises node_modules by
          // default and Node's ESM loader cannot resolve named exports off a
          // CJS module, so any test importing a semio component dies at
          // collection with "Named export 'clamp' not found".
          //
          // Inlining routes the package through Vite's transform instead.
          inline: ["@semio/ui"],
        },
      },
    },
  };
});
