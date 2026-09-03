import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./index";

const meta = {
  title: "UI/Badge",
  component: Badge,
  parameters: {
    docs: {
      description: {
        component:
          "Tiny uppercase status pill. Used by `Panel` for its header badge slot.",
      },
    },
  },
  argTypes: {
    tone: { control: "inline-radio", options: ["accent", "info", "muted"] },
  },
  args: { children: "Beta", tone: "accent" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge {...args} tone="accent">
        Accent
      </Badge>
      <Badge {...args} tone="info">
        Info
      </Badge>
      <Badge {...args} tone="muted">
        Muted
      </Badge>
    </div>
  ),
};

/**
 * `info` and `muted` are hardcoded `zinc-800/40` + `zinc-400` rather than
 * tokens, so they barely register on a light canvas. Only `accent` is
 * token-driven.
 */
export const TonesOnLightCanvas: Story = {
  globals: { theme: "light" },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge {...args} tone="accent">
        Accent
      </Badge>
      <Badge {...args} tone="info">
        Info
      </Badge>
      <Badge {...args} tone="muted">
        Muted
      </Badge>
    </div>
  ),
};

export const LongLabel: Story = {
  args: { children: "Experimental runtime path" },
};
