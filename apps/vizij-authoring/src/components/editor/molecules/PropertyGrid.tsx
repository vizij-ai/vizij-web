import { createContext, useContext } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../utils/cn";

/**
 * Column template for a `PropertyGrid`. Any `grid-template-columns` value works;
 * the named ones are the shapes an audit of all 18 inline templates in this app
 * actually found.
 */
export type PropertyColumns =
  | "property"
  | "property-actions"
  | "label-value"
  | "label-value-actions"
  | string;

type Slot = "label" | "control" | "value" | "actions";

const LABEL = "var(--editor-col-label, 72px)";
const VALUE = "var(--editor-col-value, 90px)";
/** Stretchy middle for a slider, select or free-text field. */
const CONTROL = "minmax(0, 1fr)";

const COLUMN_TEMPLATES: Record<string, string> = {
  property: `${LABEL} ${CONTROL} ${VALUE}`,
  "property-actions": `${LABEL} ${CONTROL} ${VALUE} auto`,
  "label-value": `${LABEL} ${VALUE}`,
  "label-value-actions": `${LABEL} ${VALUE} auto`,
};

/**
 * Which tracks each named template has, in order. A row renders one cell per
 * slot — **including an empty one for a slot it has no content for** — which is
 * what keeps a row without a control aligned with a row that has one.
 */
const TEMPLATE_SLOTS: Record<string, Slot[]> = {
  property: ["label", "control", "value"],
  "property-actions": ["label", "control", "value", "actions"],
  "label-value": ["label", "value"],
  "label-value-actions": ["label", "value", "actions"],
};

const PropertyGridContext = createContext<Slot[] | null>(null);

export interface PropertyGridProps {
  /**
   * A named template — `"property"` (default), `"property-actions"`,
   * `"label-value"`, `"label-value-actions"` — or a raw
   * `grid-template-columns` value.
   *
   * Named templates size their label and value tracks from
   * `--editor-col-label` / `--editor-col-value`, which is what makes two separate
   * grids line up with each other. A raw value opts out of the slot API; pass
   * cells as `children` instead.
   */
  columns?: PropertyColumns;
  children?: ReactNode;
  className?: string;
}

/**
 * A grid that owns one column template so that **every row in it, and every other
 * `PropertyGrid` configured the same way, line up**.
 *
 * The problem it solves: an audit found 18 inline `grid-cols-[…]` templates across
 * the inspector, using 11 distinct column sets. The label column was 58px, 72px,
 * 96px or 104px depending on which row you looked at — each one sized to its own
 * longest label string rather than to a shared decision. Nothing enforced
 * agreement, so adjacent sections visibly misaligned. See
 * `docs/references/editor-refactoring-plan.md` §2.
 *
 * ## Reserved empty tracks are the mechanism
 *
 * The audit's key finding: rows in the same card that *look* like they should
 * align use different templates because one has no label and another has no
 * slider. `[58px_72px]` puts its number in column 2, flush left; `
 * [58px_minmax(0,1fr)_72px]` puts its number in column 3, flush right. Same card,
 * numbers at opposite ends.
 *
 * So a row here renders one cell per slot in the template, **including empty
 * cells**. Omitting `control` reserves the control track rather than shifting
 * `value` left into it. That is why the row API is slot props (`label`,
 * `control`, `value`, `actions`) and not positional children: positional children
 * reproduce the original bug the moment a row omits a cell.
 *
 * ## Why subgrid and not `display: contents`
 *
 * The plan originally proposed `display: contents` on each row so its cells join
 * the parent grid. That aligns correctly but **deletes the row box**, so a row can
 * carry no background, border or radius, and hover/selection must be painted onto
 * each cell — which leaves the column gaps bare, rendering a selected row as
 * stripes rather than one bar. Measured in a spike: both approaches put cells at
 * identical x positions, but only the subgrid row reports a non-zero size and
 * paints its own background.
 *
 * `display: contents` would also have broken three things the audit found in use:
 * row-level `min-height`, `space-y-*` on a parent, and row `title` tooltips.
 *
 * ## Fallback
 *
 * Subgrid is Chrome 117+ / Safari 16+ / Firefox 71+, and this app declares no
 * browserslist, so the row declares the explicit template first and overrides it
 * with `subgrid` under `@supports`. Because the named templates size label and
 * value from **fixed tokens**, the fallback aligns identically; only a
 * content-sized track can drift between rows without subgrid, and it degrades to
 * per-row sizing rather than to a broken layout.
 *
 * Written with Tailwind's `supports-[…]` variant rather than a stylesheet rule,
 * because `editor/` may not depend on app-global CSS.
 */
export function PropertyGrid({
  columns = "property",
  children,
  className,
}: PropertyGridProps) {
  const template = COLUMN_TEMPLATES[columns] ?? columns;
  const slots = TEMPLATE_SLOTS[columns] ?? null;

  return (
    <PropertyGridContext.Provider value={slots}>
      <div
        className={cn(
          "grid items-center gap-x-2 gap-y-1",
          // The parent must CONSUME the template, not just declare it: `subgrid`
          // on a row inherits the parent's tracks, so a parent with no explicit
          // columns gives every row one implicit column and the cells stack.
          "[grid-template-columns:var(--property-grid-columns)]",
          className,
        )}
        style={{ "--property-grid-columns": template } as CSSProperties}
        data-property-grid=""
      >
        {children}
      </div>
    </PropertyGridContext.Provider>
  );
}

export interface PropertyGridRowProps {
  /** Property name. A string gets the standard label treatment. */
  label?: ReactNode;
  /** Stretchy middle cell — slider, select, free-text field. */
  control?: ReactNode;
  /** The fixed-width value cell, usually a number field. */
  value?: ReactNode;
  /** Trailing controls — reset, lock, menu. */
  actions?: ReactNode;
  /** Escape hatch for raw templates: cells positioned by source order. */
  children?: ReactNode;
  selected?: boolean;
  /** Adds the hover affordance and a pointer cursor. Implied by `onClick`. */
  interactive?: boolean;
  onClick?: () => void;
  title?: string;
  className?: string;
}

/**
 * One row of a `PropertyGrid`. Inherits the parent's columns via subgrid and is a
 * real box, so `selected`, hover, `title` and the row's own padding all behave
 * normally.
 *
 * Pass cells as slot props. Every slot the template declares gets a cell, empty
 * ones included, so omitting `control` does not shift `value` left.
 */
export function PropertyGridRow({
  label,
  control,
  value,
  actions,
  children,
  selected = false,
  interactive = false,
  onClick,
  title,
  className,
}: PropertyGridRowProps) {
  const slots = useContext(PropertyGridContext);
  const clickable = interactive || Boolean(onClick);

  const slotContent: Record<Slot, ReactNode> = {
    label,
    control,
    value,
    actions,
  };

  const cells =
    children ??
    slots?.map((slot) => {
      const content = slotContent[slot];
      if (content === undefined || content === null) {
        // Reserve the track. `aria-hidden` so an empty cell is not announced.
        return <div key={slot} aria-hidden="true" />;
      }
      if (slot === "label") {
        return <PropertyGridLabel key={slot}>{content}</PropertyGridLabel>;
      }
      if (slot === "actions") {
        return <PropertyGridActions key={slot}>{content}</PropertyGridActions>;
      }
      return <PropertyGridValue key={slot}>{content}</PropertyGridValue>;
    });

  return (
    <div
      className={cn(
        "grid items-center col-span-full gap-x-2",
        "[grid-template-columns:var(--property-grid-columns)]",
        "supports-[grid-template-columns:subgrid]:[grid-template-columns:subgrid]",
        "rounded border px-1 py-0.5 transition-colors",
        "min-h-[var(--editor-row-min-height,32px)]",
        selected
          ? "border-[var(--property-row-border-selected)] bg-[var(--property-row-bg-selected)]"
          : "border-transparent",
        clickable &&
          "cursor-pointer hover:bg-[var(--property-row-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
      style={
        {
          "--property-row-border-selected":
            "color-mix(in oklab, var(--editor-accent, var(--color-accent)) 60%, transparent)",
          "--property-row-bg-selected":
            "color-mix(in oklab, var(--editor-accent, var(--color-accent)) 10%, transparent)",
          "--property-row-bg-hover":
            "color-mix(in oklab, var(--editor-row-bg-hover, var(--bg-active)) 45%, transparent)",
        } as CSSProperties
      }
      onClick={onClick}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onClick?.();
            }
          : undefined
      }
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={title}
      data-selected={selected ? "true" : undefined}
    >
      {cells}
    </div>
  );
}

export interface PropertyCellProps {
  children?: ReactNode;
  className?: string;
}

/** Property name. Truncates rather than widening the column. */
export function PropertyGridLabel({ children, className }: PropertyCellProps) {
  return (
    <span
      className={cn(
        "text-[10px] truncate text-[var(--editor-label-fg,var(--text-secondary))]",
        className,
      )}
      title={typeof children === "string" ? children : undefined}
    >
      {children}
    </span>
  );
}

/**
 * A value or control cell. `min-w-0` matters: without it a grid item refuses to
 * shrink below its content's intrinsic width and the fixed track silently widens.
 */
export function PropertyGridValue({ children, className }: PropertyCellProps) {
  return <div className={cn("min-w-0", className)}>{children}</div>;
}

/** Trailing controls — lock, reset, menu. Sized by content. */
export function PropertyGridActions({
  children,
  className,
}: PropertyCellProps) {
  return (
    <div className={cn("flex items-center gap-1 justify-end", className)}>
      {children}
    </div>
  );
}

PropertyGrid.Row = PropertyGridRow;
PropertyGrid.Label = PropertyGridLabel;
PropertyGrid.Value = PropertyGridValue;
PropertyGrid.Actions = PropertyGridActions;
