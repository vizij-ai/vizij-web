import { Info } from "lucide-react";
import type { Meta, StoryObj } from "@storybook/react";
import { InstructionCallout } from "./InstructionCallout";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof InstructionCallout> = {
  title: "Common/InstructionCallout",
  component: InstructionCallout,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Collapsed: StoryObj<typeof InstructionCallout> = {
  render: () => (
    <div style={{ width: 360 }}>
      <InstructionCallout label="Getting started" summary="Read before you begin" icon={<Info className="h-4 w-4" />}>
        <p>Pick a face, then add controls. Each control drives one or more channels.</p>
      </InstructionCallout>
    </div>
  ),
};

export const Expanded: StoryObj<typeof InstructionCallout> = {
  render: () => (
    <div style={{ width: 360 }}>
      <InstructionCallout label="Getting started" summary="Read before you begin" defaultOpen icon={<Info className="h-4 w-4" />}>
        <p>Pick a face, then add controls. Each control drives one or more channels.</p>
      </InstructionCallout>
    </div>
  ),
};
