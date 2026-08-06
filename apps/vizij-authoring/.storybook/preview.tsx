import { useLayoutEffect } from "react";
import type { ReactNode } from "react";
import type { Decorator, Preview } from "@storybook/react-vite";
// `@semio/ui/styles.css` must be imported BEFORE `../src/styles.css`, exactly as
// `src/main.tsx` does it: semio's precompiled sheet lands its `@layer theme`
// tokens first, and the app's unlayered `:root` block then overrides them with
// Vizij's palette. Swapping the order silently reverts the app to Semio's brand.
import "@semio/ui/styles.css";
import "../src/styles.css";
import { SemioThemeProvider } from "../src/providers/SemioTheme";
import { useThemeStore } from "../src/state/themeStore";

type ThemeName = "light" | "dark";

/**
 * Applies the theme to `document.documentElement`, NOT to a story wrapper.
 *
 * Radix (menus, modals, popovers, selects, tooltips) and Base UI portals render
 * as siblings of `#storybook-root`, so a `.dark` class on a wrapper div would
 * leave every popup in the wrong theme. Routing through the app's `themeStore`
 * is what keeps `SemioThemeProvider`'s JS-visible value in sync with the class —
 * `@semio/ui` components that branch on `useTheme()` read that context.
 */
function ThemedCanvas({
  theme,
  children,
}: {
  theme: ThemeName;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    useThemeStore.getState().setTheme(theme);
    // Defensive: `setTheme` owns the class today, but the class is the contract
    // that actually drives the CSS, so it is asserted here too.
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  return (
    <SemioThemeProvider>
      {/* `--bg-app` is the app canvas colour; without it stories render on
          Storybook's white sheet and dark-mode components look broken. */}
      <div
        className="text-text-primary"
        style={{
          background: "var(--bg-app)",
          minHeight: "100%",
          padding: "1rem",
        }}
      >
        {children}
      </div>
    </SemioThemeProvider>
  );
}

const withTheme: Decorator = (Story, context) => {
  const theme = (context.globals.theme as ThemeName | undefined) ?? "dark";

  return (
    <ThemedCanvas theme={theme}>
      <Story />
    </ThemedCanvas>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: {
    theme: "dark",
  },
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Light / dark app theme (sets `.dark` on <html>)",
      toolbar: {
        icon: "mirror",
        items: [
          { value: "dark", icon: "moon", title: "Dark" },
          { value: "light", icon: "sun", title: "Light" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    options: {
      storySort: {
        order: ["UI", "Common"],
      },
    },
  },
};

export default preview;
