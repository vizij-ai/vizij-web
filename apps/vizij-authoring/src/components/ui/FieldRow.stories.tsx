import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, FieldRow, Input, Switch } from "./index";

function StatefulSwitch(props: { label?: string; hint?: string }) {
  const [on, setOn] = useState(false);
  return <Switch {...props} checked={on} onChange={setOn} />;
}

function StatefulInput() {
  const [value, setValue] = useState("rig_v2");
  return (
    <Input
      size="sm"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      className="w-40"
    />
  );
}

const meta = {
  title: "UI/FieldRow",
  component: FieldRow,
  parameters: {
    docs: {
      description: {
        component:
          "Label/hint on the left, control on the right. `renderLabelInControl` instead *clones* the control and injects `label`/`hint` into it, so it only works with controls that accept those props (`Switch`, `Checkbox`). `FieldRowProps` is not exported.",
      },
    },
  },
  argTypes: {
    align: { control: "inline-radio", options: ["center", "start"] },
    renderLabelInControl: { control: "boolean" },
  },
  args: {
    label: "Autosave",
    control: <StatefulSwitch />,
  },
  render: (args) => (
    <div className="max-w-md divide-y divide-border-default/60">
      <FieldRow {...args} />
    </div>
  ),
} satisfies Meta<typeof FieldRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: {
    hint: "Working state is written to local storage after every edit.",
  },
};

export const AlignStart: Story = {
  args: {
    align: "start",
    hint: "Long hints read better with the control top-aligned to the label block.",
  },
};

/**
 * The label and hint are cloned into the control instead of rendered beside it,
 * and the row switches to `justify-start`.
 */
export const LabelInControl: Story = {
  args: {
    renderLabelInControl: true,
    hint: "Cloned onto the Switch as its own label/hint.",
  },
};

export const TextControl: Story = {
  args: { label: "Bundle name", control: <StatefulInput /> },
};

export const ActionControl: Story = {
  args: {
    label: "Reset working state",
    hint: "Discards unsaved edits.",
    control: (
      <Button variant="danger" size="sm">
        Reset
      </Button>
    ),
  },
};

export const Stacked: Story = {
  render: (args) => (
    <div className="max-w-md divide-y divide-border-default/60">
      <FieldRow {...args} label="Autosave" control={<StatefulSwitch />} />
      <FieldRow
        label="Show gizmos"
        hint="Draw joint helpers in the viewport."
        control={<StatefulSwitch />}
      />
      <FieldRow label="Bundle name" control={<StatefulInput />} />
    </div>
  ),
};
