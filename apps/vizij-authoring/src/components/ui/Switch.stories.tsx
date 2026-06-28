import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./Switch";

const meta: Meta<typeof Switch> = {
  title: "UI/Switch",
  component: Switch,
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-22",
    },
  },
};
export default meta;

type Story = StoryObj<typeof Switch>;

const Interactive = (args: { size?: "sm" | "md"; disabled?: boolean; label?: string }) => {
  const [on, setOn] = useState(true);
  return <Switch {...args} checked={on} onChange={setOn} />;
};

export const On: Story = { render: () => <Interactive label="Enabled" /> };
export const Sizes: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <Interactive size="sm" />
      <Interactive size="md" />
    </div>
  ),
};
export const Disabled: Story = { render: () => <Interactive disabled label="Disabled" /> };
