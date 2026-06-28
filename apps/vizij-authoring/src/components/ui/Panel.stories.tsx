import type { Meta, StoryObj } from "@storybook/react";
import { Panel } from "./Panel";
import { Button } from "./Button";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof Panel> = {
  title: "UI/Panel",
  component: Panel,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof Panel> = {
  render: () => (
    <div style={{ width: 320 }}>
      <Panel
        title="Properties"
        description="Tune the selected element"
        badge="3"
        actions={<Button variant="ghost" size="sm">Reset</Button>}
      >
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Panel body content.</div>
      </Panel>
    </div>
  ),
};
