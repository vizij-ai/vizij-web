import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
// NOT imported from "./index": `NumberField` is absent from the `ui/index.ts`
// barrel, so an external consumer could only reach it by deep path. Flagged as a
// public-API gap.
import { NumberField } from "./NumberField";
import type { NumberFieldProps } from "./NumberField";

function ControlledNumberField({
  value: initial,
  onChange,
  ...rest
}: NumberFieldProps) {
  const [value, setValue] = useState(initial);
  return (
    <NumberField
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

const meta = {
  title: "UI/NumberField",
  component: NumberField,
  parameters: {
    docs: {
      description: {
        component:
          "Numeric input with `Intl.NumberFormat` display, stepper buttons, ArrowUp/ArrowDown stepping and drag-to-scrub. **Not exported from `ui/index.ts`** — deep-path import only. Built on `@semio/ui`'s `TextField` for the input chrome, with the numeric engine app-owned: semio's own `NumberField` hardcodes a 2-decimal display and cannot express this app's four-decimal contract.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md"] },
    commitMode: { control: "inline-radio", options: ["immediate", "blur"] },
    allowScrub: { control: "boolean" },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    value: 12,
    step: 1,
  },
  render: (args) => (
    <div className="w-32">
      <ControlledNumberField {...args} />
    </div>
  ),
} satisfies Meta<typeof NumberField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-start gap-3">
      <div className="w-28">
        <ControlledNumberField {...args} size="sm" />
      </div>
      <div className="w-28">
        <ControlledNumberField {...args} size="md" />
      </div>
    </div>
  ),
};

export const Clamped: Story = {
  args: { min: 0, max: 10, value: 5 },
  parameters: {
    docs: {
      description: { story: "The steppers stop at `min` / `max`." },
    },
  },
};

export const FractionalStep: Story = {
  args: { value: 0.35, step: 0.05, min: 0, max: 1 },
};

/** `format` is passed straight to `Intl.NumberFormat`. */
export const Formatted: Story = {
  args: {
    value: 0.42,
    step: 0.01,
    format: { style: "percent", maximumFractionDigits: 0 },
  },
};

export const Currency: Story = {
  args: {
    value: 1250,
    step: 10,
    format: { style: "currency", currency: "USD", maximumFractionDigits: 0 },
  },
};

/**
 * `commitMode="blur"` keeps a local draft and only calls `onChange` on commit,
 * so mid-typing values never reach the store. Watch the Actions panel: nothing
 * fires until blur/Enter.
 */
export const CommitOnBlur: Story = {
  args: { commitMode: "blur" },
};

/** Without `allowScrub` the field is click-to-type only and swallows pointer-down. */
export const NoScrub: Story = {
  args: { allowScrub: false },
};

export const Disabled: Story = {
  args: { disabled: true },
};

export const WithPlaceholder: Story = {
  args: { value: Number.NaN, placeholder: "auto" },
  parameters: {
    docs: {
      description: {
        story:
          "The placeholder is only visible when the field holds no parseable number.",
      },
    },
  },
};
