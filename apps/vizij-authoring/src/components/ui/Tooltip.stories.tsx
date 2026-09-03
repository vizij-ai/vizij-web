import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconInfoCircle } from "@tabler/icons-react";
import { Button, Tooltip } from "./index";

const meta = {
  title: "UI/Tooltip",
  component: Tooltip,
  parameters: {
    docs: {
      description: {
        component:
          "Tooltip on `@semio/ui`'s `Tooltip` (Radix), which replaced a mouse-only hand-rolled portal — focus, Escape and collision repositioning now work. Each instance mounts its own provider, so no root provider is needed. `delay` and `className` were dropped from the old API. Content is portalled, so it only themes correctly when `.dark` is on `<html>`. `TooltipProps` is not exported.",
      },
    },
  },
  argTypes: {
    side: {
      control: "inline-radio",
      options: ["top", "bottom", "left", "right"],
    },
    disabled: { control: "boolean" },
  },
  args: {
    content: "Recomputes the IR from the current bindings.",
    children: <Button variant="secondary">Hover or focus me</Button>,
  },
  render: (args) => (
    <div className="flex min-h-[10rem] items-center justify-center">
      <Tooltip {...args} />
    </div>
  ),
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sides: Story = {
  render: (args) => (
    <div className="flex min-h-[12rem] items-center justify-center gap-4">
      {(["top", "bottom", "left", "right"] as const).map((side) => (
        <Tooltip {...args} key={side} side={side} content={`side="${side}"`}>
          <Button variant="secondary" size="sm">
            {side}
          </Button>
        </Tooltip>
      ))}
    </div>
  ),
};

/** `disabled` suppresses the popup entirely; the trigger still renders. */
export const Disabled: Story = {
  args: { disabled: true },
};

export const OnIcon: Story = {
  args: {
    content: "Inputs declared by the rig itself.",
    children: (
      <IconInfoCircle className="h-4 w-4 cursor-help text-text-secondary" />
    ),
  },
  parameters: {
    docs: {
      description: {
        story: "This is how `Panel` renders its `description` prop.",
      },
    },
  },
};

export const RichContent: Story = {
  args: {
    content: (
      <div className="flex flex-col gap-1">
        <strong>jaw_open</strong>
        <span>float · range 0…1 · default 0</span>
      </div>
    ),
  },
};

export const LongContent: Story = {
  args: {
    content:
      "This binding resolves against the runtime channel table at export time; if the channel is missing the bundle still builds but the driver is reported as unresolved.",
  },
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
};
