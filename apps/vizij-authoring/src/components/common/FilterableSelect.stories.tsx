import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { FilterableSelect } from "./FilterableSelect";
import type {
  FilterableSelectOption,
  FilterableSelectProps,
} from "./FilterableSelect";

const OPTIONS: readonly FilterableSelectOption[] = [
  { value: null, label: "— none —" },
  { value: "head_yaw", label: "head_yaw", keywords: ["neck", "rotation"] },
  { value: "head_pitch", label: "head_pitch", keywords: ["neck", "rotation"] },
  { value: "jaw_open", label: "jaw_open", keywords: ["mouth", "speech"] },
  { value: "blink_left", label: "blink_left", keywords: ["eye"] },
  { value: "blink_right", label: "blink_right", keywords: ["eye"] },
  { value: "legacy_channel", label: "legacy_channel", disabled: true },
];

/**
 * `FilterableSelect` ships **no styles of its own** — every visual comes from the
 * `*ClassName` props, and the fallback class names it emits
 * (`filter-select`, `filter-select__option-list`, `filter-select__option--highlighted`,
 * `filter-select__option--empty`) are not defined in `src/styles.css` or anywhere
 * else in the app. So an unstyled instance is genuinely unstyled. These classes
 * mirror what a call site has to supply.
 */
const STYLING: Partial<FilterableSelectProps> = {
  className: "relative inline-block",
  triggerClassName:
    "inline-flex h-8 min-w-[12rem] items-center justify-between gap-2 rounded-lg border border-border-default bg-bg-input px-2.5 text-[11px] font-medium text-text-primary hover:border-border-hover disabled:opacity-50",
  menuClassName:
    "absolute left-0 top-full z-50 mt-1 w-[16rem] rounded-xl border border-border-default bg-bg-card p-1 shadow-2xl",
  filterInputClassName:
    "mb-1 h-7 w-full rounded-lg border border-border-default bg-bg-input px-2 text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent",
  listClassName: "flex max-h-56 flex-col overflow-auto custom-scrollbar",
  optionClassName:
    "w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-text-secondary hover:bg-bg-hover",
  optionActiveClassName: "bg-accent-subtle font-bold text-accent",
  optionHighlightClassName: "bg-bg-hover text-text-primary",
  optionDisabledClassName: "opacity-40 pointer-events-none",
  emptyClassName: "px-2 py-1.5 text-[11px] italic text-text-muted",
};

function ControlledFilterableSelect({
  value: initial,
  onChange,
  ...rest
}: FilterableSelectProps) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <FilterableSelect
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const meta = {
  title: "Common/FilterableSelect",
  component: FilterableSelect,
  parameters: {
    docs: {
      description: {
        component:
          'Headless filterable listbox: a trigger button, a filter input and `role="option"` buttons, driven by keyword matching. **It ships no CSS** — the fourteen `*ClassName` props are the entire visual API, and the fallback class names it emits (`filter-select*`) are not defined anywhere in the app. Options may carry a `null` value, which is why the value type is `string | null`. Not exported from any barrel (`src/components/common/` has none).',
      },
    },
  },
  argTypes: {
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    value: "jaw_open",
    options: OPTIONS,
    onChange: fn(),
    ...STYLING,
  },
  render: (args) => (
    <div className="pb-72">
      <ControlledFilterableSelect {...args} />
    </div>
  ),
} satisfies Meta<typeof FilterableSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No `*ClassName` props at all — this is what the component looks like bare. */
export const Unstyled: Story = {
  args: {
    className: undefined,
    triggerClassName: undefined,
    menuClassName: undefined,
    filterInputClassName: undefined,
    listClassName: undefined,
    optionClassName: undefined,
    optionActiveClassName: undefined,
    optionHighlightClassName: undefined,
    optionDisabledClassName: undefined,
    emptyClassName: undefined,
  },
};

export const NoSelection: Story = {
  args: { value: null, placeholder: "Pick a channel…" },
};

/** `currentLabelOverride` replaces the trigger label regardless of selection. */
export const LabelOverride: Story = {
  args: {
    currentLabelOverride: <span className="text-accent">jaw_open (bound)</span>,
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};

/**
 * Filtering matches the label *or* any `keywords` entry — type "eye" or "neck"
 * to see keyword-only matches.
 */
export const KeywordMatching: Story = {
  args: { searchPlaceholder: "Try “eye” or “neck”…" },
};

export const CustomEmptyLabel: Story = {
  args: {
    noResultsLabel: "No channel matches that filter",
    searchPlaceholder: "Type something unmatched…",
  },
};

export const FewOptions: Story = {
  args: {
    value: null,
    placeholder: "Pick a mode…",
    options: [
      { value: "replace", label: "Replace" },
      { value: "additive", label: "Additive" },
    ],
  },
};
