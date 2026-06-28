import type { Meta, StoryObj } from "@storybook/react";
import { CollapsibleGroup } from "./CollapsibleGroup";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof CollapsibleGroup> = {
  title: "UI/CollapsibleGroup",
  component: CollapsibleGroup,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof CollapsibleGroup> = {
  render: () => (
    <div style={{ width: 300 }}>
      <CollapsibleGroup title="Transform" subtitle="Position, rotation, scale" itemCount={3}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Group contents.</div>
      </CollapsibleGroup>
    </div>
  ),
};

export const Collapsed: StoryObj<typeof CollapsibleGroup> = {
  render: () => (
    <div style={{ width: 300 }}>
      <CollapsibleGroup title="Appearance" itemCount={5} defaultCollapsed>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Hidden until expanded.</div>
      </CollapsibleGroup>
    </div>
  ),
};
