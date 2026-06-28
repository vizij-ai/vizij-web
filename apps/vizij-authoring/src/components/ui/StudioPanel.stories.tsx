import type { Meta, StoryObj } from "@storybook/react";
import { StudioPanel } from "./StudioPanel";
import { Button } from "./Button";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=20-7";

const meta: Meta<typeof StudioPanel> = {
  title: "UI/StudioPanel",
  component: StudioPanel,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof StudioPanel> = {
  render: () => (
    <div style={{ width: 320, height: 280, display: "flex" }}>
      <StudioPanel
        title="Layers"
        description="Stacked face elements"
        actions={<Button variant="ghost" size="sm">+ Add</Button>}
      >
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Scrollable panel body.</div>
      </StudioPanel>
    </div>
  ),
};
