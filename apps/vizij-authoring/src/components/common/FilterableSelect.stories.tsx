import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { FilterableSelect } from "./FilterableSelect";

const DESIGN =
  "https://www.figma.com/design/PfvCYAHJs2m1ihZ0YAYIW8/Vizij-Authoring---Designs?node-id=12-2";

const options = [
  { value: "smile", label: "Smile", keywords: ["mouth", "happy"] },
  { value: "blink", label: "Blink", keywords: ["eyes"] },
  { value: "gaze", label: "Gaze", keywords: ["eyes", "look"] },
  { value: "brow", label: "Brow raise", keywords: ["forehead"] },
];

const meta: Meta<typeof FilterableSelect> = {
  title: "Common/FilterableSelect",
  component: FilterableSelect,
  parameters: { design: { type: "figma", url: DESIGN } },
};
export default meta;

export const Default: StoryObj<typeof FilterableSelect> = {
  render: () => {
    const [value, setValue] = useState<string | null>("smile");
    return (
      <div style={{ width: 260 }}>
        <FilterableSelect
          value={value}
          options={options}
          onChange={setValue}
          placeholder="Select a channel"
          searchPlaceholder="Filter channels…"
        />
      </div>
    );
  },
};
