import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconBox, IconFolder } from "@tabler/icons-react";
import { TreeRoot } from "./TreeRoot";
import { TreeRow } from "./TreeRow";

const meta = {
  title: "UI/TreeRoot",
  component: TreeRoot,
  parameters: {
    docs: {
      description: {
        component:
          "The `role=\"tree\"` container, and the half of the WAI-ARIA tree pattern that is about **position** rather than about a row.\n\nBefore this existed, no tree in the app could be operated without a mouse: `TreeRow` rendered a bare `<div onClick>` with no role, no tabindex and no key handler, and its expander button was the only focusable thing in a row.\n\n**The pattern splits along a seam.** Up/Down/Home/End are purely positional — answering them needs the ordered list of visible rows and nothing else, so the container owns them. Left/Right/Enter/Space need `onToggle` and `onSelect`, which only the row holds, so `TreeRow` owns those. Neither half needs the other's state, which is why keyboard support required no change to any consumer's selection or expansion model.\n\n**No registry, no ids, no flattener.** The ordered list is read from the DOM at keypress time with `querySelectorAll('[role=\"treeitem\"]')`. That is better than a registry here, not a shortcut around one: a collapsed subtree is *unmounted*, so the query returns exactly the rows a user can see, already in visual order, with the recursion and the expansion state accounted for by construction. A registry would have to be told all three and could drift from all three. It also means `TreeRow` needs no `id` prop, so none of the six render sites had to invent stable ids they do not have.\n\n**Adoption is opt-in.** `TreeRow` reads `useInTreeRoot()`; outside a root it is byte-for-byte what it always was. That is why adding this moved no existing test.",
      },
    },
  },
  args: { "aria-label": "Example tree", children: null },
} satisfies Meta<typeof TreeRoot>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * `alpha-two` starts collapsed, so its child is **unmounted** rather than hidden —
 * which is what makes arrowing past it skip straight to `beta`.
 */
function Tree({ multiselectable }: { multiselectable?: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["alpha"]));
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const select = (id: string, additive: boolean) =>
    setSelected((prev) => {
      if (!multiselectable || !additive) return new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const row = (
    id: string,
    label: string,
    depth: number,
    children?: React.ReactNode,
  ) => (
    <TreeRow
      key={id}
      label={label}
      depth={depth}
      hasChildren={Boolean(children)}
      isExpanded={expanded.has(id)}
      isSelected={selected.has(id)}
      onToggle={() => toggle(id)}
      onSelect={(event) => select(id, event.metaKey || event.ctrlKey)}
      icon={
        children ? (
          <IconFolder className="h-3 w-3" />
        ) : (
          <IconBox className="h-3 w-3" />
        )
      }
    >
      {children}
    </TreeRow>
  );

  return (
    <div className="w-[320px] rounded-lg border border-border-default/60 p-1">
      <TreeRoot aria-label="Example tree" multiselectable={multiselectable}>
        {row(
          "alpha",
          "alpha",
          0,
          <>
            {row("alpha-one", "alpha-one", 1)}
            {row(
              "alpha-two",
              "alpha-two",
              1,
              row("alpha-two-a", "alpha-two-a", 2),
            )}
          </>,
        )}
        {row("beta", "beta", 0)}
        {row("gamma", "gamma", 0)}
      </TreeRoot>
    </div>
  );
}

/**
 * Tab into the tree — it is **one** tab stop for the whole hierarchy, not one per
 * row, which matters when a real tree has thousands. Then:
 *
 * - `↑`/`↓` move, `Home`/`End` jump to the ends
 * - `→` opens a folder; `→` again steps into it
 * - `←` collapses an open folder, then steps out to the parent
 * - `Enter`/`Space` select
 */
export const Default: Story = { render: () => <Tree /> };

/**
 * With `multiselectable`, the root announces `aria-multiselectable` and
 * `⌘`/`Ctrl` + `Enter` toggles a row into the selection — the keyboard equivalent
 * of cmd-click. Consumers read `metaKey`/`ctrlKey` off the select event, and a
 * keyboard event carries both natively, so this needs no synthetic mouse event.
 *
 * This is how `HierarchyPanel` uses it, where selection is the shared
 * `selectionStack`.
 */
export const MultiSelectable: Story = {
  render: () => <Tree multiselectable />,
};

/**
 * The same rows with no `TreeRoot` around them. There is no `role="tree"`, no
 * `treeitem`, no tab stop and no key handling — and the expander button stays a
 * real, reachable control, because without the container there are no arrow keys
 * to replace it.
 *
 * This is the state every consumer is in until it opts in.
 */
export const WithoutARoot: Story = { render: () => <BareRows /> };

function BareRows() {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="w-[320px] rounded-lg border border-border-default/60 p-1">
      <TreeRow
        label="alpha"
        depth={0}
        hasChildren
        isExpanded={expanded}
        onToggle={() => setExpanded((prev) => !prev)}
        icon={<IconFolder className="h-3 w-3" />}
      >
        <TreeRow
          label="alpha-one"
          depth={1}
          hasChildren={false}
          onToggle={() => {}}
          icon={<IconBox className="h-3 w-3" />}
        />
      </TreeRow>
    </div>
  );
}
