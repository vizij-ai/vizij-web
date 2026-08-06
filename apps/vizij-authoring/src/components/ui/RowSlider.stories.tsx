import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RowSlider } from "./index";
import type { RowSliderProps } from "./index";

function ControlledRowSlider({
  value: initial,
  onChange,
  ...rest
}: RowSliderProps) {
  const [value, setValue] = useState(initial);
  return (
    <RowSlider
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const meta = {
  title: "UI/RowSlider",
  component: RowSlider,
  parameters: {
    docs: {
      description: {
        component:
          'Inline slider + numeric field used inside inspector rows. Uses a **native `<input type="range">`**, not the `Slider` component, so its thumb and track are hardcoded `blue-500`/`zinc-800` rather than tokens. Sizing travels with the component as custom properties rather than app-global CSS: `--editor-row-min-height` (fallback `32px`) for the row hit target and `--editor-numeric-width` (fallback `88px`) for the numeric column. It also stops mouse/click/key propagation, which is what lets it sit inside a Collapsible trigger row.',
      },
    },
  },
  argTypes: {
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    value: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    onChange: fn(),
  },
  render: (args) => (
    <div className="max-w-md">
      <ControlledRowSlider {...args} />
    </div>
  ),
} satisfies Meta<typeof RowSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithLabel: Story = {
  args: { label: "weight" },
};

/**
 * `defaultValue` draws the amber marker and makes values within `snapThreshold`
 * snap to it while dragging.
 */
export const WithDefaultMarker: Story = {
  args: { defaultValue: 0.5, snapThreshold: 0.03, label: "weight" },
};

export const Disabled: Story = {
  args: { disabled: true, label: "weight" },
};

export const WideRange: Story = {
  args: { value: 45, min: -180, max: 180, step: 1, label: "yaw" },
};

export const IntegerSteps: Story = {
  args: { value: 3, min: 0, max: 10, step: 1, label: "count" },
};

export const Narrow: Story = {
  render: (args) => (
    <div className="w-56">
      <ControlledRowSlider {...args} label="weight" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "The numeric field is fixed at 88px, so below roughly 14rem the row wraps rather than shrinking the slider further.",
      },
    },
  },
};
