import type { Meta, StoryObj } from "@storybook/react";
import { FieldRow } from "./FieldRow";
import { Input } from "./Input";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-50";

const meta: Meta<typeof FieldRow> = {
  title: "UI/FieldRow",
  component: FieldRow,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

type Story = StoryObj<typeof FieldRow>;

export const Default: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <FieldRow label="Label" control={<Input placeholder="value" />} />
    </div>
  ),
};
