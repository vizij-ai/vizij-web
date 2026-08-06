import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook for the design-system layer of `vizij-authoring`
 * (`src/components/ui/**`, the shared patterns in `src/components/common/**`, and
 * the portable editor patterns in `src/components/editor/**`).
 *
 * Stories are deliberately COLOCATED with their components rather than kept in a
 * central `stories/` directory: `src/components/ui/` is intended to be extracted
 * into a consumable package, and colocated stories travel with the extraction.
 *
 * Feature components (store-, 3D-, WASM- or reactflow-connected) are out of
 * scope, hence the narrow globs.
 */
const config: StorybookConfig = {
  stories: [
    "../src/components/ui/**/*.mdx",
    "../src/components/ui/**/*.stories.@(ts|tsx)",
    "../src/components/common/**/*.mdx",
    "../src/components/common/**/*.stories.@(ts|tsx)",
    "../src/components/editor/**/*.mdx",
    "../src/components/editor/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  // `Logo.tsx` hardcodes `src="/assets/icon.svg"`, an app-absolute public path,
  // so the icon has to be served for its story to render. Only that one file is
  // mapped — `public/assets/` also holds ~31MB of GLBs that nothing here needs.
  // (The hardcoded path is itself an extraction blocker, not something to fix
  // from the Storybook side.)
  staticDirs: [{ from: "../public/assets/icon.svg", to: "/assets/icon.svg" }],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  core: {
    // The interactive prompt otherwise hangs `storybook dev` in CI/agent shells.
    disableTelemetry: true,
  },
  typescript: {
    // react-docgen reads the exported prop interfaces for the autodocs tables.
    reactDocgen: "react-docgen-typescript",
  },
  viteFinal: async (viteConfig) => {
    // Storybook merges the app's `vite.config.ts`, but NOT its plugin list —
    // `@tailwindcss/vite` has to be re-added or every story renders unstyled.
    viteConfig.plugins = [...(viteConfig.plugins ?? []), tailwindcss()];

    // The app's config force-prebundles unbuilt workspace packages
    // (`optimizeDeps.include: ["@vizij/node-graph-react"]`, `force: true`).
    // None of them are reachable from these stories, and asking esbuild to
    // prebundle a source-only workspace package fails the Storybook build, so
    // the include list is cleared. `exclude` is left alone: it only ever
    // *prevents* prebundling.
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      include: [],
    };

    return viteConfig;
  },
};

export default config;
