import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Plus } from "lucide-react";
import { fn } from "storybook/test";
import { Button } from "../../ui/Button";
import { GroupedInputTree, type GroupedInputFolder } from "./GroupedInputTree";
import type { ControlRowValue } from "./ControlRow";

const row = (inputId: string, label: string): ControlRowValue => ({
  inputId,
  label,
  value: 0.35,
  defaultValue: 0,
  min: 0,
  max: 1,
  editable: true,
});

const GROUPS: GroupedInputFolder<ControlRowValue>[] = [
  {
    id: "face",
    label: "face",
    rows: [row("face.blink", "Blink")],
    children: [
      {
        id: "face/mouth",
        label: "mouth",
        rows: [row("mouth.open", "Jaw Open"), row("mouth.smile", "Smile")],
        children: [],
      },
    ],
  },
  {
    id: "mood",
    label: "mood",
    rows: [row("mood.valence", "Valence")],
    children: [],
  },
];

const meta = {
  title: "Editor/GroupedInputTree",
  component: GroupedInputTree,
  parameters: {
    docs: {
      description: {
        component:
          'A tree of collapsible folders whose leaves are numeric control rows. Extracted from two ~100-line copies in `VariablesPanel`.\n\nAn earlier audit called those copies "~100 identical lines, differing in the expansion-state set and the actions fragment". Diffing them showed the **per-row derived data** differs completely too — one computes motion-graph eligibility from a rig input path, the other resolves a pose from a pose-weight source id. Neither means anything to the other.\n\nSo this owns only what genuinely repeated: the recursive folder scaffold, the expansion rule, and the common `ControlRow` wiring. Every per-row difference — the derivation *and* the buttons it feeds — stays at the call site inside `renderRowActions`. Unifying the derivations behind a flag would have produced a component that knows about motion-graph eligibility and pose weights, which is the coupling `editor/` exists to prevent.',
      },
    },
  },
  // Every story drives its own state through `render`, but the component has
  // required props, so `satisfies Meta` needs a baseline set here.
  args: {
    groups: GROUPS,
    keyPrefix: "story",
    isFolderExpanded: () => true,
    onToggleFolder: fn(),
    isRowSelected: () => false,
    onSelectRow: fn(),
    onValueChange: fn(),
  },
} satisfies Meta<typeof GroupedInputTree<ControlRowValue>>;

export default meta;
type Story = StoryObj<typeof meta>;

function Tree({
  actions,
  allExpanded = false,
}: {
  actions?: boolean;
  allExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    new Set(allExpanded ? ["face", "face/mouth", "mood"] : ["face"]),
  );
  const [selected, setSelected] = useState<string | null>("mouth.open");
  return (
    <div className="w-[360px]">
      <GroupedInputTree
        groups={GROUPS}
        keyPrefix="story"
        isFolderExpanded={(id) => expanded.has(id)}
        onToggleFolder={(id) =>
          setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        isRowSelected={(r) => r.inputId === selected}
        onSelectRow={(r) => setSelected(r.inputId)}
        onValueChange={fn()}
        renderRowActions={
          actions
            ? () => (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-6 w-6 p-0"
                  aria-label="Add"
                  title="Add"
                >
                  <Plus size={11} />
                </Button>
              )
            : undefined
        }
      />
    </div>
  );
}

/** Folders collapse and expand; rows select. */
export const Default: Story = { render: () => <Tree /> };

/** Nested folders indent, and their rows indent one further. */
export const Expanded: Story = { render: () => <Tree allExpanded /> };

/**
 * `renderRowActions` is the escape hatch: the two real call sites put entirely
 * different derivations and buttons here, and the component stays ignorant of both.
 */
export const WithRowActions: Story = {
  render: () => <Tree allExpanded actions />,
};

/** An empty tree renders nothing rather than an empty shell. */
export const Empty: Story = {
  render: () => (
    <div className="w-[360px]">
      <GroupedInputTree
        groups={[]}
        keyPrefix="story-empty"
        isFolderExpanded={() => false}
        onToggleFolder={fn()}
        isRowSelected={() => false}
        onSelectRow={fn()}
        onValueChange={fn()}
      />
    </div>
  ),
};

/**
 * Re-themed through `--editor-*` alone. The rows are `ControlRow`s, so they follow
 * the same tokens; the folder rows are `ui/TreeRow` and follow the app's own.
 */
export const OverriddenTokens: Story = {
  render: () => (
    <div
      className="w-[360px] rounded-lg p-3"
      style={
        {
          background: "#12101a",
          "--editor-accent": "#c084fc",
          "--editor-border": "#3f3a52",
          "--editor-panel-bg": "#1c1830",
          "--editor-value-fg": "#efe9ff",
          "--editor-control-accent": "#c084fc",
        } as React.CSSProperties
      }
    >
      <Tree allExpanded />
    </div>
  ),
};
