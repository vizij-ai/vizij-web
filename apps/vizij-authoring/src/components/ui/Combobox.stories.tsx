import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Combobox } from "./index";
import type { ComboboxOption, ComboboxProps } from "./index";

const OPTIONS: ComboboxOption[] = [
  { value: "head", label: "Head", description: "3 joints" },
  { value: "left_arm", label: "Left arm", description: "5 joints" },
  { value: "right_arm", label: "Right arm", description: "5 joints" },
  { value: "torso", label: "Torso", description: "2 joints" },
  {
    value: "legs",
    label: "Legs",
    description: "disabled in this rig",
    disabled: true,
  },
];

function ControlledCombobox({
  value: initial,
  onChange,
  ...rest
}: ComboboxProps) {
  const [value, setValue] = useState<string | null>(initial);
  return (
    <Combobox
      {...rest}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

/** Exercises the externally controlled `query` / `onQueryChange` pair. */
function ControlledQueryCombobox({
  value: initial,
  onChange,
  ...rest
}: ComboboxProps) {
  const [value, setValue] = useState<string | null>(initial);
  const [query, setQuery] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Combobox
        {...rest}
        value={value}
        query={query}
        onQueryChange={setQuery}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
      />
      <p className="m-0 text-[10px] text-text-muted">
        query: <code>{query || "—"}</code> · value:{" "}
        <code>{value ?? "null"}</code>
      </p>
    </div>
  );
}

const meta = {
  title: "UI/Combobox",
  component: Combobox,
  parameters: {
    docs: {
      description: {
        component:
          "Filterable single-select with a text input. Hand-rolled (not on `@semio/ui` or Radix): the popup is an absolutely positioned `div`, not a portal, so it clips inside `overflow: hidden` ancestors. Its popup uses the app-global `custom-scrollbar` and `animate-in`/`fade-in`/`zoom-in` classes.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md"] },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    value: null,
    options: OPTIONS,
    label: "Rig group",
    placeholder: "Search or select...",
    onChange: fn(),
  },
  render: (args) => (
    <div className="max-w-xs pb-64">
      <ControlledCombobox {...args} />
    </div>
  ),
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Preselected: Story = {
  args: { value: "torso" },
};

export const Small: Story = {
  args: { size: "sm" },
};

export const WithoutLabel: Story = {
  args: { label: undefined },
};

export const Disabled: Story = {
  args: { disabled: true, value: "head" },
};

export const NoOptions: Story = {
  args: { options: [] },
  parameters: {
    docs: {
      description: {
        story: "Focus the field to see the “Nothing found.” empty row.",
      },
    },
  },
};

export const ControlledQuery: Story = {
  render: (args) => (
    <div className="max-w-xs pb-64">
      <ControlledQueryCombobox {...args} />
    </div>
  ),
};
