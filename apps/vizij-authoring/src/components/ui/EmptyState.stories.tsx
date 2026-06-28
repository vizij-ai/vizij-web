import type { Meta, StoryObj } from "@storybook/react";
import { Layers } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { Button } from "./Button";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof EmptyState> = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof EmptyState> = {
  render: () => (
    <div style={{ width: 420 }}>
      <EmptyState
        icon={Layers}
        title="No layers yet"
        description="Add a face element to start building your design."
        action={<Button variant="primary">Add element</Button>}
      />
    </div>
  ),
};
