import { forwardRef, type ReactNode } from "react";
import type { InputHTMLAttributes } from "react";
import { TextField, Size } from "@semio/ui";
import { cn } from "../../utils/cn";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  startContent?: ReactNode;
}

const SIZES: Record<"sm" | "md", Size> = {
  sm: Size.Sm,
  md: Size.Md,
};

/**
 * Single-line text input, built on `@semio/ui`'s `TextField`.
 *
 * Preserves two quirks of the previous implementation deliberately, because call
 * sites depend on them:
 *
 * 1. **`className` lands on the wrapper, not the input.** Callers pass sizing
 *    and surface classes expecting to style the outer box — see
 *    `RowSlider.tsx:115` (`inspector-numeric-control ... h-6 p-0`). semio's
 *    `wrapperClassName` is the same seam, so this maps across cleanly.
 * 2. **Native `onChange(event)`.** semio reports `(value, event)`; every caller
 *    reads `event.target.value`.
 *
 * `startContent` maps to semio's `icon`. `endContent` was dropped — it existed
 * on the old interface but had zero call sites.
 *
 * `type` and `placeholder` are forwarded onto the real `<input>`, which is what
 * keeps `PanelSearch`'s `getByRole("searchbox", { name: … })` e2e contract alive.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = "md", startContent, onChange, ...props }, ref) => (
    <TextField
      ref={ref}
      bg
      // semio defaults to `outline="interact"`, which shows the border only on
      // focus. On a panel surface that leaves the field with no visible bounds
      // at rest — it stops reading as an input at all. This app's inputs are
      // always visibly bounded, so the outline is persistent.
      outline="always"
      size={SIZES[size]}
      icon={startContent}
      wrapperClassName={cn("w-full", className)}
      // `rounded-lg` goes on the input, not the wrapper: with
      // `outline="always"` semio draws the persistent outline on the input
      // element, so the wrapper's radius has no effect on the visible bounds.
      // Matches the radius kept on Card and Panel.
      className={cn("rounded-lg", size === "sm" ? "text-xs" : "text-sm")}
      onChange={(_value, event) => onChange?.(event)}
      {...props}
    />
  ),
);

Input.displayName = "Input";
