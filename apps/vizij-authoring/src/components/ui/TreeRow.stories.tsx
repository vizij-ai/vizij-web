import { useState, type ComponentProps } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { IconBone, IconEye, IconEyeOff } from "@tabler/icons-react";
import { Button, TreeRow } from "./index";

/** `isExpanded` and `onToggle` are caller-owned, so the story holds the state. */
function ExpandableTreeRow(
  props: Omit<ComponentProps<typeof TreeRow>, "onToggle" | "isExpanded"> & {
    defaultExpanded?: boolean;
  },
) {
  const { defaultExpanded = false, ...rest } = props;
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <TreeRow
      {...rest}
      isExpanded={expanded}
      onToggle={() => setExpanded((prev) => !prev)}
    />
  );
}

function Hierarchy({ query }: { query?: string }) {
  const [selected, setSelected] = useState<string | null>("head");
  return (
    <div className="max-w-xs">
      <ExpandableTreeRow
        depth={0}
        hasChildren
        defaultExpanded
        label="root"
        highlightQuery={query}
        icon={<IconBone className="h-3.5 w-3.5" />}
        isSelected={selected === "root"}
        onSelect={() => setSelected("root")}
      >
        <ExpandableTreeRow
          depth={1}
          hasChildren
          defaultExpanded
          label="head"
          highlightQuery={query}
          isSelected={selected === "head"}
          onSelect={() => setSelected("head")}
        >
          <ExpandableTreeRow
            depth={2}
            hasChildren={false}
            label="jaw"
            highlightQuery={query}
            isSelected={selected === "jaw"}
            onSelect={() => setSelected("jaw")}
          />
          <ExpandableTreeRow
            depth={2}
            hasChildren={false}
            label="eye_left"
            highlightQuery={query}
            isSelected={selected === "eye_left"}
            onSelect={() => setSelected("eye_left")}
          />
        </ExpandableTreeRow>
        <ExpandableTreeRow
          depth={1}
          hasChildren={false}
          label="torso"
          highlightQuery={query}
          isSelected={selected === "torso"}
          onSelect={() => setSelected("torso")}
          disabled
          disabledReason="Not present in this rig revision"
        />
      </ExpandableTreeRow>
    </div>
  );
}

const meta = {
  title: "UI/TreeRow",
  component: TreeRow,
  parameters: {
    docs: {
      description: {
        component:
          "Hierarchy row: indent by `depth`, an expander, an optional icon, a truncating label and hover-revealed actions. Expansion is fully caller-owned (`isExpanded` + `onToggle`), and children are rendered only when `hasChildren && isExpanded`. Note the click semantics: if `onSelect` is supplied it wins and the row body does **not** toggle — only the arrow does. `TreeRowProps` is not exported.",
      },
    },
  },
  argTypes: {
    depth: { control: { type: "range", min: 0, max: 5, step: 1 } },
    hasChildren: { control: "boolean" },
    isExpanded: { control: "boolean" },
    isSelected: { control: "boolean" },
    disabled: { control: "boolean" },
    onToggle: { action: "toggled" },
  },
  args: {
    depth: 0,
    hasChildren: false,
    label: "jaw",
    onToggle: fn(),
  },
  render: (args) => (
    <div className="max-w-xs">
      <TreeRow {...args} />
    </div>
  ),
} satisfies Meta<typeof TreeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** With no children the expander is `opacity-0` but still occupies its 16px. */
export const Leaf: Story = {
  args: { label: "eye_left" },
};

export const Selected: Story = {
  args: { isSelected: true, label: "head" },
};

export const WithIcon: Story = {
  args: { icon: <IconBone className="h-3.5 w-3.5" />, label: "head" },
};

export const WithActions: Story = {
  args: {
    label: "head",
    actions: (
      <>
        <Button variant="ghost" size="icon" aria-label="Show">
          <IconEye className="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Hide">
          <IconEyeOff className="h-3 w-3" />
        </Button>
      </>
    ),
  },
  parameters: {
    docs: {
      description: {
        story: "Actions are `opacity-0` until the row is hovered or selected.",
      },
    },
  },
};

export const Disabled: Story = {
  args: {
    label: "torso",
    disabled: true,
    disabledReason: "Not present in this rig revision",
  },
};

export const IndentLevels: Story = {
  render: () => (
    <div className="max-w-xs">
      {[0, 1, 2, 3].map((depth) => (
        <TreeRow
          key={depth}
          depth={depth}
          hasChildren={false}
          label={`depth ${depth}`}
          onToggle={() => {}}
        />
      ))}
    </div>
  ),
};

export const Nested: Story = {
  render: () => <Hierarchy />,
};

export const WithHighlightQuery: Story = {
  render: () => <Hierarchy query="ey" />,
  parameters: {
    docs: {
      description: {
        story:
          "`highlightQuery` highlights matching labels. This is the one place in the layer that uses a `dark:` utility rather than a token.",
      },
    },
  },
};
