import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "UI/Badge",
  component: Badge,
  args: { children: "Badge" },
  argTypes: { tone: { control: "inline-radio", options: ["accent", "info", "muted"] } },
  parameters: {
    design: {
      type: "figma",
      url: "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-30",
    },
  },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Accent: Story = { args: { tone: "accent" } };
export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 10 }}>
      <Badge tone="accent">Badge</Badge>
      <Badge tone="info">Badge</Badge>
      <Badge tone="muted">Badge</Badge>
    </div>
  ),
};
