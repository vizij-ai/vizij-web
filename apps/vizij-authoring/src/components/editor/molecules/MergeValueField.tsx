import type { CSSProperties, ReactNode } from "react";
import { Button } from "../../ui/Button";
import { cn } from "../../../utils/cn";

export interface MergeValueFieldProps {
  /**
   * The label, **already styled by the caller** — this component places it and
   * nothing more. The three migrated sites use three different treatments (12px
   * muted beside the input, 10px uppercase above it, none at all), so styling it
   * here would have to fight two of them.
   */
  label?: ReactNode;
  /**
   * Where the label goes. `"beside"` puts it in its own leading column;
   * `"above"` stacks it over the input inside the first column.
   *
   * This prop exists because the label placement is the one thing that genuinely
   * differs between the sites — the input and the action pair are identical. An
   * earlier read of these three assumed only the draft setter differed; that was
   * true of everything except this.
   */
  labelPlacement?: "beside" | "above";
  /** The draft's current text. Controlled; this component holds no state. */
  value: string;
  onValueChange: (next: string) => void;
  /**
   * The destination's existing value. Non-finite or absent swaps the button for
   * `emptyLabel`.
   */
  currentValue?: number | null;
  /**
   * Take `currentValue`. The **caller** converts and writes it — that is what
   * keeps this component free of the app's draft machinery.
   */
  onUseCurrent: () => void;
  /**
   * e.g. `"Use current min"`. The component appends ` (n)` itself, so callers
   * cannot drift on the number formatting.
   */
  useCurrentLabel: string;
  /**
   * Shown in place of the button when there is no current value. A **separate**
   * prop from `useCurrentLabel` because the two are not derivable from each
   * other: one site pairs "Use current min" with "No current main face value".
   */
  emptyLabel: string;
  disabled?: boolean;
  className?: string;
}

/** Matches every migrated site; kept here so the three cannot drift apart. */
const VALUE_DECIMALS = 3;

const INPUT_STYLE: CSSProperties = {
  borderColor: "var(--editor-border, var(--border-default))",
  backgroundColor: "var(--editor-input-bg, var(--bg-input))",
  color: "var(--editor-value-fg, var(--text-primary))",
};

/**
 * One row of a copy/merge decision: what the source has, what you want to write,
 * and a one-click way to keep what the destination already has.
 *
 * ## Why this took a second attempt
 *
 * Three sites in `VariablesPanel` shared this shape, and the first pass through
 * deferred them because each one drives a **different** draft setter:
 * `setVariableCopyValueMergeDraft(key, updater)` writes a flat draft,
 * `setVariableCopyLinkRowDraft(relationship, rowId, updater)` writes one nested
 * under a computed key, and `setPoseCopyTargetRowDraft(rowId, updater)` writes one
 * nested under `value`. There is no shared draft type to extract against.
 *
 * Reading them showed the difference is **only** in how the draft is written —
 * everything visible is identical. So it collapses behind two callbacks and the
 * component never learns what a draft is, the same split
 * `editor/hooks/useRowLock.ts` uses for lock state.
 *
 * The consequence worth stating: `toDecisionCustomValue` and the
 * `setXBlockingMessages([])` reset both stay at the call site, inside
 * `onUseCurrent`/`onValueChange`. This component imports nothing from the app, and
 * the `editor/` eslint boundary is what proves that rather than this comment.
 *
 * ## Layout
 *
 * Deliberately **not** `PropertyGrid`. Two of the three sites are 2-column and one
 * is 3-column, and they live in separate modals — so cross-grid alignment is
 * unreachable no matter what, for the reason recorded in the plan's "Correction:
 * the stage sliders never aligned". Using `PropertyGrid` here would buy the
 * appearance of a shared column system without the substance. The responsive
 * `grid-cols-1 md:grid-cols-[…]` shape the sites already used is kept, collapsing
 * to stacked rows on narrow modals.
 */
export function MergeValueField({
  label,
  labelPlacement = "beside",
  value,
  onValueChange,
  currentValue,
  onUseCurrent,
  useCurrentLabel,
  emptyLabel,
  disabled = false,
  className,
}: MergeValueFieldProps) {
  const hasCurrent =
    typeof currentValue === "number" && Number.isFinite(currentValue);
  const hasLabel = label !== undefined && label !== null;
  const besideLabel = hasLabel && labelPlacement === "beside";

  const input = (
    <input
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
      className="h-8 rounded border px-2 text-xs disabled:opacity-40"
      style={INPUT_STYLE}
    />
  );

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-2",
        besideLabel
          ? "md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center"
          : "md:grid-cols-[minmax(0,1fr)_auto]",
        className,
      )}
    >
      {besideLabel ? <div>{label}</div> : null}
      {hasLabel && labelPlacement === "above" ? (
        <div className="flex flex-col gap-1">
          {label}
          {input}
        </div>
      ) : (
        input
      )}
      {hasCurrent ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="h-8 px-2 text-[10px]"
          onClick={onUseCurrent}
        >
          {useCurrentLabel} ({currentValue.toFixed(VALUE_DECIMALS)})
        </Button>
      ) : (
        <span className="self-center text-[10px] text-[var(--editor-muted-fg,var(--text-muted))]">
          {emptyLabel}
        </span>
      )}
    </div>
  );
}
