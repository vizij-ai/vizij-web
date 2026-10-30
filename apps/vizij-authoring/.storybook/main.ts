import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook for `vizij-authoring`.
 *
 * Stories are colocated with their components rather than kept in a central
 * `stories/` directory: `src/components/ui/` is meant to be extracted into a
 * consumable package, and colocated stories travel with it.
 *
 * Two tiers are in scope:
 *
 * - **The design-system layer**: `ui/`, `common/`, `editor/`.
 * - **Feature panels**, on one rule: a panel earns a story only if it can be
 *   mounted from props or from seeded store state. No story boots the 3D
 *   runtime or the WASM graph; a panel that cannot meet that bar stays
 *   unstoried rather than getting a fake that misrepresents it.
 *
 * Titles keep the tiers apart. `Editor/` is reserved for
 * `src/components/editor/`, whose defining property is that it has no app
 * dependencies, the distinction the ESLint import boundary protects. Feature
 * panels are titled `Editor Tools/`, the vocabulary of
 * `docs/references/editor-refactoring-plan.md` §5.
 */
const config: StorybookConfig = {
  stories: [
    // Design-system layer.
    "../src/components/ui/**/*.mdx",
    "../src/components/ui/**/*.stories.@(ts|tsx)",
    "../src/components/common/**/*.mdx",
    "../src/components/common/**/*.stories.@(ts|tsx)",
    "../src/components/editor/**/*.mdx",
    "../src/components/editor/**/*.stories.@(ts|tsx)",
    // Feature panels: see the two tiers above.
    "../src/components/panels/**/*.stories.@(ts|tsx)",
    "../src/components/inspector/**/*.stories.@(ts|tsx)",
    "../src/motiongraph/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs"],
  // `Logo.tsx` hardcodes `src="/assets/icon.svg"`, an app-absolute public path,
  // so the icon has to be served for its story to render. Only that one file is
  // mapped: `public/assets/` also holds ~31MB of GLBs that nothing here needs.
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
