import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Sliders } from "lucide-react";
import { fn } from "storybook/test";
import { ChannelLockButton } from "../atoms/ChannelLockButton";
import { PropertyRow } from "./PropertyRow";

const NumberBox = ({ value }: { value: string }) => (
  <div className="w-[88px] rounded-sm border border-border-default bg-bg-input px-1.5 py-0.5 text-right text-[11px] text-text-primary">
    {value}
  </div>
);

const meta = {
  title: "Editor/PropertyRow",
  component: PropertyRow,
  parameters: {
    docs: {
      description: {
        component:
          "The property-editing chassis: a chevron, a modified-from-default dot, a label (scrubbable or static), the main input, a reset affordance, a row-action slot, and expandable Def/Min/Max/Editable sub-rows.\n\nIt was `inspector/RiggingPropertyRow` — misfiled, because nothing about it is rigging-specific. Every domain concern arrives through `renderX()` render props, so promoting it to `editor/` was a move plus a tokenise pass, not a rewrite. It is the most valuable single component in the inspector and now the most reusable.\n\n**Not** merged into `NumberField`, deliberately: a property row is a disclosure-and-override affordance that happens to contain a numeric input. Folding them would put default/min/max semantics inside a text field.\n\nLayout is driven by container queries (`@container` / `@[300px]:`), so it reflows on its own width rather than the viewport's — drag the story pane narrow to see it stack.",
      },
    },
  },
  args: {
    label: "Position X",
    renderMainInput: () => <NumberBox value="0.3500" />,
  },
} satisfies Meta<typeof PropertyRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No `renderDefaultInput`, so there is no chevron and the label is scrubbable. */
export const Collapsed: Story = {
  args: { icon: <Sliders size={11} />, onScrub: fn() },
};

/** Supplying `renderDefaultInput` is what makes the row expandable. */
export const Expandable: Story = {
  args: {
    renderDefaultInput: () => <NumberBox value="0.0000" />,
    renderMinInput: () => <NumberBox value="0.0000" />,
    renderMaxInput: () => <NumberBox value="1.0000" />,
  },
};

export const ExpandedWithAllSubRows: Story = {
  args: {
    expanded: true,
    renderDefaultInput: () => <NumberBox value="0.0000" />,
    renderMinInput: () => <NumberBox value="0.0000" />,
    renderMaxInput: () => <NumberBox value="1.0000" />,
    renderAnimatableRow: () => (
      <span className="text-[10px] text-text-muted">animatable channels…</span>
    ),
  },
};

/** `hasDifferentDefault` shows the accent dot and the reset button. */
export const ModifiedFromDefault: Story = {
  args: {
    hasDifferentDefault: true,
    onResetToDefault: fn(),
    renderDefaultInput: () => <NumberBox value="0.0000" />,
  },
};

/** The row-action slot swallows pointer events so it never toggles the row. */
export const WithRowAction: Story = {
  args: {
    renderDefaultInput: () => <NumberBox value="0.0000" />,
    renderRowAction: () => (
      <ChannelLockButton locked={false} onToggle={fn()} title="Lock" />
    ),
  },
};

function Uncontrolled() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <PropertyRow
        label="Position X"
        expanded={expanded}
        onExpandedChange={setExpanded}
        renderMainInput={() => <NumberBox value="0.3500" />}
        renderDefaultInput={() => <NumberBox value="0.0000" />}
      />
      <p className="text-xs text-text-secondary">
        expanded <code>{String(expanded)}</code>
      </p>
    </div>
  );
}

/** Controlled expansion; it also keeps internal state when `expanded` is omitted. */
export const Controlled: Story = { render: () => <Uncontrolled /> };

/** Several rows stacked, as the inspector actually uses it. */
export const Stacked: Story = {
  render: () => (
    <div className="flex w-[340px] flex-col gap-0.5">
      {["Position X", "Position Y", "Position Z"].map((label, i) => (
        <PropertyRow
          key={label}
          label={label}
          hasDifferentDefault={i === 1}
          onResetToDefault={fn()}
          renderMainInput={() => <NumberBox value="0.0000" />}
          renderDefaultInput={() => <NumberBox value="0.0000" />}
        />
      ))}
    </div>
  ),
};

/**
 * A foreign theme through `--editor-*` alone. Note
 * `--editor-row-expanded-bg` / `--editor-row-expanded-border`: their fallbacks are
 * a darkening overlay and a lightening hairline that assume a dark canvas, so a
 * light-themed consumer has to override them — this story is where that shows.
 */
export const OverriddenTokens: Story = {
  render: () => (
    <div
      className="flex w-[340px] flex-col gap-1 rounded-lg p-3"
      style={
        {
          background: "#f6f4ff",
          "--editor-panel-bg": "#ffffff",
          "--editor-border": "#cfc6ee",
          "--editor-border-strong": "#a99ee0",
          "--editor-accent": "#7c3aed",
          "--editor-label-fg": "#5b5175",
          "--editor-muted-fg": "#7a7196",
          "--editor-value-fg": "#241f33",
          "--editor-row-expanded-bg": "rgb(124 58 237 / 0.06)",
          "--editor-row-expanded-border": "rgb(124 58 237 / 0.18)",
        } as React.CSSProperties
      }
    >
      <PropertyRow
        label="Weight"
        hasDifferentDefault
        onResetToDefault={fn()}
        expanded
        renderMainInput={() => <NumberBox value="0.3500" />}
        renderDefaultInput={() => <NumberBox value="0.0000" />}
        renderMinInput={() => <NumberBox value="0.0000" />}
      />
    </div>
  ),
};
