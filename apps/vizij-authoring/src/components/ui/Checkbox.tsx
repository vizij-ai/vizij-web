import { type ReactNode } from "react";
import { Checkbox as SemioCheckbox, Size, Variant } from "@semio/ui";
import { cn } from "../../utils/cn";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * Checkbox, built on `@semio/ui`'s `Checkbox` (Radix under the hood, so
 * `role="checkbox"` is preserved for the 6 role assertions across the suite).
 *
 * Fixes two bugs in the previous implementation:
 *
 * 1. It styled its checked state with Radix-flavoured `data-[state=checked]:`
 *    selectors while running on Base UI, which emits `data-checked` — so the
 *    accent fill and the check glyph never actually appeared. semio owns that
 *    styling now and it works.
 * 2. The label carried BOTH `htmlFor` and an `onClick` that toggled, so with an
 *    `id` present a label click fired twice and cancelled itself out. The label
 *    now toggles via `htmlFor` when an `id` exists and via `onClick` only when
 *    it does not.
 *
 * `label` stays local because semio's `Checkbox` has no label slot, which also
 * keeps it as `ReactNode` rather than `string`.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  className,
  id,
}: CheckboxProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2",
        // semio sizes its check glyph `h-4/5 w-4/5`, but the parent it measures
        // against — RadixCheckbox.Indicator — is a `grid` span with no definite
        // size, so it shrink-wraps to the icon and the percentage collapses. The
        // result is a 12px tick floating in a 28px box (~43%, not 80%). Giving the
        // indicator a definite size makes semio's own intent resolve correctly.
        // Styled from here because semio's Checkbox accepts no className.
        "[&_[role=checkbox]>span]:size-full",
        // semio's Checkbox sets no cursor, so it inherits the default arrow and
        // does not read as clickable. It accepts no className, so this is styled
        // from here alongside the indicator fix above.
        "[&_[role=checkbox]]:cursor-pointer",
        "[&_[role=checkbox]:disabled]:cursor-not-allowed",
        className,
      )}
    >
      <SemioCheckbox
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        size={Size.Sm}
        // Accent fill when checked, matching Switch. semio's default variant
        // would render the checked state in zinc.
        variant={Variant.Primary}
      />
      {label && (
        <label
          htmlFor={id}
          className={cn(
            "text-xs font-medium text-text-secondary",
            disabled
              ? "cursor-not-allowed opacity-50"
              : "cursor-pointer select-none",
          )}
          onClick={id ? undefined : () => !disabled && onChange(!checked)}
        >
          {label}
        </label>
      )}
    </div>
  );
}
