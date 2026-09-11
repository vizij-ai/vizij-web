import { useState } from "react";
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChannelLockButton } from "./ChannelLockButton";

const meta = {
  title: "Editor/atoms/ChannelLockButton",
  component: ChannelLockButton,
  parameters: {
    docs: {
      description: {
        component:
          "Icon-only padlock for a property row or channel. Colour comes from `--editor-locked` / `--editor-unlocked` rather than a fixed palette, which is what makes it legible in both themes — the inline version it replaced used `rose-300`/`sky-300` and vanished on light surfaces.",
      },
    },
  },
  argTypes: {
    locked: { control: "boolean" },
    disabled: { control: "boolean" },
    iconSize: { control: { type: "range", min: 8, max: 24, step: 1 } },
  },
  args: {
    locked: false,
    disabled: false,
    title: "Lock Position",
    onToggle: fn(),
  },
} satisfies Meta<typeof ChannelLockButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unlocked: Story = {};

export const Locked: Story = {
  args: { locked: true, title: "Unlock Position" },
};

export const Disabled: Story = {
  args: {
    disabled: true,
    title: "Nothing bound to this property yet",
  },
  parameters: {
    docs: {
      description: {
        story:
          "A row whose channels are not bound to anything has nothing to lock. `useRowLock` reports `canToggle: false` for exactly this case.",
      },
    },
  },
};

function Interactive() {
  const [locked, setLocked] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <ChannelLockButton
        locked={locked}
        title={locked ? "Unlock Position" : "Lock Position"}
        onToggle={() => setLocked((prev) => !prev)}
      />
      <span className="text-[11px] text-text-secondary">
        Position is {locked ? "locked" : "editable"}
      </span>
    </div>
  );
}

export const Interactivity: Story = {
  render: () => <Interactive />,
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      {[10, 12, 16, 20].map((iconSize) => (
        <ChannelLockButton
          key={iconSize}
          {...args}
          locked
          iconSize={iconSize}
        />
      ))}
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "`iconSize` 10 is the dense inspector row; 12 suits a section header.",
      },
    },
  },
};

const OVERRIDDEN_TOKENS: CSSProperties = {
  // A consuming editor with a completely different brand: locked reads as a hot
  // magenta, unlocked as a cool teal. Neither is anywhere in vizij's palette,
  // so if these colours show up the component is genuinely reading its tokens.
  "--editor-locked": "#ff3d9a",
  "--editor-unlocked": "#00d3b8",
} as CSSProperties;

export const OverriddenTokens: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="w-28 text-[11px] text-text-secondary">Default</span>
        <ChannelLockButton {...args} locked iconSize={16} />
        <ChannelLockButton {...args} locked={false} iconSize={16} />
      </div>
      <div className="flex items-center gap-3" style={OVERRIDDEN_TOKENS}>
        <span className="w-28 text-[11px] text-text-secondary">Overridden</span>
        <ChannelLockButton {...args} locked iconSize={16} />
        <ChannelLockButton {...args} locked={false} iconSize={16} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "The portability story: `--editor-locked` and `--editor-unlocked` set on an ancestor rebrand the control with no prop changes and no specificity fight. Hover either row — the tint follows the overridden colour too, because it is mixed from the same custom property.",
      },
    },
  },
};
