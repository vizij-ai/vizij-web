import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconRefresh } from "@tabler/icons-react";
import { Badge, Button, Panel } from "./index";

const meta = {
  title: "UI/Panel",
  component: Panel,
  parameters: {
    docs: {
      description: {
        component:
          "Sidebar panel wrapper on `@semio/ui`'s `.card-transparent` (translucent surface + `backdrop-blur-lg`). The header appears only when one of `title` / `description` / `badge` / `actions` is set. `description` is **not** rendered inline — it becomes a `Tooltip` on an info icon. `as` is accepted but currently ignored (it warns and falls back to `<section>`).",
      },
    },
  },
  args: {
    title: "Standard inputs",
    children: (
      <p className="m-0 text-xs text-text-secondary">
        Twelve inputs are exposed on this rig.
      </p>
    ),
  },
  render: (args) => (
    <div className="max-w-sm">
      <Panel {...args} />
    </div>
  ),
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoHeader: Story = {
  args: { title: undefined },
};

/** `description` renders as a hoverable info icon beside the title, not as text. */
export const WithDescription: Story = {
  args: {
    description:
      "Inputs declared by the rig itself. Derived inputs live in their own panel.",
  },
};

export const WithStringBadge: Story = {
  args: { badge: "12" },
  parameters: {
    docs: {
      description: {
        story: "A string or number `badge` is auto-wrapped in `<Badge>`.",
      },
    },
  },
};

export const WithElementBadge: Story = {
  args: { badge: <Badge tone="info">stale</Badge> },
};

export const WithActions: Story = {
  args: {
    badge: "12",
    actions: (
      <Button variant="ghost" size="icon" aria-label="Refresh">
        <IconRefresh className="h-3.5 w-3.5" />
      </Button>
    ),
  },
};

export const Everything: Story = {
  args: {
    description: "Inputs declared by the rig itself.",
    badge: "12",
    actions: (
      <Button variant="ghost" size="sm">
        Reset all
      </Button>
    ),
  },
};

export const OnLightCanvas: Story = {
  globals: { theme: "light" },
  args: { description: "Token-driven surface, so light mode is clean." },
};

export const Nested: Story = {
  render: (args) => (
    <div className="max-w-sm">
      <Panel {...args} title="Inspector" badge="3">
        <Panel title="Transform" className="bg-bg-secondary/30">
          <p className="m-0 text-xs text-text-secondary">
            Position, rotation, scale.
          </p>
        </Panel>
        <Panel title="Bindings" className="bg-bg-secondary/30">
          <p className="m-0 text-xs text-text-secondary">Two unbound slots.</p>
        </Panel>
      </Panel>
    </div>
  ),
};
