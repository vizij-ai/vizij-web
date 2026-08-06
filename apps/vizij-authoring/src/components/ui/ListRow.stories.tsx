import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconDownload, IconTrash } from "@tabler/icons-react";
import { Badge, Button, Chip, ListRow } from "./index";

const meta = {
  title: "UI/ListRow",
  component: ListRow,
  parameters: {
    docs: {
      description: {
        component:
          'Clickable list card: title, optional description, a meta slot and an actions slot. Always renders as `cursor-pointer` with an active press state, so it should only be used for rows that really are clickable. Pass `onSelect` to make the whole row activate on click, Enter and Space (`role="button"`, tab-reachable) and `selected` to paint the accent surface — the same 60%/10% accent pair `ControlRow` and `PropertyGridRow` use. `ListRowProps` is not exported.',
      },
    },
  },
  args: {
    title: "quori_walk_cycle",
  },
  render: (args) => (
    <div className="max-w-md">
      <ListRow {...args} />
    </div>
  ),
} satisfies Meta<typeof ListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: {
    description: "Captured 2026-07-14 · 42 keyframes · 3 tracks",
  },
};

export const WithMeta: Story = {
  args: {
    description: "Captured 2026-07-14 · 42 keyframes",
    meta: "1.4 MB",
  },
};

export const WithActions: Story = {
  args: {
    description: "Captured 2026-07-14 · 42 keyframes",
    actions: (
      <>
        <Button variant="ghost" size="icon" aria-label="Download">
          <IconDownload className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Delete">
          <IconTrash className="h-3.5 w-3.5" />
        </Button>
      </>
    ),
  },
};

export const WithBadgeMeta: Story = {
  args: {
    description: "Captured 2026-07-14",
    meta: <Badge tone="accent">New</Badge>,
  },
};

export const WithChildren: Story = {
  args: {
    description: "Captured 2026-07-14 · 42 keyframes",
    meta: "1.4 MB",
    children: (
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="info">head</Chip>
        <Chip tone="info">torso</Chip>
        <Chip tone="success">validated</Chip>
      </div>
    ),
  },
};

export const Selected: Story = {
  args: {
    description: "Captured 2026-07-14 · 42 keyframes",
    meta: "1.4 MB",
    selected: true,
  },
};

/**
 * `onSelect` is what turns the card into a `role="button"`: focus it with Tab and
 * activate it with Enter or Space, not just the mouse.
 */
export const Selectable: Story = {
  args: {
    description: "Click, or focus with Tab and press Enter or Space",
    onSelect: () => {},
  },
};

/** `selectable={false}` keeps the row rendered but inert and `aria-disabled`. */
export const NotSelectable: Story = {
  args: {
    description: "Not tab-reachable, does not activate",
    onSelect: () => {},
    selectable: false,
  },
};

/**
 * The state the primitive exists for: one selected row among resting siblings.
 * Each row carries a `data-testid` so the selected/resting surfaces can be read
 * back with `getComputedStyle`.
 */
export const SelectableList: Story = {
  render: (args) => <SelectableListDemo {...args} />,
};

function SelectableListDemo(args: ComponentProps<typeof ListRow>) {
  const [selectedName, setSelectedName] = useState("hugo_idle");
  return (
    <div className="flex max-w-md flex-col gap-2">
      {["quori_walk_cycle", "hugo_idle", "toasty_wave"].map((name) => (
        <ListRow
          {...args}
          key={name}
          data-testid={`list-row-${name}`}
          title={name}
          description="Captured 2026-07-14 · 42 keyframes"
          meta="1.4 MB"
          selected={name === selectedName}
          onSelect={() => setSelectedName(name)}
          actions={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <IconTrash className="h-3.5 w-3.5" />
            </Button>
          }
        />
      ))}
    </div>
  );
}

export const List: Story = {
  render: (args) => (
    <div className="flex max-w-md flex-col gap-2">
      {["quori_walk_cycle", "hugo_idle", "toasty_wave"].map((name) => (
        <ListRow
          {...args}
          key={name}
          title={name}
          description="Captured 2026-07-14 · 42 keyframes"
          meta="1.4 MB"
        />
      ))}
    </div>
  ),
};
