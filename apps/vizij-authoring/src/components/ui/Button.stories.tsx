import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "UI/Button",
  component: Button,
  args: { children: "Button" },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "subtle", "danger", "ghost"],
    },
    size: { control: "select", options: ["sm", "md", "lg", "icon"] },
    pill: { control: "boolean" },
  },
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-16",
    },
  },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary" } };
export const Secondary: Story = { args: { variant: "secondary" } };
export const Subtle: Story = { args: { variant: "subtle" } };
export const Danger: Story = { args: { variant: "danger" } };
export const Ghost: Story = { args: { variant: "ghost" } };

export const AllVariants: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button {...args} variant="primary">Button</Button>
      <Button {...args} variant="secondary">Button</Button>
      <Button {...args} variant="subtle">Button</Button>
      <Button {...args} variant="danger">Button</Button>
      <Button {...args} variant="ghost">Button</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button {...args} size="sm">Small</Button>
      <Button {...args} size="md">Medium</Button>
      <Button {...args} size="lg">Large</Button>
    </div>
  ),
};
