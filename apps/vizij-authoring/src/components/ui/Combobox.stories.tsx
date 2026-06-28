import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Combobox } from "./Combobox";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const options = [
  { value: "smile", label: "smile" },
  { value: "blink", label: "blink" },
  { value: "gaze", label: "gaze" },
];

const meta: Meta<typeof Combobox> = {
  title: "UI/Combobox",
  component: Combobox,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof Combobox> = {
  render: () => {
    const [v, setV] = useState<string | null>(null);
    const [q, setQ] = useState("");
    return (
      <div style={{ width: 240 }}>
        <Combobox
          value={v}
          onChange={setV}
          options={options}
          query={q}
          onQueryChange={setQ}
          placeholder="Search & pick…"
        />
      </div>
    );
  },
};
