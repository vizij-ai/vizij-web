import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconFileOff, IconPlus, IconSearchOff } from "@tabler/icons-react";
// `EmptyState` is deliberately NOT imported from "./index": it is absent from the
// `ui/index.ts` barrel, so an external consumer could only reach it by deep path.
// Flagged as a public-API gap.
import { EmptyState } from "./EmptyState";
import { Button } from "./index";

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: {
    docs: {
      description: {
        component:
          "Centred empty/zero-data placeholder. **Not exported from `ui/index.ts`** — deep-path import only. Its mount animation relies on the app-global `animate-in`/`fade-in`/`zoom-in` classes from `src/styles.css`.",
      },
    },
  },
  argTypes: {
    iconSize: { control: { type: "range", min: 16, max: 64, step: 4 } },
  },
  args: {
    title: "No poses yet",
  },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    description:
      "Capture a pose from the viewport to start building a library.",
  },
};

export const WithIcon: Story = {
  args: {
    icon: IconFileOff,
    description:
      "Capture a pose from the viewport to start building a library.",
  },
};

/**
 * `iconSize <= 24` switches the icon halo from `p-4` to `p-3` — the only
 * behavioural branch on the prop.
 */
export const SmallIcon: Story = {
  args: { icon: IconSearchOff, iconSize: 20, title: "No matches" },
};

export const WithAction: Story = {
  args: {
    icon: IconFileOff,
    description:
      "Capture a pose from the viewport to start building a library.",
    action: (
      <Button variant="primary" size="sm">
        <IconPlus className="mr-1 h-3.5 w-3.5" />
        Capture pose
      </Button>
    ),
  },
};

export const InsidePanelWidth: Story = {
  args: {
    icon: IconSearchOff,
    title: "Nothing matches that filter",
    description: "Clear the search box to see all inputs again.",
  },
  render: (args) => (
    <div className="w-64 rounded-xl border border-border-default">
      <EmptyState {...args} />
    </div>
  ),
};
