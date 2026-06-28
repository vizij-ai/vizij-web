import React from "react";
import type { Preview } from "@storybook/react";
import "@fontsource/questrial";
import "../src/styles.css";

/**
 * Theme parity with Figma: the Figma component library is built in LIGHT mode,
 * so Storybook defaults to light too (light story ↔ light Figma frame). The
 * toolbar toggle applies the app's `.dark` class + matching `--bg-app` canvas so
 * dark stories review against the dark theme (and, once dark Figma frames exist,
 * dark ↔ dark). Hierarchy is via Questrial (single weight) + size/color.
 */
const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Vizij theme (match the Figma frame's mode)",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "contrast",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      const dark = context.globals.theme === "dark";
      // Mirror the class onto <html> so portaled content (Modal, Tooltip) that
      // escapes this wrapper still picks up the dark token overrides.
      React.useEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        return () => document.documentElement.classList.remove("dark");
      }, [dark]);
      return (
        <div
          className={dark ? "dark" : ""}
          style={{
            background: "var(--bg-app)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-sans)",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    // We render our own themed, centered canvas (above), so let it fill the frame
    // and disable the addon-backgrounds swatches that would fight the theme.
    layout: "fullscreen",
    backgrounds: { disable: true },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
};

export default preview;
