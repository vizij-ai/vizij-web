import type { Meta, StoryObj } from "@storybook/react";
import { ListRow } from "./ListRow";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-37";

const meta: Meta<typeof ListRow> = {
  title: "UI/ListRow",
  component: ListRow,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

type Story = StoryObj<typeof ListRow>;

export const Default: Story = {
  render: () => (
    <div style={{ width: 280 }}>
      <ListRow title="List row" meta="meta" description="Supporting description." />
    </div>
  ),
};
