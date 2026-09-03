import { useState } from "react";
import type { CSSProperties } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChannelLockButton } from "../atoms/ChannelLockButton";
import { ChannelLockStrip } from "../atoms/ChannelLockStrip";
import { useRowLock } from "./useRowLock";

/**
 * A host's lock storage. In vizij this is a `Set` on a zustand store reached
 * through `useInspectorTargetLock`; here it is `useState`, which is the point —
 * `useRowLock` never learns which.
 */
function useLockSet(initial: string[] = []) {
  const [locked, setLocked] = useState(() => new Set(initial));
  return {
    isTargetLocked: (targetId: string) => locked.has(targetId),
    setTargetLocked: (targetId: string, next: boolean) =>
      setLocked((prev) => {
        const draft = new Set(prev);
        if (next) {
          draft.add(targetId);
        } else {
          draft.delete(targetId);
        }
        return draft;
      }),
  };
}

const CHANNELS = [
  { id: "cube:position:x", shortLabel: "X" },
  { id: "cube:position:y", shortLabel: "Y" },
  { id: "cube:position:z", shortLabel: "Z" },
];

function VectorRow({ label = "Position" }: { label?: string }) {
  const source = useLockSet(["cube:position:y"]);
  const rowLock = useRowLock(
    CHANNELS.map((channel) => channel.id),
    source,
  );

  return (
    <div className="flex w-80 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <ChannelLockButton
          locked={rowLock.isLocked}
          disabled={!rowLock.canToggle}
          title={
            rowLock.isLocked ? `Unlock ${label}` : `Lock ${label} channels`
          }
          onToggle={rowLock.toggle}
        />
      </div>
      <ChannelLockStrip
        channels={CHANNELS.map((channel) => ({
          ...channel,
          locked: source.isTargetLocked(channel.id),
          title: `Toggle ${channel.shortLabel} channel lock`,
        }))}
        onToggle={source.setTargetLocked}
      />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono text-text-secondary">
        <dt>isLocked</dt>
        <dd>{String(rowLock.isLocked)}</dd>
        <dt>isPartiallyLocked</dt>
        <dd>{String(rowLock.isPartiallyLocked)}</dd>
        <dt>lockedCount</dt>
        <dd>
          {rowLock.lockedCount} / {rowLock.lockableTargetIds.length}
        </dd>
      </dl>
    </div>
  );
}

const meta = {
  title: "Editor/hooks/useRowLock",
  parameters: {
    docs: {
      description: {
        component:
          "Aggregates lock state for a row that owns one or more channels. It answers the two questions every lock affordance needs — *are all of these locked?* and *what does toggling the row mean when only some are?* — and takes its storage as two callbacks, so it works against a store, a Set, or a server.",
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RowAndChannels: Story = {
  render: () => <VectorRow />,
  parameters: {
    docs: {
      description: {
        story:
          "Y starts locked, so the row is *partially* locked: the row padlock reads unlocked and pressing it locks everything. Press it again and everything unlocks — all-or-nothing is deliberate, since a partial state has no obvious single next step.",
      },
    },
  },
};

function SingleChannelRow() {
  const source = useLockSet();
  const rowLock = useRowLock(["morph:smile"], source);
  return (
    <div className="flex items-center gap-2">
      <ChannelLockButton
        locked={rowLock.isLocked}
        title={rowLock.isLocked ? "Unlock Smile" : "Lock Smile"}
        onToggle={rowLock.toggle}
      />
      <span className="text-[11px] text-text-secondary">
        Smile is {rowLock.isLocked ? "locked" : "editable"}
      </span>
    </div>
  );
}

export const SingleChannel: Story = {
  render: () => <SingleChannelRow />,
  parameters: {
    docs: {
      description: {
        story:
          "A scalar row is the same hook with one id — no separate single-target path, which is what let four hand-written copies of this logic collapse into one.",
      },
    },
  },
};

function UnboundRow() {
  const source = useLockSet();
  // Every channel unbound: nothing is lockable, so the control disables itself.
  const rowLock = useRowLock([null, undefined, ""], source);
  return (
    <div className="flex items-center gap-2">
      <ChannelLockButton
        locked={rowLock.isLocked}
        disabled={!rowLock.canToggle}
        title="Nothing bound to this property yet"
        onToggle={rowLock.toggle}
      />
      <span className="text-[11px] text-text-secondary">
        canToggle: {String(rowLock.canToggle)}
      </span>
    </div>
  );
}

export const NothingLockable: Story = {
  render: () => <UnboundRow />,
  parameters: {
    docs: {
      description: {
        story:
          "`null`, `undefined` and blank ids are dropped, so callers pass `component?.targetId` without guarding and get `canToggle: false` for free.",
      },
    },
  },
};

const OVERRIDDEN_TOKENS: CSSProperties = {
  "--editor-locked": "#ff3d9a",
  "--editor-unlocked": "#00d3b8",
  "--editor-accent": "#00d3b8",
  "--editor-row-bg": "#3b1d4d",
  "--editor-muted-fg": "#c8a6dd",
} as CSSProperties;

export const OverriddenTokens: Story = {
  render: () => (
    <div style={OVERRIDDEN_TOKENS}>
      <VectorRow label="Position (rebranded)" />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "The hook itself has no styling; this story exists to show the whole row — padlock and pills together — surviving a host theme it has never seen.",
      },
    },
  },
};
