import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Chip } from "./index";

const TONES = [
  "default",
  "info",
  "success",
  "warning",
  "danger",
  "muted",
] as const;

function DismissableChips() {
  const [tags, setTags] = useState<string[]>([
    "head",
    "left_arm",
    "right_arm",
    "torso",
  ]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <Chip
          key={tag}
          tone="info"
          dismissable
          onDismiss={() => setTags((prev) => prev.filter((t) => t !== tag))}
        >
          {tag}
        </Chip>
      ))}
      {tags.length === 0 && (
        <button
          type="button"
          className="text-xs text-accent underline"
          onClick={() => setTags(["head", "left_arm", "right_arm", "torso"])}
        >
          Reset
        </button>
      )}
    </div>
  );
}

const meta = {
  title: "UI/Chip",
  component: Chip,
  parameters: {
    docs: {
      description: {
        component:
          "Small uppercase tag with an optional dismiss affordance. All six tones are hardcoded Tailwind palette colours rather than tokens.",
      },
    },
  },
  argTypes: {
    tone: { control: "select", options: TONES },
    dismissable: { control: "boolean" },
    onDismiss: { action: "dismissed" },
  },
  args: { children: "binding", tone: "default" },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      {TONES.map((tone) => (
        <Chip key={tone} {...args} tone={tone}>
          {tone}
        </Chip>
      ))}
    </div>
  ),
};

/**
 * The `zinc-*` surfaces on `default` and `muted` are fixed, not tokenised, so
 * they read as dark chips on a light canvas.
 */
export const TonesOnLightCanvas: Story = {
  globals: { theme: "light" },
  render: (args) => (
    <div className="flex flex-wrap items-center gap-2">
      {TONES.map((tone) => (
        <Chip key={tone} {...args} tone={tone}>
          {tone}
        </Chip>
      ))}
    </div>
  ),
};

export const Dismissable: Story = {
  args: { dismissable: true },
};

export const DismissableList: Story = {
  render: () => <DismissableChips />,
};
