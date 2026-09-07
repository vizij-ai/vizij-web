import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "./index";
import type { SwitchProps } from "./index";

function ControlledSwitch({
  checked: initial,
  onChange,
  ...rest
}: SwitchProps) {
  const [checked, setChecked] = useState(Boolean(initial));
  return (
    <Switch
      {...rest}
      checked={checked}
      onChange={(next) => {
        setChecked(next);
        onChange?.(next);
      }}
    />
  );
}

const meta = {
  title: "UI/Switch",
  component: Switch,
  parameters: {
    docs: {
      description: {
        component:
          "Labelled switch on `@semio/ui`'s `Switch` (Radix underneath, so `role=\"switch\"` is preserved). The label/hint block is app-owned because semio's `label` is a `string` and it has no `hint` — which is why both are `ReactNode` here. Note that the label block is clickable but is a plain `div`, not a `<label>`, so it is not keyboard-reachable on its own.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md"] },
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    checked: false,
    label: "Autosave",
  },
  render: (args) => <ControlledSwitch {...args} />,
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const On: Story = {
  args: { checked: true },
};

export const WithHint: Story = {
  args: {
    checked: true,
    hint: "Working state is written after every edit.",
  },
};

export const WithoutLabel: Story = {
  args: { label: undefined },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <ControlledSwitch {...args} size="sm" label="Small" hint="Size.Sm" />
      <ControlledSwitch {...args} size="md" label="Medium" hint="Size.Md" />
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <ControlledSwitch {...args} disabled label="Disabled, off" />
      <ControlledSwitch {...args} disabled checked label="Disabled, on" />
    </div>
  ),
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  args: { checked: true, hint: "Label colours are tokenised." },
};

export const Stacked: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <ControlledSwitch {...args} label="Autosave" hint="Every edit." />
      <ControlledSwitch
        {...args}
        checked
        label="Show gizmos"
        hint="Joint helpers."
      />
      <ControlledSwitch
        {...args}
        label="Strict validation"
        hint="Fail on warnings."
      />
    </div>
  ),
};
