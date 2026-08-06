import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconLink, IconSearch } from "@tabler/icons-react";
import { Input } from "./index";
import type { InputProps } from "./index";

function ControlledInput({ value: initial, onChange, ...rest }: InputProps) {
  const [value, setValue] = useState(String(initial ?? ""));
  return (
    <Input
      {...rest}
      value={value}
      onChange={(event) => {
        setValue(event.target.value);
        onChange?.(event);
      }}
    />
  );
}

const meta = {
  title: "UI/Input",
  component: Input,
  parameters: {
    docs: {
      description: {
        component:
          "Single-line text input on `@semio/ui`'s `TextField`. Two deliberate quirks: `className` lands on the **wrapper**, not the input, and `onChange` keeps the native `(event)` signature rather than semio's `(value, event)`. `startContent` maps to semio's `icon`.",
      },
    },
  },
  argTypes: {
    size: { control: "inline-radio", options: ["sm", "md"] },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    placeholder: "Enter a name",
    value: "",
  },
  render: (args) => (
    <div className="max-w-xs">
      <ControlledInput {...args} />
    </div>
  ),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { value: "rig_v2_final" },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex max-w-xs flex-col gap-3">
      <ControlledInput {...args} size="sm" placeholder="Small" />
      <ControlledInput {...args} size="md" placeholder="Medium" />
    </div>
  ),
};

export const WithStartContent: Story = {
  args: {
    startContent: <IconSearch className="h-3.5 w-3.5" stroke={2.5} />,
    placeholder: "Filter inputs...",
  },
};

export const Disabled: Story = {
  args: { disabled: true, value: "read only" },
};

export const NumberType: Story = {
  args: { type: "number", value: "12", step: 1, min: 0, max: 100 },
};

export const SearchType: Story = {
  args: {
    type: "search",
    placeholder: "Search inputs...",
    startContent: <IconSearch className="h-3.5 w-3.5" stroke={2.5} />,
  },
  parameters: {
    docs: {
      description: {
        story:
          '`type="search"` is what gives `PanelSearch` its `searchbox` role; the `placeholder` supplies the accessible name.',
      },
    },
  },
};

/**
 * `className` targets the wrapper, which is how `RowSlider` shrinks the field to
 * a 24px numeric stub. Passing `text-*` here therefore affects the wrapper, not
 * the input text — a real footgun in the current API.
 */
export const ClassNameLandsOnWrapper: Story = {
  args: {
    value: "0.35",
    type: "number",
    className: "w-24 h-6 p-0 text-center",
  },
};

export const WithUrlAffordance: Story = {
  args: {
    startContent: <IconLink className="h-3.5 w-3.5" />,
    placeholder: "https://example.com/rig.glb",
  },
};
