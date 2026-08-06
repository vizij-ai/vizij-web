import type { Meta, StoryObj } from "@storybook/react-vite";
import { Logo } from "./index";

const meta = {
  title: "UI/Logo",
  component: Logo,
  parameters: {
    docs: {
      description: {
        component:
          "Wordmark + icon lockup, rendered by `MenuBar`. **Extraction blocker:** the icon is a hardcoded app-absolute path (`/assets/icon.svg`) with no prop to override it, and the wordmark asks for a `Gilroy`/`SFProRounded` font that the app never loads — so it falls back to `ui-sans-serif` here and in the app alike.",
      },
    },
  },
  args: {},
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
};

/**
 * `className` is merged onto the flex row, so scale/spacing can be adjusted but
 * the 24px icon size cannot.
 */
export const CustomSpacing: Story = {
  args: { className: "px-0 py-0 gap-4" },
};

export const OnPanelSurface: Story = {
  render: (args) => (
    <div className="inline-flex rounded-xl border border-border-default bg-bg-panel p-2">
      <Logo {...args} />
    </div>
  ),
};
