import React from "react";
import { NumberField as SemioNumberField, Size } from "@semio/ui";
import { cn } from "../../utils/cn";

export interface NumberFieldProps {
  value: number;
  min?: number;
  max?: number;
  /**
   * NOT HONOURED. semio's `NumberField` has no step concept and never wires
   * `useNumeric`'s `onStepUp`/`onStepDown`, so there is no increment behaviour to
   * size. Kept on the interface so existing call sites keep type-checking.
   */
  step?: number;
  /**
   * NOT HONOURED. semio hardcodes `formatDisplayValue(value, 2)` and exposes no
   * formatting hook. This is the deliberate regression against UI_DESIGN.md's
   * four-decimal contract — see the docblock.
   */
  format?: Intl.NumberFormatOptions;
  onChange?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
  /**
   * Both modes commit on Enter/blur. semio's `useNumeric` buffers keystrokes
   * internally and only reports a valid change on Enter or blur, so
   * `"immediate"` cannot be honoured — see the docblock.
   */
  commitMode?: "immediate" | "blur";
  allowScrub?: boolean;
}

const SIZES: Record<"sm" | "md", Size> = {
  sm: Size.Sm,
  md: Size.Md,
};

/**
 * Numeric input, built on `@semio/ui`'s `NumberField`.
 *
 * **This adoption is a deliberate, accepted regression**, taken to assess how
 * well semio's numeric input fits. semio's is narrower than what this component
 * provided on Base UI, and five things change:
 *
 * 1. **Decimal precision.** semio renders `formatDisplayValue(value, 2)` — two
 *    decimals, hardcoded, no formatting hook. `docs/UI_DESIGN.md` requires
 *    "exactly four digits after the decimal", and `InspectorContent.tsx:465` and
 *    `InspectorPanel.tsx:1277` pass `format` to get it. That contract is now
 *    violated, and `VariablePipelineStages.test.tsx`'s degrees test fails as a
 *    result — deliberately left failing so the regression is visible rather than
 *    silent.
 * 2. **Stepper buttons are gone.** semio renders no increment/decrement control.
 * 3. **Keyboard stepping is gone.** semio never wires `useNumeric`'s
 *    `onStepUp`/`onStepDown`, so ArrowUp/ArrowDown no longer nudge the value.
 * 4. **Drag scrubbing is gone.** semio's `NumberField` has no scrub area. Its
 *    `SliderNumberField` does scrub and exposes native drag callbacks, but renders
 *    a filled progress track — a far larger visual change in the inspector.
 * 5. **`commitMode` collapses to one behaviour.** `useNumeric` buffers keystrokes
 *    and reports a valid change only on Enter or blur, so `"immediate"` now
 *    behaves like `"blur"`. Note this component must NOT add its own blur
 *    buffering on top: doing so intercepts semio's commit and drops it entirely.
 *
 * What IS preserved: `allowScrub={false}` still stops `mousedown`/`pointerdown`
 * propagating, because `UI_DESIGN.md` requires that clicking or typing in a
 * numeric field never starts a row drag, ancestor `CollapsibleRow`s rely on it,
 * and `NumberField.test.tsx` guards it. Plus `min`/`max`, `size`, `placeholder`
 * and `disabled`.
 */
export function NumberField({
  value,
  min,
  max,
  onChange,
  disabled = false,
  className,
  size = "md",
  placeholder,
  allowScrub = true,
}: NumberFieldProps) {
  const handleNonScrubPointerStart = React.useCallback<
    React.MouseEventHandler<HTMLDivElement> &
      React.PointerEventHandler<HTMLDivElement>
  >((event) => {
    event.stopPropagation();
  }, []);

  const field = (
    <SemioNumberField
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      size={SIZES[size]}
      placeholder={placeholder}
      bg
      outline="always"
      className={cn("tabular-nums", size === "sm" ? "text-xs" : "text-sm")}
      onChange={(next: number) => {
        if (!Number.isFinite(next)) {
          return;
        }
        onChange?.(next);
      }}
    />
  );

  return allowScrub ? (
    <div className={cn("w-full", className)}>{field}</div>
  ) : (
    <div
      className={cn("w-full", className)}
      onMouseDown={handleNonScrubPointerStart}
      onPointerDown={handleNonScrubPointerStart}
    >
      {field}
    </div>
  );
}
