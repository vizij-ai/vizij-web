import type { Meta, StoryObj } from "@storybook/react-vite";
import { PropertyGrid } from "./PropertyGrid";
import { InspectorSection } from "./InspectorSection";

const meta = {
  title: "Editor/PropertyGrid",
  component: PropertyGrid,
  parameters: {
    docs: {
      description: {
        component:
          "A grid that owns one column template so every row in it — and every other `PropertyGrid` configured the same way — line up.\n\nAn audit found 18 inline `grid-cols-[…]` templates across the inspector using 11 distinct column sets, each label column sized to its own longest label string. The `ReservedTracksAlign` story shows the specific defect this fixes.\n\nBuilt on `grid-template-columns: subgrid`, not `display: contents`. Both align, but `display: contents` deletes the row box, so hover and selection must be painted per-cell and the column gaps stay bare — a selected row renders as stripes. It would also break row `min-height`, `space-y-*` on a parent, and row `title` tooltips, all of which the audit found in use.",
      },
    },
  },
} satisfies Meta<typeof PropertyGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

const NumberBox = ({ value }: { value: string }) => (
  <div className="rounded-sm border border-border-default bg-bg-input px-1.5 py-0.5 text-right text-[11px] text-text-primary">
    {value}
  </div>
);

const FakeSlider = () => (
  <div className="h-1 w-full rounded-full bg-bg-hover">
    <div className="h-1 w-1/3 rounded-full bg-accent" />
  </div>
);

const Pill = ({ children }: { children: string }) => (
  <button className="rounded-sm bg-bg-hover px-1.5 text-[9px] text-text-secondary">
    {children}
  </button>
);

/**
 * **The defect this component exists to fix.** All three rows belong in one card.
 * Scale and Offset have no slider, Value does. Written as inline templates
 * (`[58px_72px]` and `[58px_minmax(0,1fr)_72px]`) the first two put their number in
 * column 2 flush left and the third puts it in column 3 flush right — numbers at
 * opposite ends of the same card.
 *
 * Here, omitting `control` reserves the track instead of shifting `value` into it,
 * so all three numbers land in the same column.
 */
export const ReservedTracksAlign: Story = {
  render: () => (
    <div className="w-[320px] rounded-md bg-bg-panel/15 px-2 py-1.5">
      <PropertyGrid>
        <PropertyGrid.Row label="Scale" value={<NumberBox value="1.0000" />} />
        <PropertyGrid.Row label="Offset" value={<NumberBox value="0.0000" />} />
        <PropertyGrid.Row
          label="Value"
          control={<FakeSlider />}
          value={<NumberBox value="0.3500" />}
        />
      </PropertyGrid>
    </div>
  ),
};

/** A row with no label keeps the label track, so it still aligns. */
export const MissingLabelStillAligns: Story = {
  render: () => (
    <div className="w-[320px]">
      <PropertyGrid>
        <PropertyGrid.Row
          label="Weight"
          control={<FakeSlider />}
          value={<NumberBox value="0.5000" />}
        />
        <PropertyGrid.Row
          control={<FakeSlider />}
          value={<NumberBox value="0.7500" />}
        />
      </PropertyGrid>
    </div>
  ),
};

/**
 * Selection and hover render as **one continuous bar**, including across the
 * column gaps — what `display: contents` cannot do.
 */
export const SelectionIsOneBar: Story = {
  render: () => (
    <div className="w-[320px]">
      <PropertyGrid>
        <PropertyGrid.Row
          label="Not selected"
          control={<FakeSlider />}
          value={<NumberBox value="0.1000" />}
        />
        <PropertyGrid.Row
          selected
          label="Selected"
          control={<FakeSlider />}
          value={<NumberBox value="0.2000" />}
        />
        <PropertyGrid.Row
          interactive
          label="Hover me"
          control={<FakeSlider />}
          value={<NumberBox value="0.3000" />}
        />
      </PropertyGrid>
    </div>
  ),
};

/** A long label truncates rather than widening the column. */
export const LongLabelsStillAlign: Story = {
  render: () => (
    <div className="w-[320px]">
      <PropertyGrid>
        {[
          "Weight",
          "A considerably longer label that must truncate",
          "Min",
        ].map((label) => (
          <PropertyGrid.Row
            key={label}
            label={label}
            control={<FakeSlider />}
            value={<NumberBox value="0.0000" />}
          />
        ))}
      </PropertyGrid>
    </div>
  ),
};

/**
 * **The second defect, from `VariablePipelineStages`' stage sections.** Poses,
 * Direct Input and Override are sibling collapsibles in one panel column, all
 * slider-plus-number, all declaring `90px` for the number. But Direct Input also
 * has a Reset button, and written as an inline template its trailing `auto` column
 * shifts that 90px number left by the button width plus one gap — so it does not
 * line up with Override's number directly below it.
 *
 * `columns="control-value-actions"` gives all three the same tracks, with the
 * actions cell simply empty on two of them. `control-value*` has no label track,
 * because these rows are label-less by design: the property name is the enclosing
 * collapsible's title. Reserving a label track would shrink their sliders by ~80px
 * to align them with labelled rows they never sit beside.
 */
export const LabelLessRowsAlign: Story = {
  render: () => (
    <div className="flex w-[360px] flex-col gap-2">
      <PropertyGrid columns="control-value-actions">
        <PropertyGrid.Row
          control={<FakeSlider />}
          value={<NumberBox value="0.5000" />}
        />
        <PropertyGrid.Row
          title="Driven by an upstream stage"
          control={<FakeSlider />}
          value={<NumberBox value="0.2500" />}
          actions={<Pill>Reset (0)</Pill>}
        />
        <PropertyGrid.Row
          control={<FakeSlider />}
          value={<NumberBox value="0.7500" />}
        />
      </PropertyGrid>
    </div>
  ),
};

/** `columns="property-actions"` adds a content-sized trailing track. */
export const WithActions: Story = {
  render: () => (
    <div className="w-[360px]">
      <PropertyGrid columns="property-actions">
        <PropertyGrid.Row
          label="Weight"
          control={<FakeSlider />}
          value={<NumberBox value="0.5000" />}
          actions={<Pill>reset</Pill>}
        />
        <PropertyGrid.Row
          label="Influence"
          control={<FakeSlider />}
          value={<NumberBox value="1.0000" />}
        />
      </PropertyGrid>
    </div>
  ),
};

/**
 * Two independent sections, each with its own `PropertyGrid`, reading the same
 * tokens — so their value columns line up across the section boundary. This is the
 * cross-section alignment the inline templates made impossible.
 */
export const TwoSectionsAlign: Story = {
  render: () => (
    <div className="flex w-[340px] flex-col gap-2">
      <InspectorSection title="Transform" count={2}>
        <PropertyGrid>
          {["Position X", "Rotation"].map((label) => (
            <PropertyGrid.Row
              key={label}
              label={label}
              control={<FakeSlider />}
              value={<NumberBox value="0.0000" />}
            />
          ))}
        </PropertyGrid>
      </InspectorSection>
      <InspectorSection title="Morph Targets" count={2}>
        <PropertyGrid>
          {["Smile", "Blink"].map((label) => (
            <PropertyGrid.Row
              key={label}
              label={label}
              value={<NumberBox value="1.0000" />}
            />
          ))}
        </PropertyGrid>
      </InspectorSection>
    </div>
  ),
};

/**
 * Re-proportioning every property row is two token overrides — the thing 18 inline
 * templates made impossible.
 */
export const OverriddenTokens: Story = {
  render: () => (
    <div
      className="flex w-[340px] flex-col gap-3 rounded-lg p-3"
      style={
        {
          background: "#12101a",
          "--editor-col-label": "130px",
          "--editor-col-value": "64px",
          "--editor-accent": "#c084fc",
          "--editor-label-fg": "#b9aee0",
          "--editor-row-bg-hover": "#2a2440",
        } as React.CSSProperties
      }
    >
      <PropertyGrid>
        <PropertyGrid.Row
          label="Wide label column"
          control={<FakeSlider />}
          value={<NumberBox value="0.1000" />}
        />
        <PropertyGrid.Row
          selected
          label="Selected"
          control={<FakeSlider />}
          value={<NumberBox value="0.2000" />}
        />
      </PropertyGrid>
    </div>
  ),
};
