import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { Tabs } from "./index";
import type { TabId, TabItem, TabsProps } from "./index";

const ITEMS: TabItem[] = [
  { id: "poses", label: "Poses" },
  { id: "bindings", label: "Bindings" },
  { id: "drivers", label: "Drivers" },
];

function ControlledTabs({ value: initial, onValueChange, ...rest }: TabsProps) {
  const [value, setValue] = useState<TabId>(initial);
  return (
    <Tabs
      {...rest}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange(next);
      }}
    />
  );
}

const panel = (id: TabId) => (
  <div className="rounded-xl border border-border-default bg-bg-secondary/30 p-4 text-xs text-text-secondary">
    Panel content for <code className="text-accent">{id}</code>.
  </div>
);

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  parameters: {
    docs: {
      description: {
        component:
          "Tab bar + panels on `radix-ui`'s Tabs. Controlled only — there is no uncontrolled mode. Panels use `forceMount`, so **every** panel's subtree stays mounted and `renderPanel` is called once per item on every render; inactive panels keep their local state (and their cost). The `underline` variant's accent bar is driven by `data-state=\"active\"`.",
      },
    },
  },
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["default", "pill", "underline"],
    },
    size: { control: "inline-radio", options: ["sm", "md"] },
    fillPanels: { control: "boolean" },
    onValueChange: { action: "tab changed" },
  },
  args: {
    items: ITEMS,
    value: "poses",
    renderPanel: panel,
    onValueChange: fn(),
  },
  render: (args) => (
    <div className="max-w-2xl">
      <ControlledTabs {...args} />
    </div>
  ),
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Pill: Story = {
  args: { variant: "pill" },
};

export const Underline: Story = {
  args: { variant: "underline" },
};

export const SmallSize: Story = {
  args: { size: "sm" },
};

export const WithBadges: Story = {
  args: {
    items: [
      { id: "poses", label: "Poses", badge: 12 },
      { id: "bindings", label: "Bindings", badge: 4 },
      { id: "drivers", label: "Drivers", badge: 0 },
    ],
  },
};

export const WithDescriptions: Story = {
  args: {
    items: [
      { id: "poses", label: "Poses", description: "captured" },
      { id: "bindings", label: "Bindings", description: "resolved" },
      { id: "drivers", label: "Drivers", description: "live" },
    ],
  },
};

export const WithDisabledTab: Story = {
  args: {
    items: [
      { id: "poses", label: "Poses" },
      { id: "bindings", label: "Bindings" },
      { id: "drivers", label: "Drivers", disabled: true },
    ],
  },
};

export const ManyTabs: Story = {
  args: {
    items: Array.from({ length: 9 }, (_, index) => ({
      id: `tab_${index}`,
      label: `Section ${index + 1}`,
    })),
    value: "tab_0",
  },
  parameters: {
    docs: {
      description: {
        story: "The list wraps (`flex-wrap`) rather than scrolling.",
      },
    },
  },
};

/** `fillPanels` makes the active panel stretch to the container height. */
export const FillPanels: Story = {
  args: { fillPanels: true },
  render: (args) => (
    <div className="flex h-72 max-w-2xl flex-col">
      <ControlledTabs
        {...args}
        renderPanel={(id) => (
          <div className="h-full rounded-xl border border-border-default bg-bg-secondary/30 p-4 text-xs text-text-secondary">
            Full-height panel for <code className="text-accent">{id}</code>.
          </div>
        )}
      />
    </div>
  ),
};

export const AllVariants: Story = {
  render: (args) => (
    <div className="flex max-w-2xl flex-col gap-8">
      <ControlledTabs {...args} variant="default" />
      <ControlledTabs {...args} variant="pill" />
      <ControlledTabs {...args} variant="underline" />
    </div>
  ),
};
