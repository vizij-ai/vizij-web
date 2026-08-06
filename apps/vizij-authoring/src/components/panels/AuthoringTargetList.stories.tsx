import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import {
  AuthoringTargetList,
  type AuthoringTargetItem,
} from "./AuthoringTargetList";

const ITEMS: readonly AuthoringTargetItem[] = [
  {
    id: "animation:wave",
    label: "wave_hello",
    source: "authored",
    selected: true,
    meta: "3 tracks · 42 keyframes",
    runtimeState: "playing",
    runtimeTimeLabel: "0:02 / 0:04",
  },
  {
    id: "animation:nod",
    label: "nod_yes",
    source: "authored",
    meta: "1 track · 8 keyframes",
    runtimeState: "paused",
    runtimeTimeLabel: "0:01 / 0:02",
  },
  {
    id: "animation:blink_loop",
    label: "blink_loop",
    source: "imported",
    meta: "quori_face.glb · 2 tracks",
    runtimeState: "stopped",
  },
  {
    id: "animation:idle_sway",
    label: "idle_sway",
    source: "imported",
    meta: "quori_body.glb · 6 tracks",
  },
];

/** The panel is `h-full`, so every story needs a sized shell to live in. */
const Shell = ({
  children,
  width = 340,
}: {
  children: React.ReactNode;
  width?: number;
}) => (
  <div
    className="flex h-[420px] flex-col overflow-hidden rounded-md border border-border-default bg-bg-panel"
    style={{ width }}
  >
    {children}
  </div>
);

const meta = {
  title: "Editor Tools/AuthoringTargetList",
  component: AuthoringTargetList,
  parameters: {
    docs: {
      description: {
        component:
          'The left-hand list of authoring targets — animations or programs — with a create/copy/delete action row above it, a search box, source filters, and one `ui/ListRow` card per item.\n\nThis is a **pure props** panel: it reads no store, so what you see here is exactly what the app renders. Search text and the active source filter are its only internal state; the selected item, the item list and every callback come from the caller.\n\n**What to look for.** The rows were just moved onto `ListRow`\'s `selected` / `onSelect` / `selectable` API, so the things worth checking are the selection surface (accent border over a faint accent fill on the selected row), the hover surface on the unselected rows, and keyboard reach — press Tab into the story and each row takes focus in turn as a `role="button"`, activating on Enter or Space. Also check that clicking a button *inside* a row (Play, Copy, Delete) does not leak into row selection: `AuthoringTargetList` stops propagation on all of them, except that the transport buttons deliberately select the row first before acting.\n\nEvery row here is selectable. `ListRow` also supports `selectable={false}` for an inert row, but `AuthoringTargetList` never passes it, so there is no story for it — see `UI/ListRow` instead.',
      },
    },
  },
  args: {
    kindLabel: "Animation",
    emptyDescription: "Create one to get started, or import a GLB.",
    items: ITEMS,
    onCreate: fn(),
    onDelete: fn(),
    onDuplicate: fn(),
    onPause: fn(),
    onPlay: fn(),
    onSelect: fn(),
    onStop: fn(),
  },
  render: (args) => (
    <Shell>
      <AuthoringTargetList {...args} />
    </Shell>
  ),
} satisfies Meta<typeof AuthoringTargetList>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * A populated list with `wave_hello` selected. Compare its surface against the
 * three rows below it, and hover those to see the hover surface.
 */
export const Default: Story = {};

/** Nothing selected, so the header's Copy and Delete are disabled. */
export const NothingSelected: Story = {
  args: {
    items: ITEMS.map((item) => ({ ...item, selected: false })),
  },
};

/**
 * No items at all. The `EmptyState` fills the scroll area while the action row,
 * search box and filters stay put — the create affordance must not disappear with
 * the list.
 *
 * (The same empty area appears when a search or filter matches nothing. That path
 * is only reachable by typing, so it has no story of its own: type "zzz" into the
 * search box in any other story to see it.)
 */
export const Empty: Story = {
  args: { items: [] },
};

/**
 * All three runtime states side by side. A stopped row offers Play; an active row
 * offers Pause and Stop instead, and Pause is disabled once it is already paused.
 * The badges echo the same state.
 */
export const TransportStates: Story = {
  args: {
    items: [
      {
        id: "program:live",
        label: "live_program",
        source: "authored",
        selected: true,
        runtimeState: "playing",
        runtimeTimeLabel: "0:03",
      },
      {
        id: "program:held",
        label: "held_program",
        source: "authored",
        runtimeState: "paused",
        runtimeTimeLabel: "0:01",
      },
      {
        id: "program:idle",
        label: "idle_program",
        source: "imported",
        runtimeState: "stopped",
      },
    ],
    kindLabel: "Program",
  },
};

/**
 * Only `onCreate` and `onSelect` supplied. Every optional callback is a rendering
 * gate: the header collapses to a single New button and the rows lose their action
 * strip entirely, leaving selection as the only interaction.
 */
export const NoOptionalActions: Story = {
  args: {
    items: ITEMS,
    onDelete: undefined,
    onDuplicate: undefined,
    onPause: undefined,
    onPlay: undefined,
    onStop: undefined,
  },
};

/**
 * Long names and long `meta` strings in a narrow panel. Both truncate rather than
 * widening the row, so the badges stay visible and the action strip stays inside
 * the panel.
 */
export const LongLabelsTruncate: Story = {
  args: {
    items: [
      {
        id: "animation:long",
        label: "quori_face_expressive_greeting_sequence_v3_final",
        source: "authored",
        selected: true,
        meta: "rig/quori-face/standard/mouth/lower_lip_depressor_left · 9 tracks",
        runtimeState: "stopped",
      },
      {
        id: "animation:short",
        label: "nod",
        source: "imported",
        meta: "2 tracks",
      },
    ],
  },
  render: (args) => (
    <Shell width={260}>
      <AuthoringTargetList {...args} />
    </Shell>
  ),
};

function StatefulTargetList() {
  const [selectedId, setSelectedId] = useState<string | null>("animation:wave");
  const [items, setItems] = useState<readonly AuthoringTargetItem[]>(ITEMS);

  return (
    <Shell>
      <AuthoringTargetList
        kindLabel="Animation"
        emptyDescription="Create one to get started, or import a GLB."
        items={items.map((item) => ({
          ...item,
          selected: item.id === selectedId,
        }))}
        onCreate={fn()}
        onSelect={setSelectedId}
        onDelete={(id) => {
          setItems((prev) => prev.filter((item) => item.id !== id));
          setSelectedId((prev) => (prev === id ? null : prev));
        }}
        onDuplicate={(id) => {
          setItems((prev) => {
            const source = prev.find((item) => item.id === id);
            if (!source) return prev;
            return [
              ...prev,
              { ...source, id: `${id}:copy`, label: `${source.label}_copy` },
            ];
          });
        }}
        onPlay={(id) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, runtimeState: "playing" } : item,
            ),
          );
        }}
        onPause={(id) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, runtimeState: "paused" } : item,
            ),
          );
        }}
        onStop={(id) => {
          setItems((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, runtimeState: "stopped" } : item,
            ),
          );
        }}
      />
    </Shell>
  );
}

/**
 * Wired to local state, so selection, the transport buttons and copy/delete
 * actually do something. This is the story to use for checking that clicking a row
 * action does not also change the selection — and that a transport button does.
 */
export const Interactive: Story = { render: () => <StatefulTargetList /> };
