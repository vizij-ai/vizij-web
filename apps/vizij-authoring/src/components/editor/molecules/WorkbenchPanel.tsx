import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Info, X } from "lucide-react";
import { cn } from "../../../utils/cn";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Tooltip } from "../../ui/Tooltip";

export interface WorkbenchPanelProps
  extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  /** Panel heading. With no title/description/badge/actions/onClose, no header renders. */
  title?: ReactNode;
  /** Rendered as a hoverable info icon beside the title, never as inline text. */
  description?: ReactNode;
  /** Trailing header slot. A `string`/`number` is auto-wrapped in `<Badge>`. */
  badge?: ReactNode;
  /** Header controls, rendered before the close button. */
  actions?: ReactNode;
  /** When provided, renders the standard close affordance after `actions`. */
  onClose?: () => void;
  /** Tooltip/`title` text on the close button. */
  closeLabel?: string;
  /** `data-testid` for the close button — several are load-bearing e2e hooks. */
  closeTestId?: string;
  /** Extra classes on the close button (sizing, mostly). */
  closeClassName?: string;
  /**
   * How the panel claims height inside its dock. `"flex"` (default) is
   * `flex-1`, for the usual flex-column dock; `"full"` is `h-full`, for a
   * panel whose parent is not a flex column.
   */
  fill?: "flex" | "full";
  headerClassName?: string;
  titleClassName?: string;
  children?: ReactNode;
}

/**
 * The scaffold every dockable panel in an editor workspace shares: a header with
 * a title, an optional description tooltip, optional actions and badge, an
 * optional "hide this panel" affordance, and a body that fills the rest.
 *
 * ## Why this is not `ui/Panel` plus a `className`
 *
 * Nine call sites in this app were passing the identical string
 * `"flex-1 min-h-0 border-none bg-transparent shadow-none p-0"` alongside a
 * hand-rolled close `<Button>`. Three of those five overrides are now dead:
 * `ui/Panel` is flat, so there is no border, background or shadow left to
 * cancel. Only the layout half was ever real — claim the dock's height, allow
 * shrinking, and drop `ui/Panel`'s `p-3`, because a workbench panel's body owns
 * its own padding (it is usually a scroll container, and padding on a scroller
 * clips wrong). Here that layout is the default rather than an override, and the
 * close button is a prop rather than eight copies of the same JSX.
 *
 * ## Why it re-renders the header instead of wrapping `ui/Panel`
 *
 * This layer has to be themeable from outside this app (see `../README.md`), and
 * a wrapper cannot reach inside `ui/Panel` to re-point its colours at
 * `--editor-*`. The header below is deliberately class-for-class equivalent to
 * `ui/Panel`'s — same flex structure, same sizes, same `Badge`/`Tooltip`
 * primitives — with only colours and two metrics routed through custom
 * properties that fall back to this app's tokens. Inside vizij-authoring it
 * computes to exactly what `ui/Panel` computed to, which matters: there are
 * pixel-diffing e2e snapshots over `inspector-panel` and the Face Elements
 * sidebar section.
 *
 * Tokens read here (all listed in `../THEMING.md`):
 * `--editor-panel-fg`, `--editor-label-fg`, `--editor-accent`,
 * `--editor-panel-gap`, `--editor-panel-header-min-height`.
 *
 * No background is painted. A workbench panel is transparent over whatever
 * surface its dock provides — hence no use of `--editor-panel-bg`.
 *
 * Children render as direct children of the flex column, not inside a body
 * wrapper: several panels rely on being the flex child that grows.
 */
export function WorkbenchPanel({
  title,
  description,
  badge,
  actions,
  onClose,
  closeLabel = "Hide panel",
  closeTestId,
  closeClassName,
  fill = "flex",
  className,
  headerClassName,
  titleClassName,
  children,
  ...rest
}: WorkbenchPanelProps) {
  // Honest note on the close button's colour: `ui/Button`'s ghost variant emits
  // `text-text-muted!` / `hover:text-text-primary!`, and tailwind-merge does not
  // treat those as conflicting with the classes below, so the important ones win
  // inside this app. The eight call sites this replaced passed
  // `text-text-secondary hover:text-text-primary` and lost the same fight, so
  // the rendered colour is unchanged by the extraction. The `--editor-*` classes
  // are kept because they are this layer's contract and they do take effect
  // outside this app (or once `ui/Button` stops emitting important colours).
  // `text-[color:…]` rather than bare `text-[…]` so tailwind-merge classifies
  // them as text colours at all.
  const closeButton = onClose ? (
    <Button
      variant="ghost"
      size="icon"
      data-testid={closeTestId}
      className={cn(
        "h-6 w-6 text-[color:var(--editor-label-fg,var(--text-secondary))] hover:text-[color:var(--editor-panel-fg,var(--text-primary))]",
        closeClassName,
      )}
      onClick={onClose}
      title={closeLabel}
    >
      <X className="h-4 w-4" />
    </Button>
  ) : null;

  const hasHeader = Boolean(
    title || description || badge || actions || closeButton,
  );

  const renderBadge = () => {
    if (badge === undefined || badge === null || badge === false) return null;
    return typeof badge === "string" || typeof badge === "number" ? (
      <Badge>{badge}</Badge>
    ) : (
      badge
    );
  };

  return (
    <section
      className={cn(
        "flex flex-col min-h-0 gap-[var(--editor-panel-gap,0.75rem)] text-[color:var(--editor-panel-fg,var(--text-primary))]",
        fill === "full" ? "h-full" : "flex-1",
        className,
      )}
      {...rest}
    >
      {hasHeader && (
        <header
          className={cn(
            "flex justify-between items-center gap-4 min-h-[var(--editor-panel-header-min-height,24px)]",
            headerClassName,
          )}
        >
          <div className="flex items-center gap-2 pl-1">
            {title ? (
              <p
                className={cn(
                  "text-sm font-semibold m-0 leading-tight pl-2 text-[color:var(--editor-panel-fg,var(--text-primary))]",
                  titleClassName,
                )}
              >
                {title}
              </p>
            ) : null}
            {description ? (
              <Tooltip content={description} side="right">
                <Info className="w-3.5 h-3.5 transition-colors cursor-help text-[color:var(--editor-label-fg,var(--text-secondary))] hover:text-[color:var(--editor-accent,var(--color-accent))]" />
              </Tooltip>
            ) : null}
          </div>
          {(badge || actions || closeButton) && (
            <div className="flex items-center gap-2 shrink-0">
              {actions}
              {closeButton}
              {renderBadge()}
            </div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

WorkbenchPanel.displayName = "WorkbenchPanel";
