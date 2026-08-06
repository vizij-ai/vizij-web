import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconPlus } from "@tabler/icons-react";
// Imported from the barrel rather than "./Button" on purpose: `index.ts` is the
// prospective package entry point, so stories exercise the public API surface.
import { Button } from "./index";

const meta = {
  title: "UI/Button",
  component: Button,
  parameters: {
    docs: {
      description: {
        component:
          "Primary action control. Five variants, four sizes, optional pill shape.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "subtle", "danger", "ghost"],
    },
    size: { control: "select", options: ["sm", "md", "lg", "icon"] },
    pill: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: {
    children: "Button",
    variant: "secondary",
    size: "md",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="primary">
        Primary
      </Button>
      <Button {...args} variant="secondary">
        Secondary
      </Button>
      <Button {...args} variant="subtle">
        Subtle
      </Button>
      <Button {...args} variant="danger">
        Danger
      </Button>
      <Button {...args} variant="ghost">
        Ghost
      </Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
      <Button {...args} size="lg">
        Large
      </Button>
      <Button {...args} size="icon" aria-label="Add">
        <IconPlus className="h-4 w-4" />
      </Button>
    </div>
  ),
};

export const Pill: Story = {
  args: { pill: true, variant: "primary", children: "Pill button" },
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} variant="primary" disabled>
        Primary
      </Button>
      <Button {...args} variant="secondary" disabled>
        Secondary
      </Button>
      <Button {...args} variant="danger" disabled>
        Danger
      </Button>
    </div>
  ),
};

/**
 * `subtle` is hardcoded to `bg-white/5` + `hover:text-white`, so it is
 * near-invisible on a light canvas. Kept as its own story so the regression is
 * visible rather than buried in the variant row.
 */
export const SubtleOnLightCanvas: Story = {
  args: { variant: "subtle", children: "Subtle on light" },
  globals: { theme: "light" },
};
