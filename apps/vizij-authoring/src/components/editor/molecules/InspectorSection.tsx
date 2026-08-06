import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../utils/cn";

export interface InspectorSectionProps {
  /**
   * Left side of the header.
   *
   * A **string** gets the standard section-label treatment (small, uppercase,
   * muted). Anything else renders as-is, which is how a section with a
   * name-plus-subtitle block keeps its own layout without a second component.
   */
  title: ReactNode;
  /**
   * Item count, rendered right-aligned and monospaced. Passing it also enables
   * `emptyMessage`: a section that knows its count is a section that can say
   * when it is empty.
   */
  count?: number;
  /**
   * Right-aligned metadata that is not a count — `"3 poses"`, an id, a duration.
   * Gets the same muted mono treatment as `count`.
   */
  meta?: ReactNode;
  /**
   * Right-aligned controls (usually a button). Rendered verbatim, so the caller
   * owns its layout. Independent of `count`/`meta`; a section may have both.
   */
  action?: ReactNode;
  /** Rendered instead of `children` when `count` is exactly 0. */
  emptyMessage?: ReactNode;
  className?: string;
  /** Applied to the header row, for sections that need different alignment. */
  headerClassName?: string;
  children?: ReactNode;
}

const LABEL_STYLE: CSSProperties = {
  color: "var(--editor-muted-fg, var(--text-muted))",
};

const SURFACE_STYLE: CSSProperties = {
  // `oklab` rather than `srgb` because these mixes replace Tailwind's own
  // `/60` and `/35` opacity modifiers, which compile to `color-mix(in oklab,
  // …)`. Matching the space keeps the surfaces pixel-identical.
  borderColor:
    "color-mix(in oklab, var(--editor-border, var(--border-default)) 60%, transparent)",
  backgroundColor:
    "color-mix(in oklab, var(--editor-panel-bg, var(--bg-panel)) 35%, transparent)",
};

/**
 * The titled, faintly-inset box an inspector is built out of: a header with a
 * label and optional count or controls, then content.
 *
 * Its whole job is to make "a group of related properties" a *thing* rather than
 * a `div` with six utility classes — which is what it had become in this app,
 * where the same class string was hand-written thirteen times in a single file
 * and had already drifted apart in three of them.
 *
 * Empty state is built in: give it a `count` and an `emptyMessage` and it
 * renders the message at zero instead of an empty box, so callers stop writing
 * the ternary themselves.
 */
export function InspectorSection({
  title,
  count,
  meta,
  action,
  emptyMessage,
  className,
  headerClassName,
  children,
}: InspectorSectionProps) {
  const showEmptyMessage = count === 0 && emptyMessage;

  return (
    <div
      className={cn("rounded border px-2 py-2 flex flex-col gap-2", className)}
      style={SURFACE_STYLE}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2",
          headerClassName,
        )}
      >
        {typeof title === "string" ? (
          <span
            className="text-[10px] uppercase tracking-wider"
            style={LABEL_STYLE}
          >
            {title}
          </span>
        ) : (
          title
        )}
        {typeof count === "number" ? (
          <span className="text-[10px] font-mono" style={LABEL_STYLE}>
            {count}
          </span>
        ) : null}
        {meta !== undefined && meta !== null ? (
          <span className="text-[10px] font-mono" style={LABEL_STYLE}>
            {meta}
          </span>
        ) : null}
        {action}
      </div>
      {showEmptyMessage ? (
        <p className="text-[10px]" style={LABEL_STYLE}>
          {emptyMessage}
        </p>
      ) : (
        children
      )}
    </div>
  );
}
