import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";

/**
 * Storybook for `vizij-authoring`.
 *
 * Stories are deliberately COLOCATED with their components rather than kept in a
 * central `stories/` directory: `src/components/ui/` is intended to be extracted
 * into a consumable package, and colocated stories travel with the extraction.
 *
 * ## Two tiers, and why the globs are no longer narrow
 *
 * The design-system layer — `ui/`, `common/`, `editor/` — has always been here.
 *
 * **Feature panels used to be excluded**, on the grounds that store-, 3D-, WASM-
 * and reactflow-connected components are not design-system material. That was true
 * but had a cost: the components that carry the actual product were the only ones
 * nobody could look at, and verifying a change to one meant either loading a rig in
 * the real app (~2 minutes) or building a throwaway harness. Two separate
 * workstreams did exactly that, independently, in a single day.
 *
 * So feature panels are in scope now, with one rule: **a panel earns a story only
 * if it can be mounted from props or from seeded store state.** No story may boot
 * the 3D runtime or the WASM graph. Panels that cannot meet that bar stay
 * unstoried rather than getting a fake that lies about them.
 *
 * Titles keep the tiers apart. `Editor/` is reserved for `src/components/editor/`,
 * whose defining property is that it has NO app dependencies — mixing store-bound
 * panels under that prefix would blur the one distinction the eslint import
 * boundary exists to protect. Feature panels are titled `Editor Tools/`, matching
 * the vocabulary of `docs/references/editor-refactoring-plan.md` §5.
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
    // Feature panels — see the two-tier note above.
    "../src/components/panels/**/*.stories.@(ts|tsx)",
    "../src/components/inspector/**/*.stories.@(ts|tsx)",
    "../src/motiongraph/**/*.stories.@(ts|tsx)",
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
