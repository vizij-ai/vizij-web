import type {
  KeyboardEvent,
  MouseEvent,
  ReactNode,
  HTMLAttributes,
} from "react";
import { cn } from "../../utils/cn";

/**
 * `HTMLAttributes` already declares an `onSelect` (the DOM text-selection event),
 * so it has to be omitted before the row can use that name for row activation.
 */
interface ListRowProps
  extends Omit<
    HTMLAttributes<HTMLDivElement>,
    "title" | "children" | "onSelect"
  > {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /**
   * Paints the accent selected surface: a 60% accent border over a 10% accent
   * fill, the same pair `ControlRow` and `PropertyGridRow` use, so a selected row
   * looks the same whichever layer drew it. Selected rows drop the hover and
   * press surfaces — they would otherwise wash the accent back out.
   */
  selected?: boolean;
  /**
   * Whole-row activation. Supplying it is what makes the row a `role="button"`,
   * tab-reachable and operable with Enter and Space. Without it the row keeps its
   * previous, purely presentational semantics.
   */
  onSelect?: () => void;
  /** `false` makes an `onSelect` row inert: not tab-reachable, `aria-disabled`. */
  selectable?: boolean;
  /** The wrapper around `children`, whose default top margin is often too much. */
  bodyClassName?: string;
}

/**
 * A bordered list card: title and optional description on the left, `meta` and
 * `actions` on the right, arbitrary `children` below.
 *
 * ## Selection
 *
 * `selected` + `onSelect` follow `ControlRow`'s conventions — `role="button"`,
 * `tabIndex`, activation on click, Enter and Space with `preventDefault` so Space
 * does not scroll, `selectable={false}` for an inert row marked `aria-disabled`,
 * and the accent surface pair at 60%/10%. Two deliberate differences:
 *
 * 1. **The button role is conditional on `onSelect`.** `ControlRow` always exists
 *    to be selected, so it can be unconditional; `ListRow` has non-interactive
 *    consumers (`StandardInputCoveragePanel`, `GraphDiagnosticsPanel`) that would
 *    otherwise become tab stops announced as buttons, with their own buttons
 *    nested inside. This is `PropertyGridRow`'s gating rule, applied to
 *    `onSelect`.
 * 2. **Surfaces are Tailwind opacity modifiers, not literal `color-mix`.**
 *    `ControlRow` writes `color-mix(in oklab, var(--editor-accent, …) 60%, …)`
 *    because it needs the `--editor-*` fallback chain, which a modifier cannot
 *    express. `ui/` may not use those tokens, and `border-accent/60` compiles to
 *    the same `color-mix(in oklab, …)`, so the rendered colour is identical.
 *
 * An `onSelect` row fires on any click inside it that has not been stopped, so
 * interactive children (`actions`, buttons in `children`) must
 * `stopPropagation()`.
 */
export function ListRow({
  title,
  meta,
  actions,
  description,
  className,
  children,
  selected = false,
  onSelect,
  selectable = true,
  bodyClassName,
  onClick,
  onKeyDown,
  ...rest
}: ListRowProps) {
  const interactive = Boolean(onSelect);

  const select = () => {
    if (!selectable) return;
    onSelect?.();
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    onClick?.(event);
    select();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!selectable) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    select();
  };

  return (
    <div
      className={cn(
        "border rounded-xl p-4 shrink-0 flex flex-col gap-2 transition-all shadow-sm cursor-pointer",
        selected
          ? "border-accent/60 bg-accent/10"
          : "border-border-default/60 bg-bg-panel/40 hover:bg-bg-hover hover:border-border-hover active:bg-bg-active active:scale-[0.99]",
        interactive &&
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? (selectable ? 0 : -1) : undefined}
      aria-disabled={interactive && !selectable ? true : undefined}
      data-selected={selected ? "true" : undefined}
      onClick={interactive ? handleClick : onClick}
      onKeyDown={interactive ? handleKeyDown : onKeyDown}
      {...rest}
    >
      <div className="flex justify-between gap-3 items-start">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="font-bold text-text-primary text-[13px] leading-tight">
            {title}
          </div>
          {description ? (
            <div className="text-text-muted text-[11px] leading-relaxed">
              {description}
            </div>
          ) : null}
        </div>
        <div className="inline-flex items-center gap-2 shrink-0">
          {meta ? (
            <div className="text-[10px] text-text-secondary font-medium">
              {meta}
            </div>
          ) : null}
          {actions ? (
            <div className="flex items-center gap-1.5">{actions}</div>
          ) : null}
        </div>
      </div>
      {children ? (
        <div className={cn("mt-2", bodyClassName)}>{children}</div>
      ) : null}
    </div>
  );
}
