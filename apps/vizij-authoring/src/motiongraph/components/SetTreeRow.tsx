/**
 * The recursive tree row shared by `InputSetsPanel` and `OutputSetsPanel`.
 *
 * A checkbox-toggle leaf with disabled branch rows: clicking a leaf toggles it in
 * the caller's `enabled` set, branches are inert but still indent and label their
 * subtree. Children are always visible — there is no collapse.
 *
 * ## Why this lives in the feature layer and not `components/editor/`
 *
 * It reads no store (the panels do that and pass props), so by the "layout **or**
 * the store, never both" test in `components/editor/README.md` it would be
 * eligible for promotion. Rule 3 of that README is what disqualifies it: *"Tokens
 * only — never hardcoded colour."* Every colour here is a raw `neutral-*` /
 * `sky-*` / `emerald-*` utility, and the `accent` prop below is itself a
 * hardcoded-palette API — a portable version would read `--editor-accent` and have
 * no accent enum at all. So promoting it is a redesign, not a move.
 *
 * That redesign is also a *visible* change (these rows are near-unreadable in
 * light mode today — dark row fill under mid-grey text — which is the shared
 * defect `component-consolidation-plan.md` §3.7 actually names), so it wants its
 * own reviewable commit rather than riding along with a deduplication.
 *
 * Deliberately **not** built on `ui/TreeRow`: that primitive's model is
 * expander-chevron + selection, and bending it to checkbox-toggle leaves with
 * disabled branches would mean three new flags for one caller.
 */

/** A node in a path hierarchy built from a flat list of `/`-separated paths. */
export interface SetTreeNode {
  name: string;
  /** Full path from root (used as the toggle key). */
  path: string;
  children: SetTreeNode[];
  /** True if this node is a leaf (an actual input/output path). */
  isLeaf: boolean;
}

/**
 * Which accent an enabled row paints itself with. A closed set of literal class
 * strings rather than an interpolated `bg-${accent}-500`, because Tailwind only
 * emits classes it can find as complete tokens in the source.
 */
export type SetTreeAccent = "sky" | "emerald";

const ACCENT: Record<SetTreeAccent, { row: string; box: string }> = {
  sky: {
    row: "bg-sky-600/20 text-sky-300",
    box: "bg-sky-500 border-sky-400",
  },
  emerald: {
    row: "bg-emerald-600/20 text-emerald-300",
    box: "bg-emerald-500 border-emerald-400",
  },
};

const IDLE_ROW =
  "bg-neutral-800/40 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300 disabled:cursor-default disabled:hover:bg-neutral-800/40 disabled:hover:text-neutral-500";

const IDLE_BOX = "border-neutral-600 bg-transparent";

interface SetTreeRowProps {
  node: SetTreeNode;
  depth: number;
  /** Paths currently enabled. Threaded down the recursion, not per-node. */
  enabled: Set<string>;
  accent: SetTreeAccent;
  onToggle: (path: string) => void;
  /** Omit to render no remove affordance at all (the outputs case). */
  onRemove?: (path: string) => void;
  /** Tooltip for the remove button. Only meaningful alongside `onRemove`. */
  removeTitle?: string;
}

export function SetTreeRow({
  node,
  depth,
  enabled,
  accent,
  onToggle,
  onRemove,
  removeTitle,
}: SetTreeRowProps) {
  const isLeaf = node.isLeaf;
  const hasChildren = node.children.length > 0;
  const isActive = isLeaf && enabled.has(node.path);
  const accentClasses = ACCENT[accent];

  return (
    <>
      {/*
        The flex wrapper is load-bearing even with no remove button: it blockifies
        the row button. Left as a bare `w-full` button (as OutputSetsPanel had it)
        the button stays `display: inline-block`, so every row sits in its own line
        box and inherits 1px of leading — rows measured on a 24px pitch inside the
        wrapper against 25px without it, which stopped the row fills tiling and
        left a hairline stripe between them.
      */}
      <div className="flex items-center group">
        <button
          onClick={() => {
            if (isLeaf) {
              onToggle(node.path);
            }
          }}
          disabled={!isLeaf}
          /*
            `min-w-0` is required, not cosmetic. `flex-1` alone leaves
            `min-width: auto`, so a long or deeply indented label made the button
            wider than the panel instead of ellipsising — which pushed the remove
            button clean outside the scroll container and out of reach.
          */
          className={`flex-1 min-w-0 text-left py-1 px-2 transition-colors ${
            isActive ? accentClasses.row : IDLE_ROW
          }`}
        >
          <span
            className="flex items-center gap-1.5"
            style={{ paddingLeft: depth * 12 }}
          >
            {/* Checkbox indicator */}
            <span
              className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 border transition-colors ${
                isActive ? accentClasses.box : IDLE_BOX
              }`}
            />

            {/* Label */}
            <span
              className={`text-xs truncate ${hasChildren ? "font-medium" : ""}`}
            >
              {node.name}
            </span>
          </span>
        </button>
        {isLeaf && onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(node.path);
            }}
            className="px-1.5 text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
            title={removeTitle}
          >
            ×
          </button>
        )}
      </div>

      {/* Children — always visible, no collapse */}
      {node.children.map((child) => (
        <SetTreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          enabled={enabled}
          accent={accent}
          onToggle={onToggle}
          onRemove={onRemove}
          removeTitle={removeTitle}
        />
      ))}
    </>
  );
}
