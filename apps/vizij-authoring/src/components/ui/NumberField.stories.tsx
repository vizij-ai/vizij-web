import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { NumberField } from "./NumberField";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-55";

const meta: Meta<typeof NumberField> = {
  title: "UI/NumberField",
  component: NumberField,
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof NumberField> = {
  render: (args) => {
    const [v, setV] = useState(0.6);
    return <NumberField {...args} value={v} onChange={setV} min={0} max={1} step={0.01} />;
  },
};
