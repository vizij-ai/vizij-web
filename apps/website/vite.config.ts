import path from "node:path";
import { defineConfig, PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

const fixturesBrowserEntry = path.resolve(
  __dirname,
  "../../../vizij-rs/npm/@vizij/test-fixtures/dist/src/index.browser.js",
);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()] as PluginOption[],
  assetsInclude: ["**/*.glb"],
  resolve: {
    alias: {
      "@vizij/test-fixtures": fixturesBrowserEntry,
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
        "!**/node_modules/@vizij/test-fixtures/**",
      ],
    },
  },
  optimizeDeps: {
    // Let Vite serve the wasm shim directly; pre-bundling breaks import.meta.url resolution
    exclude: ["@vizij/animation-wasm"],
    include: ["@vizij/animation-react"],
    force: true,
  },
});
