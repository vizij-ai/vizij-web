import type { Meta, StoryObj } from "@storybook/react";
import { Chip } from "./Chip";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const meta: Meta<typeof Chip> = {
  title: "UI/Chip",
  component: Chip,
  args: { children: "Chip" },
  argTypes: {
    tone: {
      control: "inline-radio",
      options: ["default", "info", "success", "warning", "danger", "muted"],
    },
    dismissable: { control: "boolean" },
  },
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

type Story = StoryObj<typeof Chip>;

export const Default: Story = { args: { tone: "default" } };
export const AllTones: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {(["default", "info", "success", "warning", "danger", "muted"] as const).map((t) => (
        <Chip key={t} tone={t}>{t}</Chip>
      ))}
    </div>
  ),
};
