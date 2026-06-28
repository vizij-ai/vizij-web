import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

const config: StorybookConfig = {
  stories: ["../src/components/ui/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-a11y",
    "@storybook/addon-designs",
  ],
  framework: { name: "@storybook/react-vite", options: {} },
  // Reuse the app's Tailwind v4 pipeline so stories get the real tokens + Questrial.
  viteFinal: async (cfg) => {
    cfg.plugins = cfg.plugins ?? [];
    cfg.plugins.push(tailwindcss());
    // Stories use only UI primitives — don't force pre-bundling of the (unbuilt) workspace pkgs the app config lists.
    cfg.optimizeDeps = { ...(cfg.optimizeDeps ?? {}), include: [] };
    return cfg;
  },
};

export default config;
