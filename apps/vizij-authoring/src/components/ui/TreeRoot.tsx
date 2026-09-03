import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../../utils/cn";

/**
 * True when this subtree is inside a {@link TreeRoot}.
 *
 * `TreeRow` reads it to decide whether to become focusable. Outside a root it
 * stays exactly as it always was — a `<div onClick>` with no tab stop — so
 * adding the root is opt-in per panel and no consumer changes behaviour by
 * accident.
 */
const InTreeRootContext = createContext(false);

export const useInTreeRoot = () => useContext(InTreeRootContext);

const ITEM_SELECTOR = '[role="treeitem"]';

export interface TreeRootProps {
  children: ReactNode;
  /** Accessible name for the tree. One of this or `aria-labelledby` is required. */
  "aria-label"?: string;
  "aria-labelledby"?: string;
  /** True when more than one row can be selected at a time. */
  multiselectable?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * The `role="tree"` container, and the half of the WAI-ARIA tree pattern that is
 * about **position** rather than about a row.
 *
 * ## Why navigation lives here and activation does not
 *
 * Up/Down/Home/End are purely positional: answering them needs the ordered list
 * of visible rows and nothing else. Left/Right/Enter/Space are not — they need
 * `onToggle` and `onSelect`, which only the row holds. So the pattern is split
 * along that seam: this component moves focus, `TreeRow` acts on it. Neither
 * half needs the other's state, which is why adding keyboard support required no
 * change to any consumer's selection or expansion model.
 *
 * ## No registry, no ids, no flattener
 *
 * The ordered list is read from the DOM at keypress time with
 * `querySelectorAll('[role="treeitem"]')`. That is not a shortcut around a
 * registry — it is *better* than one here, because a collapsed subtree is
 * unmounted, so the query returns exactly the rows a user can see, already in
 * visual order, with the recursion and the expansion state accounted for by
 * construction. A registry would have to be told all three, and could drift from
 * all three. It also means `TreeRow` needs no `id` prop, so none of the six
 * render sites had to invent stable ids they do not currently have.
 *
 * The cost is one DOM query per arrow key. That is per *keypress*, not per
 * render, and it is bounded by the rendered rows rather than by the data — which
 * matters in `VariablesPanel`, whose model holds thousands of nodes.
 *
 * ## Focus delegation
 *
 * The root is the tab stop; rows are `tabIndex={-1}`. Tabbing into the tree
 * lands on the root, which forwards focus to the selected row if there is one
 * and to the first row otherwise. While a row holds focus the root drops to
 * `tabIndex={-1}` so Shift+Tab leaves the tree instead of bouncing back to the
 * container. This is one tab stop for the whole tree, which is the entire point:
 * a hierarchy with thousands of rows must not be thousands of tab stops.
 */
export function TreeRoot({
  children,
  multiselectable,
  className,
  ...rest
}: TreeRootProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [rowHasFocus, setRowHasFocus] = useState(false);

  const items = useCallback(
    () =>
      ref.current
        ? Array.from(ref.current.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
        : [],
    [],
  );

  const focusAt = useCallback((list: HTMLElement[], index: number) => {
    const next = list[index];
    if (!next) return false;
    next.focus();
    // `block: "nearest"` so an already-visible row does not jolt the panel.
    // Optional because jsdom does not implement it, and a missing scroll must
    // not take focus movement down with it.
    next.scrollIntoView?.({ block: "nearest" });
    return true;
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }
      // A row's own Left/Right/Enter/Space handler runs first and stops
      // propagation; anything reaching here is ours. But a text input inside a
      // row action would also bubble Home/End, and stealing those from a caret
      // is a real regression, so bail on any editable target.
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select")
      ) {
        return;
      }

      const list = items();
      if (list.length === 0) return;
      const current = target?.closest<HTMLElement>(ITEM_SELECTOR) ?? null;
      const index = current ? list.indexOf(current) : -1;

      let next: number;
      if (event.key === "Home") next = 0;
      else if (event.key === "End") next = list.length - 1;
      else if (event.key === "ArrowDown")
        next = index < 0 ? 0 : Math.min(list.length - 1, index + 1);
      else next = index < 0 ? list.length - 1 : Math.max(0, index - 1);

      if (focusAt(list, next)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [items, focusAt],
  );

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) {
        // Focus landed on a row — give up the tab stop so Shift+Tab exits.
        setRowHasFocus(true);
        return;
      }
      const list = items();
      if (list.length === 0) return;
      const selected = list.findIndex(
        (item) => item.getAttribute("aria-selected") === "true",
      );
      focusAt(list, selected >= 0 ? selected : 0);
    },
    [items, focusAt],
  );

  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setRowHasFocus(false);
    }
  }, []);

  return (
    <InTreeRootContext.Provider value>
      <div
        {...rest}
        ref={ref}
        role="tree"
        aria-multiselectable={multiselectable}
        tabIndex={rowHasFocus ? -1 : 0}
        className={cn("outline-none", className)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </div>
    </InTreeRootContext.Provider>
  );
}
