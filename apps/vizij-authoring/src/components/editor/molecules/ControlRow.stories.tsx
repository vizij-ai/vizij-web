import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Star } from "lucide-react";
import { fn } from "storybook/test";
import { Button } from "../../ui/Button";
import { ControlRow, type ControlRowValue } from "./ControlRow";

const ROW: ControlRowValue = {
  inputId: "rig.jaw.open",
  label: "Jaw Open",
  value: 0.35,
  defaultValue: 0,
  min: 0,
  max: 1,
  editable: true,
};

const meta = {
  title: "Editor/ControlRow",
  component: ControlRow,
  parameters: {
    docs: {
      description: {
        component:
          "A selectable card holding one numeric control: label, optional actions, and either a slider or a read-only note.\n\nExtracted from `VariablesPanel`'s `FlatInputControlRow`. Its `row` prop is typed by the locally-declared `ControlRowValue` rather than by the app's `InputCatalogRow` — structural typing means the app's type satisfies it with no adapter, while `editor/` depends on nothing outside itself.\n\nControlled: it holds no state and reports every change.",
      },
    },
  },
  args: {
    row: ROW,
    selected: false,
    locked: false,
    onSelect: fn(),
    onValueChange: fn(),
  },
} satisfies Meta<typeof ControlRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

/** Driven from elsewhere: the slider is disabled and the reason is stated. */
export const Locked: Story = { args: { locked: true } };

export const LockedWithCustomMessage: Story = {
  args: {
    locked: true,
    lockedMessage: "A motion graph is driving this input.",
  },
};

/** `editable: false` swaps the slider for the read-only note. */
export const ReadOnly: Story = {
  args: { row: { ...ROW, editable: false } },
};

/** `selectable: false` makes the row inert — no hover, no click, not tabbable. */
export const NotSelectable: Story = { args: { selectable: false } };

export const WithActions: Story = {
  args: {
    actions: (
      <Button size="sm" variant="ghost">
        Reset
      </Button>
    ),
  },
};

export const CustomIcon: Story = {
  args: { icon: <Star size={12} className="shrink-0 text-amber-300" /> },
};

/** Each depth step insets the row by 14px. */
export const Nested: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1">
      {[0, 1, 2, 3].map((depth) => (
        <ControlRow
          {...args}
          key={depth}
          depth={depth}
          row={{ ...ROW, label: `Depth ${depth}` }}
        />
      ))}
    </div>
  ),
};

/**
 * A non-finite `value` coerces to 0 rather than crashing the slider — the one
 * piece of defensive logic the original carried, kept verbatim.
 */
export const NonFiniteValue: Story = {
  args: { row: { ...ROW, value: Number.NaN } },
};

function StatefulControlRow() {
  const [value, setValue] = useState(0.35);
  const [selected, setSelected] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <ControlRow
        row={{ ...ROW, value }}
        selected={selected}
        locked={false}
        onSelect={() => setSelected((prev) => !prev)}
        onValueChange={(_inputId, next) => setValue(next)}
      />
      <p className="text-xs text-text-secondary">
        value <code>{value.toFixed(4)}</code> · selected{" "}
        <code>{String(selected)}</code>
      </p>
    </div>
  );
}

/** Wired to local state, so dragging and clicking actually do something. */
export const Interactive: Story = { render: () => <StatefulControlRow /> };

/**
 * The same row under a foreign theme. Only `--editor-*` properties are set — the
 * component is never told about Vizij — and the card, icon, selection accent,
 * locked note and muted text all follow.
 *
 * The **slider does not**: it is a `ui/` primitive styled from the app's own token
 * layer, not from `--editor-*`, so its track, thumb and amber default marker stay
 * put. That is the layer boundary working as designed rather than a gap in this
 * component — a consuming application themes `ui/` through its own tokens, or
 * brings its own slider. See THEMING.md, "Deliberate non-tokens".
 */
export const OverriddenTokens: Story = {
  render: (args) => (
    <div
      className="flex flex-col gap-2 rounded-lg p-3"
      style={
        {
          background: "#12101a",
          "--editor-accent": "#c084fc",
          "--editor-border": "#3f3a52",
          "--editor-panel-bg": "#1c1830",
          "--editor-value-fg": "#efe9ff",
          "--editor-muted-fg": "#8f86ad",
          "--editor-control-accent": "#c084fc",
          "--editor-locked": "#fb7185",
        } as React.CSSProperties
      }
    >
      <ControlRow {...args} />
      <ControlRow {...args} selected />
      <ControlRow {...args} locked />
      <ControlRow {...args} row={{ ...ROW, editable: false }} />
    </div>
  ),
};
