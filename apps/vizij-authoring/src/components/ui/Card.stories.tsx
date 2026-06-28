import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardTitle } from "./Card";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-3";

const meta: Meta<typeof Card> = {
  title: "UI/Card",
  component: Card,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card style={{ width: 280 }}>
      <CardHeader>
        <CardTitle>Card title</CardTitle>
      </CardHeader>
      <div style={{ padding: "0 16px 16px", fontSize: 13, color: "var(--text-secondary)" }}>
        Supporting body text that wraps inside the card.
      </div>
    </Card>
  ),
};
