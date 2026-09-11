import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Checkbox } from "./index";
import type { CheckboxProps } from "./index";

/**
 * `Checkbox` is fully controlled (`checked` + `onChange`), so a static `checked`
 * arg would make it look frozen. This wrapper owns the state and seeds it from
 * the `checked` arg.
 */
function ControlledCheckbox({
  checked: initial,
  onChange,
  ...rest
}: CheckboxProps) {
  const [checked, setChecked] = useState(initial);
  return (
    <Checkbox
      {...rest}
      checked={checked}
      onChange={(next) => {
        setChecked(next);
        onChange(next);
      }}
    />
  );
}

const meta = {
  title: "UI/Checkbox",
  component: Checkbox,
  parameters: {
    docs: {
      description: {
        component:
          'Checkbox on `@semio/ui`\'s `Checkbox` (Radix underneath, so `role="checkbox"` is preserved). The label is app-owned because semio has no label slot — which is also why `label` is a `ReactNode`.',
      },
    },
  },
  argTypes: {
    checked: { control: "boolean" },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    checked: false,
    label: "Bake root motion",
    id: "checkbox-story",
    onChange: fn(),
  },
  render: (args) => <ControlledCheckbox {...args} />,
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  args: { checked: true },
};

export const WithoutLabel: Story = {
  args: { label: undefined, id: undefined },
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <ControlledCheckbox
        {...args}
        id="checkbox-disabled-off"
        disabled
        checked={false}
        label="Disabled, unchecked"
      />
      <ControlledCheckbox
        {...args}
        id="checkbox-disabled-on"
        disabled
        checked
        label="Disabled, checked"
      />
    </div>
  ),
};

/**
 * With no `id` the label toggles via its own `onClick`; with an `id` it toggles
 * via `htmlFor`. Both paths are exercised here — passing both used to
 * double-fire and cancel out.
 */
export const LabelClickPaths: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <ControlledCheckbox
        {...args}
        id="checkbox-with-id"
        label="Has an id (htmlFor)"
      />
      <ControlledCheckbox {...args} id={undefined} label="No id (onClick)" />
    </div>
  ),
};

export const RichLabel: Story = {
  args: {
    label: (
      <span>
        Include <code className="text-accent">rootBounds</code> in export
      </span>
    ),
  },
};
