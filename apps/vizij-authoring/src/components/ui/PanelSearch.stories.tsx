import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { PanelSearch } from "./PanelSearch";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=19-67";

const meta: Meta<typeof PanelSearch> = {
  title: "UI/PanelSearch",
  component: PanelSearch,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof PanelSearch> = {
  render: () => {
    const [q, setQ] = useState("");
    return (
      <div style={{ width: 280 }}>
        <PanelSearch value={q} onChange={setQ} placeholder="Search layers…" />
      </div>
    );
  },
};
