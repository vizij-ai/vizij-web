import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { TreeRow } from "./TreeRow";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof TreeRow> = {
  title: "UI/TreeRow",
  component: TreeRow,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof TreeRow> = {
  render: () => {
    const [open, setOpen] = useState(true);
    const [sel, setSel] = useState("left-eye");
    return (
      <div style={{ width: 280 }}>
        <TreeRow
          depth={0}
          hasChildren
          isExpanded={open}
          label="Face"
          onToggle={() => setOpen((o) => !o)}
          isSelected={sel === "face"}
          onSelect={() => setSel("face")}
        />
        {open && (
          <>
            <TreeRow
              depth={1}
              hasChildren={false}
              label="Left eye"
              onToggle={() => {}}
              isSelected={sel === "left-eye"}
              onSelect={() => setSel("left-eye")}
            />
            <TreeRow
              depth={1}
              hasChildren={false}
              label="Right eye"
              onToggle={() => {}}
              isSelected={sel === "right-eye"}
              onSelect={() => setSel("right-eye")}
            />
          </>
        )}
      </div>
    );
  },
};
