import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
// NOT imported from "./index": `Slider` is absent from the `ui/index.ts` barrel,
// so an external consumer could only reach it by deep path. Flagged as a
// public-API gap — the more so because `RowSlider`, which *is* exported, is a
// native range input rather than this component.
import { Slider } from "./Slider";
import type { SliderProps } from "./Slider";

function ControlledSlider({ value: initial, onChange, ...rest }: SliderProps) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-1">
      <Slider
        {...rest}
        value={value}
        onChange={(next) => {
          const numeric = Array.isArray(next) ? next[0] : next;
          setValue(numeric);
          onChange?.(next);
        }}
      />
      <span className="text-[10px] tabular-nums text-text-muted">{value}</span>
    </div>
  );
}

const meta = {
  title: "UI/Slider",
  component: Slider,
  parameters: {
    docs: {
      description: {
        component:
          "Track slider on `radix-ui`'s Slider. **Not exported from `ui/index.ts`** — deep-path import only. Note the API wart: `onChange` is typed `(value: number | number[]) => void` even though the component is strictly single-thumb, so every caller has to narrow. `defaultValue` is *not* radix's uncontrolled initial value — it is the amber marker anchor and snap target.",
      },
    },
  },
  argTypes: {
    fillMode: { control: "inline-radio", options: ["none", "value"] },
    disabled: { control: "boolean" },
    onChange: { action: "changed" },
  },
  args: {
    value: 40,
    min: 0,
    max: 100,
    step: 1,
  },
  render: (args) => (
    <div className="max-w-md">
      <ControlledSlider {...args} />
    </div>
  ),
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `RadixSlider.Range` is deliberately not rendered; the fill is a manual span. */
export const FillModeValue: Story = {
  args: { fillMode: "value" },
};

export const WithDefaultMarker: Story = {
  args: { defaultValue: 50, snapThreshold: 2, fillMode: "value" },
};

export const NormalisedRange: Story = {
  args: { value: 0.35, min: 0, max: 1, step: 0.01, fillMode: "value" },
};

export const SignedRange: Story = {
  args: { value: -45, min: -180, max: 180, step: 1, fillMode: "value" },
};

export const Disabled: Story = {
  args: { disabled: true, fillMode: "value" },
};

/** Non-finite input falls back to `min` rather than throwing or rendering NaN. */
export const NonFiniteValue: Story = {
  args: { value: Number.NaN, fillMode: "value" },
};

export const DegenerateRange: Story = {
  args: { value: 5, min: 5, max: 5, fillMode: "value" },
  parameters: {
    docs: {
      description: {
        story: "`max === min` clamps the computed fill percentage to 0.",
      },
    },
  },
};
