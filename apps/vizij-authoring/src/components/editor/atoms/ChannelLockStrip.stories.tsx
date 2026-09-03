import { useState } from "react";
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ChannelLockStrip } from "./ChannelLockStrip";

const meta = {
  title: "Editor/atoms/ChannelLockStrip",
  component: ChannelLockStrip,
  parameters: {
    docs: {
      description: {
        component:
          "The per-channel lock pills under a vector or colour property row. Unlocked is the *accented* state here — the inverse of `ChannelLockButton` — because what the accent marks is what you can still edit.",
      },
    },
  },
  args: {
    onToggle: fn(),
    channels: [
      { id: "cube:position:x", shortLabel: "X", locked: false },
      { id: "cube:position:y", shortLabel: "Y", locked: true },
      { id: "cube:position:z", shortLabel: "Z", locked: false },
    ],
  },
} satisfies Meta<typeof ChannelLockStrip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vector: Story = {};

export const Colour: Story = {
  args: {
    channels: [
      { id: "mat:color:r", shortLabel: "R", locked: false },
      { id: "mat:color:g", shortLabel: "G", locked: false },
      { id: "mat:color:b", shortLabel: "B", locked: false },
    ],
  },
};

export const AllLocked: Story = {
  args: {
    channels: [
      { id: "cube:position:x", shortLabel: "X", locked: true },
      { id: "cube:position:y", shortLabel: "Y", locked: true },
      { id: "cube:position:z", shortLabel: "Z", locked: true },
    ],
  },
};

export const UnboundChannel: Story = {
  args: {
    channels: [
      { id: "cube:scale:x", shortLabel: "X", locked: false },
      { id: null, shortLabel: "Y", locked: false, title: "Not bound yet" },
      { id: "cube:scale:z", shortLabel: "Z", locked: false },
    ],
  },
  parameters: {
    docs: {
      description: {
        story:
          "`id: null` marks a channel that exists but has nothing bound to it. The pill renders disabled rather than being omitted, so the strip keeps its X/Y/Z alignment with the value row above it.",
      },
    },
  },
};

const INITIAL = [
  { id: "cube:rotation:x", shortLabel: "X", locked: false },
  { id: "cube:rotation:y", shortLabel: "Y", locked: false },
  { id: "cube:rotation:z", shortLabel: "Z", locked: false },
];

function Interactive() {
  const [channels, setChannels] = useState(INITIAL);
  return (
    <div className="flex w-64 flex-col gap-2">
      <ChannelLockStrip
        channels={channels}
        onToggle={(id, nextLocked) =>
          setChannels((prev) =>
            prev.map((channel) =>
              channel.id === id ? { ...channel, locked: nextLocked } : channel,
            ),
          )
        }
      />
      <p className="text-[11px] text-text-secondary">
        Editable:{" "}
        {channels
          .filter((channel) => !channel.locked)
          .map((channel) => channel.shortLabel)
          .join(", ") || "none"}
      </p>
    </div>
  );
}

export const Interactivity: Story = {
  render: () => <Interactive />,
};

const OVERRIDDEN_TOKENS: CSSProperties = {
  "--editor-accent": "#00d3b8",
  "--editor-row-bg": "#3b1d4d",
  "--editor-muted-fg": "#c8a6dd",
} as CSSProperties;

export const OverriddenTokens: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <div className="flex w-64 flex-col gap-1">
        <span className="text-[11px] text-text-secondary">Default</span>
        <ChannelLockStrip {...args} />
      </div>
      <div className="flex w-64 flex-col gap-1" style={OVERRIDDEN_TOKENS}>
        <span className="text-[11px] text-text-secondary">Overridden</span>
        <ChannelLockStrip {...args} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Both states are themeable: `--editor-accent` drives the editable pill, `--editor-row-bg` and `--editor-muted-fg` the locked one. All three are mixed rather than used flat, so an override changes the surface and its hover together.",
      },
    },
  },
};
