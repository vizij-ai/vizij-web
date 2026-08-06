import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PanelSearch, Panel } from "./index";

const ROWS = [
  "jaw_open",
  "brow_raise",
  "blink_left",
  "blink_right",
  "head_yaw",
  "head_pitch",
];

function ControlledSearch(props: {
  placeholder?: string;
  className?: string;
  withResults?: boolean;
}) {
  const { withResults, ...rest } = props;
  const [value, setValue] = useState("");
  const matches = ROWS.filter((row) =>
    row.toLowerCase().includes(value.trim().toLowerCase()),
  );

  return (
    <div className="flex max-w-xs flex-col gap-2">
      <PanelSearch {...rest} value={value} onChange={setValue} />
      {withResults && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {matches.map((row) => (
            <li key={row} className="text-xs text-text-secondary">
              {row}
            </li>
          ))}
          {matches.length === 0 && (
            <li className="text-xs italic text-text-muted">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}

const meta = {
  title: "UI/PanelSearch",
  component: PanelSearch,
  parameters: {
    docs: {
      description: {
        component:
          'Panel filter field: a small `Input` with `type="search"` and a leading search icon. Composes the local `Input` rather than `@semio/ui`\'s `Search`, whose `onClear` mutates the DOM value without firing `onChange` and so desyncs a controlled field. The `placeholder` doubles as the accessible name. `PanelSearchProps` is not exported.',
      },
    },
  },
  args: { value: "", onChange: () => {} },
  render: () => <ControlledSearch withResults />,
} satisfies Meta<typeof PanelSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const CustomPlaceholder: Story = {
  render: () => <ControlledSearch placeholder="Search inputs..." withResults />,
};

export const WithoutResults: Story = {
  render: () => <ControlledSearch placeholder="Filter..." />,
};

export const InPanelHeader: Story = {
  render: () => (
    <div className="max-w-xs">
      <Panel title="Standard inputs" badge="6">
        <ControlledSearch placeholder="Search inputs..." withResults />
      </Panel>
    </div>
  ),
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  render: () => <ControlledSearch placeholder="Search inputs..." withResults />,
};
