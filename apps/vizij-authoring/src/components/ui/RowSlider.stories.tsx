import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { RowSlider } from "./RowSlider";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-60";

const meta: Meta<typeof RowSlider> = {
  title: "UI/RowSlider",
  component: RowSlider,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof RowSlider> = {
  render: () => {
    const [v, setV] = useState(60);
    return (
      <div style={{ width: 260 }}>
        <RowSlider value={v} min={0} max={100} step={1} onChange={setV} label="Value" />
      </div>
    );
  },
};
