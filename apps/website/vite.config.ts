import { defineConfig, PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()] as PluginOption[],
  assetsInclude: ["**/*.glb"],
  resolve: {
    // Keep linked workspaces under node_modules so wasm relative URLs resolve at runtime
    preserveSymlinks: true,
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
