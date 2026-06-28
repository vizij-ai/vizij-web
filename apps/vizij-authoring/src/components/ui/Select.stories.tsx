import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./Select";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const options = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

const meta: Meta<typeof Select> = {
  title: "UI/Select",
  component: Select,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof Select> = {
  render: () => {
    const [v, setV] = useState("a");
    return (
      <div style={{ width: 220 }}>
        <Select value={v} onChange={setV} options={options} label="Choose" />
      </div>
    );
  },
};
