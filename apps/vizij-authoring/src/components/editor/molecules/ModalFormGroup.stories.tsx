import type { Meta, StoryObj } from "@storybook/react-vite";
import { ModalFormGroup } from "./ModalFormGroup";
import { InspectorSection } from "./InspectorSection";

const meta = {
  title: "Editor/ModalFormGroup",
  component: ModalFormGroup,
  parameters: {
    docs: {
      description: {
        component:
          "A titled card grouping the controls of one step in a modal form. Five copies of it were hand-written in `VariablesPanel`'s copy modals.\n\n**A sibling of `InspectorSection`, not a variant.** The two look alike and merging them is tempting — it was explicitly declined when `InspectorSection` was adopted across the same file. The difference is the header: this announces itself in bold sentence-case primary (`Destination`, `Value Merge`), where an inspector section uses a small uppercase muted label plus a count. The `SideBySideWithInspectorSection` story puts them together so the distinction is visible rather than asserted.",
      },
    },
  },
  args: { title: "Destination" },
} satisfies Meta<typeof ModalFormGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

const Field = ({ label }: { label: string }) => (
  <label className="flex flex-col gap-1 text-xs text-text-muted">
    {label}
    <input
      readOnly
      value=""
      className="h-8 rounded border border-border-default bg-bg-input px-2 text-xs text-text-primary"
    />
  </label>
);

export const Loose: Story = {
  render: (args) => (
    <div className="w-[420px]">
      <ModalFormGroup {...args}>
        <Field label="Name" />
        <Field label="Namespace" />
      </ModalFormGroup>
    </div>
  ),
};

/** `spacing="tight"` for lists of similar rows rather than distinct controls. */
export const Tight: Story = {
  render: (args) => (
    <div className="w-[420px]">
      <ModalFormGroup {...args} title="Value Merge" spacing="tight">
        {["Min (0.000)", "Max (1.000)", "Default (0.000)"].map((label) => (
          <div key={label} className="text-xs text-text-muted">
            {label}
          </div>
        ))}
      </ModalFormGroup>
    </div>
  ),
};

/** A group can carry content with no heading of its own. */
export const Untitled: Story = {
  render: () => (
    <div className="w-[420px]">
      <ModalFormGroup>
        <div className="text-xs text-text-muted">No mappings.</div>
      </ModalFormGroup>
    </div>
  ),
};

/**
 * The reason these are two components. Same card, deliberately different headers:
 * bold sentence-case primary for a modal form step, small uppercase muted plus a
 * count for an inspector section. Forcing one to serve both would restyle five
 * modal headers to a density built for a narrow inspector column.
 */
export const SideBySideWithInspectorSection: Story = {
  render: () => (
    <div className="flex w-[420px] flex-col gap-3">
      <ModalFormGroup title="Destination">
        <Field label="Name" />
      </ModalFormGroup>
      <InspectorSection title="Transform" count={1}>
        <div className="text-xs text-text-muted">an inspector section</div>
      </InspectorSection>
    </div>
  ),
};

/** Re-themed through `--editor-*` alone. */
export const OverriddenTokens: Story = {
  render: () => (
    <div
      className="w-[420px] rounded-lg p-3"
      style={
        {
          background: "#0f1720",
          "--editor-border": "#2b4a5e",
          "--editor-panel-bg": "#16313f",
          "--editor-value-fg": "#d8f3ff",
        } as React.CSSProperties
      }
    >
      <ModalFormGroup title="Destination">
        <div className="text-xs text-[var(--editor-value-fg)]">
          card surface, border and heading all follow the tokens
        </div>
      </ModalFormGroup>
    </div>
  ),
};
