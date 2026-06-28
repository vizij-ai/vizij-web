import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Slider } from "./Slider";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof Slider> = {
  title: "UI/Slider",
  component: Slider,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

const Demo = (p: { fillMode?: "none" | "value" }) => {
  const [v, setV] = useState(0.5);
  return (
    <div style={{ width: 260 }}>
      <Slider
        value={v}
        min={0}
        max={1}
        step={0.01}
        onChange={(n) => setV(Array.isArray(n) ? n[0] : n)}
        {...p}
      />
    </div>
  );
};

export const Default: StoryObj<typeof Slider> = { render: () => <Demo /> };
export const Filled: StoryObj<typeof Slider> = { render: () => <Demo fillMode="value" /> };
