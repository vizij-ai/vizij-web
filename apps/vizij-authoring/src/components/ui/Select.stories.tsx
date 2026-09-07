import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Select } from "./index";
import type { SelectOption, SelectProps } from "./index";

const OPTIONS: SelectOption[] = [
  { value: "linear", label: "Linear" },
  { value: "ease_in", label: "Ease in" },
  { value: "ease_out", label: "Ease out" },
  { value: "step", label: "Step", disabled: true },
];

function ControlledSelect({ value: initial, onChange, ...rest }: SelectProps) {
  const [value, setValue] = useState(initial);
  return (
    <Select
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
  title: "UI/Select",
  component: Select,
  parameters: {
    docs: {
      description: {
        component:
          "Single-select on `@semio/ui`'s `Select`. Three gaps are papered over locally: `placeholder` (prepends a disabled empty option, because semio derives the trigger purely from a value match), `disabled` (emulated on a wrapper — semio only supports per-option disabling), and `label` (app-owned caption; semio's `label` prop only feeds the multi-select trigger). `SelectOption.description` is on the type but **never rendered** — semio has no per-option description slot and no `renderItem` escape hatch.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md"] },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    value: "linear",
    options: OPTIONS,
    label: "Interpolation",
    onChange: fn(),
  },
  render: (args) => (
    <div className="max-w-xs">
      <ControlledSelect {...args} />
    </div>
  ),
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutLabel: Story = {
  args: { label: undefined },
};

/** No option matches `value`, so the disabled placeholder row is prepended. */
export const WithPlaceholder: Story = {
  args: { value: "", placeholder: "Select an option…" },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex max-w-xs flex-col gap-3">
      <ControlledSelect {...args} size="sm" label="Small" />
      <ControlledSelect {...args} size="md" label="Medium" />
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithDisabledOption: Story = {
  args: { value: "ease_in" },
  parameters: {
    docs: {
      description: {
        story: "`Step` is `disabled: true` and cannot be picked.",
      },
    },
  },
};

/**
 * `description` is accepted by `SelectOption` but silently dropped — kept here so
 * the gap is visible rather than surprising.
 */
export const DescriptionIsIgnored: Story = {
  args: {
    options: [
      { value: "linear", label: "Linear", description: "not rendered" },
      { value: "ease_in", label: "Ease in", description: "also not rendered" },
    ],
  },
};

export const LongOptionList: Story = {
  args: {
    value: "channel_00",
    label: "Channel",
    options: Array.from({ length: 24 }, (_, index) => ({
      value: `channel_${String(index).padStart(2, "0")}`,
      label: `Channel ${index}`,
    })),
  },
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
};
