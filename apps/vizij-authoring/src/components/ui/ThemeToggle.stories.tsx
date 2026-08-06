import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeToggle } from "./ThemeToggle";

const meta = {
  title: "UI/ThemeToggle",
  component: ThemeToggle,
  parameters: {
    docs: {
      description: {
        component:
          "Icon button that reports a request to flip between light and dark. **Controlled**: it renders the `theme` it is given and calls `onToggle`; it neither reads nor writes the theme.\n\nIt previously imported `src/state/themeStore` directly — the only `ui/` → `src/state/` import in the app — which meant this primitive could not render outside a zustand store and could not leave the app. The binding now lives at its single call site (`app/AppMenuBar.tsx`), and an eslint boundary keeps `ui/` out of `src/state/`.\n\nThese stories drive local state, so clicking a toggle here changes the button's icon but not Storybook's canvas theme; use the toolbar for that.",
      },
    },
  },
  args: {
    theme: "dark",
    onToggle: () => {},
  },
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = { args: { theme: "dark" } };

export const Light: Story = {
  args: { theme: "light" },
  globals: { theme: "light" },
};

/**
 * Wired to local state, so the icon and title actually flip on click. Declared as
 * a named component rather than inline in `render` because `rules-of-hooks` only
 * recognises capitalised functions as components.
 */
function ControlledThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  return (
    <div className="flex items-center gap-3">
      <ThemeToggle
        theme={theme}
        onToggle={() => setTheme(theme === "dark" ? "light" : "dark")}
      />
      <span className="text-xs text-text-secondary">
        reported theme: <code>{theme}</code>
      </span>
    </div>
  );
}

export const Interactive: Story = {
  render: () => <ControlledThemeToggle />,
};

/** As it appears in the app: an icon button in a menubar-style row. */
export const InToolbarRow: Story = {
  render: (args) => (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border-default bg-bg-panel/60 p-1">
      <span className="px-2 text-xs font-bold text-text-secondary">
        Toolbar
      </span>
      <div className="mx-1 h-5 w-px bg-border-default/60" />
      <ThemeToggle {...args} />
    </div>
  ),
};

export const CustomClassName: Story = {
  args: { className: "p-3 rounded-full border border-border-default" },
};
