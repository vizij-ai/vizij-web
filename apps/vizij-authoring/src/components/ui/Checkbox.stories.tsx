import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Checkbox } from "./Checkbox";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-42";

const meta: Meta<typeof Checkbox> = {
  title: "UI/Checkbox",
  component: Checkbox,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

const Demo = (p: { label?: string; disabled?: boolean }) => {
  const [c, setC] = useState(true);
  return <Checkbox checked={c} onChange={setC} {...p} />;
};

export const Default: StoryObj<typeof Checkbox> = { render: () => <Demo label="Enabled" /> };
export const Disabled: StoryObj<typeof Checkbox> = { render: () => <Demo label="Disabled" disabled /> };
