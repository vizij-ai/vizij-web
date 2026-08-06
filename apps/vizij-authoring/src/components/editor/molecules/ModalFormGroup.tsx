import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../../utils/cn";

export interface ModalFormGroupProps {
  /**
   * Group heading. **Bold, sentence-case, primary** — deliberately unlike
   * `InspectorSection`'s small uppercase muted label. See the docblock.
   */
  title?: ReactNode;
  /**
   * Vertical rhythm between children. `"loose"` is for groups whose children are
   * whole labelled controls; `"tight"` for lists of similar rows. The two map to
   * the `space-y-3` / `space-y-2` split the five migrated sites already used —
   * this is a named choice rather than a free number so the two settle into a
   * pair instead of drifting apart again.
   */
  spacing?: "tight" | "loose";
  children?: ReactNode;
  className?: string;
}

const SURFACE_STYLE: CSSProperties = {
  // `oklab` because these replace Tailwind's `/60` and `/40` modifiers, which
  // compile to `color-mix(in oklab, …)`. Matching the space keeps the card
  // pixel-identical.
  borderColor:
    "color-mix(in oklab, var(--editor-border, var(--border-default)) 60%, transparent)",
  backgroundColor:
    "color-mix(in oklab, var(--editor-panel-bg, var(--bg-panel)) 40%, transparent)",
};

/**
 * A titled card that groups the controls of one step in a modal form.
 *
 * **A sibling of `InspectorSection`, not a variant of it.** The two look similar
 * — bordered, inset, titled — and it is tempting to merge them, which is exactly
 * what was declined when `InspectorSection` was adopted across `VariablesPanel`.
 * The difference is the header: a modal form group announces itself in **bold
 * sentence-case primary** text (`Destination`, `Value Merge`, `Target mappings`),
 * where an inspector section uses a small uppercase muted label with an optional
 * count. Forcing them together would restyle five modal headers to match a
 * density built for a narrow inspector column — a design decision dressed up as a
 * refactor.
 *
 * The other structural difference: these space their children with a vertical
 * rhythm (`spacing`) rather than exposing a count and an empty message, because a
 * form step is a sequence of controls, not a list of items.
 */
export function ModalFormGroup({
  title,
  spacing = "loose",
  children,
  className,
}: ModalFormGroupProps) {
  return (
    <section
      className={cn(
        "rounded border p-3",
        spacing === "loose" ? "space-y-3" : "space-y-2",
        className,
      )}
      style={SURFACE_STYLE}
    >
      {title !== undefined && title !== null ? (
        <div className="text-xs font-semibold text-[var(--editor-value-fg,var(--text-primary))]">
          {title}
        </div>
      ) : null}
      {children}
    </section>
  );
}
