import React from "react";
import { TextField, Size } from "@semio/ui";
import { IconChevronUp, IconChevronDown } from "@tabler/icons-react";
import { cn } from "../../utils/cn";

export interface NumberFieldProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: Intl.NumberFormatOptions;
  onChange?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  placeholder?: string;
  commitMode?: "immediate" | "blur";
  allowScrub?: boolean;
}

const SIZES: Record<"sm" | "md", Size> = {
  sm: Size.Sm,
  md: Size.Md,
};

/** Pixels of horizontal travel before a press becomes a scrub rather than a click. */
const SCRUB_THRESHOLD_PX = 3;

/**
 * Render `value` for display. With `format` this is `Intl.NumberFormat`, which is
 * how the four-decimal contract is met (`InspectorContent`/`InspectorPanel` pass
 * `minimumFractionDigits: 4`). Grouping is disabled unless a caller asks for it,
 * because separators would otherwise have to be stripped back out on parse.
 */
function formatValue(value: number, format?: Intl.NumberFormatOptions): string {
  if (!Number.isFinite(value)) return "";
  if (!format) return String(value);
  return new Intl.NumberFormat(undefined, {
    useGrouping: false,
    ...format,
  }).format(value);
}

/** Parse typed text, tolerating grouping separators a caller's format may add. */
function parseValue(text: string): number {
  const cleaned = text.replace(/[^0-9eE+\-.]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return NaN;
  return Number(cleaned);
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (typeof min === "number") next = Math.max(min, next);
  if (typeof max === "number") next = Math.min(max, next);
  return next;
}

/**
 * Numeric input with formatting, steppers, keyboard stepping and drag scrubbing.
 *
 * **Why this is app-owned rather than semio's `NumberField`.** semio's renders
 * `formatDisplayValue(value, 2)` — two decimals, hardcoded, with no formatting
 * hook — so it cannot express `docs/UI_DESIGN.md`'s "exactly four digits after the
 * decimal". Because it owns its input's `value`, that is not fixable from outside.
 * It also ships no steppers, never wires `useNumeric`'s `onStepUp`/`onStepDown`,
 * and has no scrub area. `SliderNumberField` *does* scrub (with useful
 * `onDragStartNative`/`onDragEndNative` hooks for undo transactions) but inherits
 * the same 2-decimal display and renders a filled progress track, which is a much
 * heavier visual in a dense inspector row.
 *
 * So semio is used for everything except the numeric engine: **`TextField`
 * supplies the input chrome** — surface, persistent outline, focus ring, caret
 * colour and `sized-height`/`sized-text` scale — and it forwards `value`,
 * `onFocus`, `onBlur` and `onKeyDown` untouched (it only overrides `onChange` and
 * `className`, unlike `NumberField`, which intercepts the focus handlers). This
 * component owns formatting, parsing, clamping, stepping and scrubbing.
 *
 * Behaviour restored to match the pre-migration Base UI version:
 * - `format` honoured via `Intl.NumberFormat`, so four decimals work again.
 * - Stepper buttons, absolutely positioned inside `TextField`'s box.
 * - ArrowUp/ArrowDown step by `step`; Enter commits.
 * - Drag scrubbing when `allowScrub`, past a 3px threshold so a plain click still
 *   places the caret.
 * - `commitMode="blur"` buffers; `"immediate"` reports every valid parse.
 * - `allowScrub={false}` stops `mousedown`/`pointerdown` propagating, which
 *   `UI_DESIGN.md` requires (a numeric field must never start a row drag) and
 *   `NumberField.test.tsx` guards.
 */
export function NumberField({
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
  disabled = false,
  className,
  size = "md",
  placeholder,
  commitMode = "immediate",
  allowScrub = true,
}: NumberFieldProps) {
  const [text, setText] = React.useState(() => formatValue(value, format));
  const [focused, setFocused] = React.useState(false);

  // Re-sync from the prop unless the user is mid-edit, which would fight typing.
  React.useEffect(() => {
    if (!focused) setText(formatValue(value, format));
  }, [value, format, focused]);

  const commit = React.useCallback(
    (raw: number) => {
      if (!Number.isFinite(raw)) return;
      onChange?.(clamp(raw, min, max));
    },
    [onChange, min, max],
  );

  const applyStep = React.useCallback(
    (direction: 1 | -1) => {
      if (disabled) return;
      const base = Number.isFinite(value) ? value : 0;
      const next = clamp(base + direction * step, min, max);
      setText(formatValue(next, format));
      onChange?.(next);
    },
    [disabled, value, step, min, max, format, onChange],
  );

  const handleTextChange = (next: string) => {
    setText(next);
    if (commitMode === "immediate") {
      const parsed = parseValue(next);
      if (Number.isFinite(parsed)) commit(parsed);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseValue(text);
    if (Number.isFinite(parsed)) {
      commit(parsed);
    } else {
      setText(formatValue(value, format));
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applyStep(1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applyStep(-1);
    } else if (event.key === "Enter") {
      const parsed = parseValue(text);
      if (Number.isFinite(parsed)) commit(parsed);
    }
  };

  // --- scrubbing -----------------------------------------------------------
  const scrub = React.useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
    active: boolean;
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowScrub) {
      // The guarded contract: never let a numeric field start an ancestor drag.
      event.stopPropagation();
      return;
    }
    if (disabled || event.button !== 0) return;
    scrub.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: Number.isFinite(value) ? value : 0,
      active: false,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = scrub.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const delta = event.clientX - state.startX;
    if (!state.active) {
      if (Math.abs(delta) < SCRUB_THRESHOLD_PX) return;
      state.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const next = clamp(state.startValue + delta * step, min, max);
    setText(formatValue(next, format));
    onChange?.(next);
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = scrub.current;
    if (
      state?.active &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scrub.current = null;
  };

  const stepperButton = (direction: 1 | -1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      disabled={disabled}
      onPointerDown={(event) => event.preventDefault()}
      onClick={() => applyStep(direction)}
      className="flex flex-1 cursor-pointer items-center justify-center text-text-muted hover:bg-bg-hover hover:text-text-primary active:bg-bg-active disabled:cursor-not-allowed disabled:pointer-events-none"
    >
      {direction === 1 ? (
        <IconChevronUp size={size === "sm" ? 8 : 10} />
      ) : (
        <IconChevronDown size={size === "sm" ? 8 : 10} />
      )}
    </button>
  );

  return (
    <div
      className={cn("relative w-full", className)}
      onMouseDown={allowScrub ? undefined : (e) => e.stopPropagation()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
    >
      <TextField
        value={text}
        onChange={(next) => handleTextChange(next)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        size={SIZES[size]}
        bg
        outline="always"
        inputMode="decimal"
        wrapperClassName="w-full"
        className={cn(
          "rounded-md pr-5 tabular-nums",
          allowScrub ? "cursor-ew-resize!" : "cursor-text!",
          size === "sm" ? "text-xs" : "text-sm",
        )}
      />
      <div className="absolute inset-y-0 right-0 flex w-5 flex-col border-l border-border-default">
        {stepperButton(1)}
        {stepperButton(-1)}
      </div>
    </div>
  );
}
