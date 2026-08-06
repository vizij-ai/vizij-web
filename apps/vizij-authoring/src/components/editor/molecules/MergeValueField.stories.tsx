import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { MergeValueField } from "./MergeValueField";
import { ModalFormGroup } from "./ModalFormGroup";

const meta = {
  title: "Editor/MergeValueField",
  component: MergeValueField,
  parameters: {
    docs: {
      description: {
        component:
          "One row of a copy/merge decision: what you want to write, and a one-click way to keep what the destination already has.\n\nThree copies of this lived in `VariablesPanel`'s copy modals, and the first attempt at extracting them was **deferred** because each drives a different draft setter — flat, nested under a computed key, and nested under `value`. There is no shared draft type. Reading them showed the difference is only in how the draft is *written*: everything visible is identical. So it collapses behind two callbacks and the component never learns what a draft is, the same split `useRowLock` uses for lock state.\n\nThe consequence: `toDecisionCustomValue` and the blocking-message reset stay at the call site, so this imports nothing from the app. The `editor/` eslint boundary proves that rather than the docs asserting it.\n\nOne thing genuinely does differ between the three, and it is a prop rather than a hidden branch: **where the label goes**. One site puts it beside the input, one stacks it above, one has none.",
      },
    },
  },
  args: {
    value: "0.35",
    onValueChange: fn(),
    onUseCurrent: fn(),
    useCurrentLabel: "Use current min",
    emptyLabel: "No current main face value",
    currentValue: 0.5,
  },
} satisfies Meta<typeof MergeValueField>;

export default meta;
type Story = StoryObj<typeof meta>;

const BesideLabel = () => (
  <span className="text-xs text-text-muted">Min (0.000)</span>
);
const AboveLabel = () => (
  <span className="text-[10px] uppercase tracking-wide text-text-muted">
    Scale (1.000)
  </span>
);

/** `labelPlacement="beside"` — the Value Merge shape. */
export const LabelBeside: Story = {
  render: (args) => (
    <div className="w-[440px]">
      <MergeValueField {...args} label={<BesideLabel />} />
    </div>
  ),
};

/** `labelPlacement="above"` — the link-row shape, 10px uppercase over the input. */
export const LabelAbove: Story = {
  render: (args) => (
    <div className="w-[440px]">
      <MergeValueField
        {...args}
        label={<AboveLabel />}
        labelPlacement="above"
        useCurrentLabel="Use current scale"
        emptyLabel="No current value"
      />
    </div>
  ),
};

/** No label — the pose-copy shape, where the label lives further up the card. */
export const NoLabel: Story = {
  render: (args) => (
    <div className="w-[440px]">
      <MergeValueField
        {...args}
        useCurrentLabel="Use current pose value"
        emptyLabel="No current pose value"
      />
    </div>
  ),
};

/**
 * With no finite `currentValue` there is nothing to copy, so the button is replaced
 * by `emptyLabel`. Both strings are separate props because they are not derivable
 * from each other — one real site pairs "Use current min" with "No current main
 * face value".
 */
export const NoCurrentValue: Story = {
  render: (args) => (
    <div className="w-[440px]">
      <MergeValueField {...args} label={<BesideLabel />} currentValue={null} />
    </div>
  ),
};

/** `disabled` greys the input and the button together. */
export const Disabled: Story = {
  render: (args) => (
    <div className="w-[440px]">
      <MergeValueField
        {...args}
        label={<AboveLabel />}
        labelPlacement="above"
        disabled
      />
    </div>
  ),
};

function StatefulField() {
  const [value, setValue] = useState("0.35");
  return (
    <div className="flex w-[440px] flex-col gap-2">
      <MergeValueField
        label={<BesideLabel />}
        value={value}
        onValueChange={setValue}
        currentValue={0.5}
        onUseCurrent={() => setValue("0.500")}
        useCurrentLabel="Use current min"
        emptyLabel="No current main face value"
      />
      <p className="text-xs text-text-secondary">
        draft value <code>{value}</code>
      </p>
    </div>
  );
}

/** Typing and "Use current" both drive the same controlled value. */
export const Interactive: Story = { render: () => <StatefulField /> };

/** As it appears in the app: several fields inside a `ModalFormGroup`. */
export const InAFormGroup: Story = {
  render: (args) => (
    <div className="w-[460px]">
      <ModalFormGroup title="Value Merge" spacing="tight">
        {[
          { label: "Min (0.000)", noun: "min" },
          { label: "Max (1.000)", noun: "max" },
          { label: "Default (0.000)", noun: "default" },
        ].map((f) => (
          <MergeValueField
            {...args}
            key={f.noun}
            label={<span className="text-xs text-text-muted">{f.label}</span>}
            useCurrentLabel={`Use current ${f.noun}`}
          />
        ))}
      </ModalFormGroup>
    </div>
  ),
};

/** Re-themed through `--editor-*` alone, including the new `--editor-input-bg`. */
export const OverriddenTokens: Story = {
  render: (args) => (
    <div
      className="w-[460px] rounded-lg p-3"
      style={
        {
          background: "#1b1420",
          "--editor-border": "#4b2f56",
          "--editor-input-bg": "#2a1e33",
          "--editor-value-fg": "#f4e9ff",
          "--editor-muted-fg": "#a892b8",
        } as React.CSSProperties
      }
    >
      <MergeValueField
        {...args}
        label={
          <span className="text-xs text-[var(--editor-muted-fg)]">
            Min (0.000)
          </span>
        }
      />
    </div>
  ),
};
