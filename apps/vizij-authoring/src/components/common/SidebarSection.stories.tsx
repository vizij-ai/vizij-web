import type { Meta, StoryObj } from "@storybook/react";
import { SidebarSection } from "./SidebarSection";
import { FieldRow } from "../ui/FieldRow";
import { Input } from "../ui/Input";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof SidebarSection> = {
  title: "Common/SidebarSection",
  component: SidebarSection,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof SidebarSection> = {
  render: () => (
    <div style={{ width: 320 }}>
      <SidebarSection title="Transform" description="Position, rotation and scale of the selected element.">
        <FieldRow label="X" control={<Input defaultValue="0" />} />
        <FieldRow label="Y" control={<Input defaultValue="0" />} />
      </SidebarSection>
    </div>
  ),
};

export const WithInstructions: StoryObj<typeof SidebarSection> = {
  render: () => (
    <div style={{ width: 320 }}>
      <SidebarSection
        title="Rigging"
        description="Bind controls to face channels."
        instructions={{
          label: "How rigging works",
          summary: "Map a control to one or more channels",
          content: <p>Drag a control onto a channel, then tune its range and easing.</p>,
        }}
        defaultInstructionsOpen
      >
        <FieldRow label="Channel" control={<Input defaultValue="smile" />} />
      </SidebarSection>
    </div>
  ),
};
