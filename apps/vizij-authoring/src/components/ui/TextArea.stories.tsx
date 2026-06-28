import type { Meta, StoryObj } from "@storybook/react";
import { TextArea } from "./TextArea";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-52";

const meta: Meta<typeof TextArea> = {
  title: "UI/TextArea",
  component: TextArea,
  args: { placeholder: "Multi-line text…", rows: 3 },
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

type Story = StoryObj<typeof TextArea>;

export const Default: Story = { render: (args) => <div style={{ width: 240 }}><TextArea {...args} /></div> };
