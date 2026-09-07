import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TextArea } from "./index";
import type { TextAreaProps } from "./index";

function ControlledTextArea({
  value: initial,
  onChange,
  ...rest
}: TextAreaProps) {
  const [value, setValue] = useState(String(initial ?? ""));
  return (
    <TextArea
      {...rest}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onChange?.(event);
      }}
    />
  );
}

const meta = {
  title: "UI/TextArea",
  component: TextArea,
  parameters: {
    docs: {
      description: {
        component:
          "Multi-line input on `@semio/ui`'s `TextArea`, kept `font-mono` because it holds expressions and code rather than prose. `onChange` keeps the native `(event)` signature instead of semio's `(value, event)`. Resize is disabled (`resize-none`); size it with `className`.",
      },
    },
  },
  argTypes: {
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    placeholder: "clamp(jaw_open * 1.5, 0, 1)",
    value: "",
  },
  render: (args) => (
    <div className="max-w-md">
      <ControlledTextArea {...args} />
    </div>
  ),
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { value: "clamp(jaw_open * 1.5, 0, 1)" },
};

export const Disabled: Story = {
  args: { disabled: true, value: "clamp(jaw_open * 1.5, 0, 1)" },
};

export const Taller: Story = {
  args: {
    className: "min-h-[10rem]",
    value: [
      "let base = jaw_open * 1.5;",
      "let smoothed = lerp(prev, base, 0.2);",
      "clamp(smoothed, 0, 1)",
    ].join("\n"),
  },
};

export const WithRows: Story = {
  args: { rows: 6 },
};

export const ReadOnly: Story = {
  args: { readOnly: true, value: "// generated — edit the binding instead" },
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  args: { value: "clamp(jaw_open * 1.5, 0, 1)" },
  parameters: {
    docs: {
      description: {
        story:
          "The previous hand-rolled implementation hardcoded `bg-zinc-950`/`text-zinc-200` and was dark-on-dark here; semio's variant classes are token-driven.",
      },
    },
  },
};
