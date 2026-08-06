import type { Meta, StoryObj } from "@storybook/react-vite";
// NOT imported from "./index": `ThemeToggle` is absent from the `ui/index.ts`
// barrel, so an external consumer could only reach it by deep path. It is also
// the clearest extraction blocker in the layer — see the docs block below.
import { ThemeToggle } from "./ThemeToggle";

const meta = {
  title: "UI/ThemeToggle",
  component: ThemeToggle,
  parameters: {
    docs: {
      description: {
        component:
          "Icon button that flips the app between light and dark. **Extraction blocker:** it imports `src/state/themeStore` directly (a zustand store that also writes `.dark` onto `document.documentElement` and persists to `localStorage`), so it cannot leave the app without either shipping that store or growing a `theme`/`onToggle` prop pair. It is also absent from `ui/index.ts`.\n\nBecause it drives the same store the Storybook theme toolbar drives, clicking it changes the toolbar's effective theme — the two are the same source of truth, and that is exactly the coupling being documented.",
      },
    },
  },
  args: {},
} satisfies Meta<typeof ThemeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
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
