import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof Input> = {
  title: "UI/Input",
  component: Input,
  args: { placeholder: "Placeholder" },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = { render: (args) => <div style={{ width: 240 }}><Input {...args} /></div> };
export const Disabled: Story = { render: (args) => <div style={{ width: 240 }}><Input {...args} disabled /></div> };
