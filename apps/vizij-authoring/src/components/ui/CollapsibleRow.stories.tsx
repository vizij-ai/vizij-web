import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { CollapsibleRow } from "./CollapsibleRow";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-44";

const meta: Meta<typeof CollapsibleRow> = {
  title: "UI/CollapsibleRow",
  component: CollapsibleRow,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof CollapsibleRow> = {
  render: () => {
    const [v, setV] = useState(0.8);
    return (
      <div style={{ width: 360 }}>
        <CollapsibleRow
          id="opacity"
          title="Opacity"
          subtitle="Layer transparency"
          value={v}
          onValueChange={setV}
          min={0}
          max={1}
          step={0.01}
          defaultExpanded
          expandedContent={
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              Expanded detail content for this row.
            </div>
          }
        />
      </div>
    );
  },
};
