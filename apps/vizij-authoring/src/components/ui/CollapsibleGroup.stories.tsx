import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconRefresh, IconTrash } from "@tabler/icons-react";
import { Button, CollapsibleGroup } from "./index";

const meta = {
  title: "UI/CollapsibleGroup",
  component: CollapsibleGroup,
  parameters: {
    docs: {
      description: {
        component:
          "Titled collapsible section on the Radix Collapsible primitives `@semio/ui` re-exports. Uncontrolled — `defaultCollapsed` only seeds the initial state, so open/close by clicking the header. The panel enter/exit uses the app-global `animate-in`/`fade-in`/`slide-in-from-top-1` classes from `src/styles.css`.",
      },
    },
  },
  argTypes: {
    defaultCollapsed: { control: "boolean" },
    itemCount: { control: "number" },
  },
  args: {
    title: "Standard inputs",
    defaultCollapsed: false,
    children: (
      <p className="m-0 text-xs text-text-secondary">
        Twelve inputs are exposed on this rig. Each maps to a runtime channel.
      </p>
    ),
  },
} satisfies Meta<typeof CollapsibleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Collapsed: Story = {
  args: { defaultCollapsed: true },
};

export const WithSubtitle: Story = {
  args: {
    subtitle: "Driven directly by the runtime store",
  },
};

export const WithItemCount: Story = {
  args: { itemCount: 12, subtitle: "Driven directly by the runtime store" },
};

export const SingleItemCount: Story = {
  args: { itemCount: 1 },
  parameters: {
    docs: {
      description: { story: "The count label singularises at 1." },
    },
  },
};

export const WithActions: Story = {
  args: {
    itemCount: 4,
    actions: (
      <>
        <Button variant="ghost" size="icon" aria-label="Refresh">
          <IconRefresh className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Clear">
          <IconTrash className="h-3.5 w-3.5" />
        </Button>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story:
          "The actions well stops click propagation so buttons do not toggle the panel.",
      },
    },
  },
};

export const Stacked: Story = {
  render: (args) => (
    <div className="max-w-md">
      <CollapsibleGroup {...args} title="Standard inputs" itemCount={12} />
      <CollapsibleGroup
        {...args}
        title="Derived inputs"
        subtitle="Computed from parents"
        itemCount={3}
        defaultCollapsed
      />
      <CollapsibleGroup
        {...args}
        title="Diagnostics"
        itemCount={0}
        defaultCollapsed
      />
    </div>
  ),
};
