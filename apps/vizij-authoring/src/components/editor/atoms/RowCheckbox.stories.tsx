import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { RowCheckbox } from "./RowCheckbox";

const meta = {
  title: "Editor/RowCheckbox",
  component: RowCheckbox,
  parameters: {
    docs: {
      description: {
        component:
          'A small labelled checkbox that lives **inside a clickable row** without triggering it.\n\nThat containment is why it exists: a checkbox inside a row whose own `onClick` selects the row will, on every click, both toggle itself and select the row. Each of the five copies of this in `VariablesPanel` carried the same `stopPropagation` on the label, and getting it wrong is silent — the checkbox still works, it just also does something else. The `InsideAClickableRow` story below is the one that actually demonstrates the point.\n\nDeliberately a native `<input type="checkbox">` rather than `ui/Checkbox`, which renders a 28px box built for forms — four times the height of this 9px label. It also carries no colour of its own: what a row-level selection means is the caller\'s business.',
      },
    },
  },
  args: {
    checked: false,
    onChange: fn(),
    children: "Bulk",
    title: "Select pose for bulk copy",
  },
} satisfies Meta<typeof RowCheckbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true, checked: true } };

/** Vizij's bulk-copy selections pass `text-cyan-200`. */
export const WithCallerColour: Story = {
  args: { checked: true, className: "text-cyan-200" },
};

export const LongerLabel: Story = { args: { children: "Bulk Drv" } };

function RowWithCheckbox() {
  const [checked, setChecked] = useState(false);
  const [rowClicks, setRowClicks] = useState(0);
  return (
    <div className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setRowClicks((n) => n + 1)}
        className="flex items-center gap-2 rounded border border-border-default/50 bg-bg-panel/35 px-2 py-1.5 cursor-pointer hover:bg-bg-panel/50"
      >
        <span className="text-xs text-text-primary">Smile</span>
        <div className="ml-auto">
          <RowCheckbox
            checked={checked}
            onChange={() => setChecked((prev) => !prev)}
            title="Select pose for bulk copy"
            className="text-cyan-200"
          >
            Bulk
          </RowCheckbox>
        </div>
      </div>
      <p className="text-xs text-text-secondary">
        checkbox <code>{String(checked)}</code> · row clicks{" "}
        <code>{rowClicks}</code>
      </p>
    </div>
  );
}

/**
 * The reason the component exists. Toggling the checkbox must leave the row-click
 * counter alone; clicking anywhere else on the row must increment it.
 */
export const InsideAClickableRow: Story = { render: () => <RowWithCheckbox /> };
