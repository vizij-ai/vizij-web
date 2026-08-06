import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconDotsVertical, IconLock } from "@tabler/icons-react";
import { Button, CollapsibleRow } from "./index";
import type { CollapsibleRowProps } from "./index";

/**
 * The inline `RowSlider` is controlled, so the row needs a value owner. The
 * expand/collapse state is uncontrolled inside the component itself.
 */
function ControlledRow({
  value: initial,
  onValueChange,
  ...rest
}: CollapsibleRowProps) {
  const [value, setValue] = useState(initial ?? 0);
  return (
    <CollapsibleRow
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

const meta = {
  title: "UI/CollapsibleRow",
  component: CollapsibleRow,
  parameters: {
    docs: {
      description: {
        component:
          "Inspector row: title/subtitle, an optional inline value slider, an actions well, and optional expandable content. The trigger is disabled unless `expandedContent` is supplied. Depends on the app-global `.inspector-row-hit-target` class (min-height) from `src/styles.css`.",
      },
    },
  },
  argTypes: {
    value: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    showSlider: { control: "boolean" },
    defaultExpanded: { control: "boolean" },
    disabled: { control: "boolean" },
    onValueChange: { action: "value changed" },
  },
  args: {
    id: "jaw_open",
    title: "jaw_open",
    value: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
  },
  render: (args) => (
    <div className="max-w-2xl">
      <ControlledRow {...args} />
    </div>
  ),
} satisfies Meta<typeof CollapsibleRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithSubtitle: Story = {
  args: { subtitle: "float · standard input" },
};

/**
 * With no `expandedContent` the chevron is not rendered and the trigger is
 * disabled — the row is a value editor only.
 */
export const NoExpandableContent: Story = {
  args: { subtitle: "no expandable content" },
};

export const Expandable: Story = {
  args: {
    subtitle: "float · standard input",
    expandedContent: (
      <div className="flex flex-col gap-2 text-xs text-text-secondary">
        <p className="m-0">
          Bound to <code className="text-accent">head/jaw.rotation.x</code>.
        </p>
        <p className="m-0">Range clamped to the rig&apos;s declared limits.</p>
      </div>
    ),
  },
};

export const DefaultExpanded: Story = {
  args: {
    subtitle: "float · standard input",
    defaultExpanded: true,
    expandedContent: (
      <p className="m-0 text-xs text-text-secondary">
        Opens on mount via `defaultExpanded`.
      </p>
    ),
  },
};

export const WithActions: Story = {
  args: {
    actions: (
      <>
        <Button variant="ghost" size="icon" aria-label="Lock">
          <IconLock className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="More">
          <IconDotsVertical className="h-3.5 w-3.5" />
        </Button>
      </>
    ),
  },
};

export const WithoutSlider: Story = {
  args: {
    showSlider: false,
    subtitle: "bool · toggled elsewhere",
    expandedContent: (
      <p className="m-0 text-xs text-text-secondary">
        `showSlider={false}` suppresses the inline slider even though a `value`
        is supplied.
      </p>
    ),
  },
};

export const Disabled: Story = {
  args: { disabled: true, subtitle: "locked by upstream binding" },
};

/**
 * `CollapsibleRow` forwards only `min`/`max`/`step` to its inner `RowSlider` — it
 * has no `defaultValue` or `snapThreshold` pass-through, so the amber
 * default-value marker and snap behaviour are unreachable from here. See
 * `RowSlider` → `WithDefaultMarker` for what is being missed.
 */
export const NoDefaultMarkerPassThrough: Story = {
  args: { subtitle: "no way to set the slider's defaultValue from this API" },
};

export const Stacked: Story = {
  render: (args) => (
    <div className="max-w-2xl">
      {["jaw_open", "brow_raise", "blink_left", "blink_right"].map(
        (id, index) => (
          <ControlledRow
            {...args}
            key={id}
            id={id}
            title={id}
            subtitle="float · standard input"
            value={index * 0.2}
            expandedContent={
              <p className="m-0 text-xs text-text-secondary">
                Details for {id}.
              </p>
            }
          />
        ),
      )}
    </div>
  ),
};
