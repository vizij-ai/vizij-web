import type { KeyboardEvent } from "react";
import { Slider as RadixSlider } from "radix-ui";
import { cn } from "../../utils/cn";
import {
  resolveSliderDefaultPercent,
  resolveSnappedSliderValue,
} from "./sliderDefaultBehavior";

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  snapThreshold?: number;
  fillMode?: "none" | "value";
  onChange?: (value: number | number[]) => void;
  disabled?: boolean;
  className?: string;
}

/** Keys radix's Slider handles itself; see SliderImpl.onKeyDown. */
const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
]);

/**
 * Track slider, built on `radix-ui`'s Slider.
 *
 * radix rather than `@semio/ui`: semio ships no standalone Slider. Its
 * `SliderNumberField` renders an `<input>` and would not satisfy the
 * `role="slider"` assertions this app depends on. `radix-ui` is the same
 * primitive stack `@semio/ui` itself is built on, so this keeps one stack.
 *
 * Four things are deliberate:
 *
 * 1. **`RadixSlider.Range` is not rendered.** `fillMode` has to be suppressible,
 *    and the manual `bg-accent` span already draws the fill from `valuePercent`.
 *    Adding `Range` would double-draw it and change every `fillMode="none"` site.
 * 2. **Our `defaultValue` is never forwarded to `Root`.** radix's `defaultValue`
 *    is a `number[]` meaning "uncontrolled initial value"; ours is the amber
 *    marker anchor and snap target. Forwarding it would make the slider
 *    partially uncontrolled.
 * 3. **The marker carries `z-[1]`.** radix's thumb wrapper is
 *    `position: absolute`, so without it the thumb paints over the marker as it
 *    passes. Base UI's thumb created no such stacking order.
 * 4. **Slider keys stop propagating.** Base UI's thumb called
 *    `stopPropagation()` for composite keys; radix calls only
 *    `preventDefault()`. Without this, arrow keys would newly bubble out to
 *    ancestor Collapsible triggers and scrub handlers. Only the keys radix
 *    actually consumes are stopped, so global shortcuts still work.
 *
 * No horizontal padding on `Root`: radix maps pointer position using the ROOT's
 * bounding rect, not the track's, so padding would skew the hit mapping — and
 * `InspectorContent.tsx:426` overlays extra absolute markers positioned against
 * a wrapper that assumes Root and Track stay coextensive.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  snapThreshold,
  fillMode = "none",
  onChange,
  disabled = false,
  className,
}: SliderProps) {
  const safeValue = Number.isFinite(value) ? value : min;
  const valuePercent =
    max > min
      ? Math.max(0, Math.min(100, ((safeValue - min) / (max - min)) * 100))
      : 0;
  const defaultPercent = resolveSliderDefaultPercent({
    defaultValue,
    min,
    max,
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (SLIDER_KEYS.has(event.key)) {
      event.stopPropagation();
    }
  };

  return (
    <RadixSlider.Root
      value={[safeValue]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onKeyDown={handleKeyDown}
      onValueChange={(values) => {
        if (!onChange) return;
        const numericValue = values[0];
        if (!Number.isFinite(numericValue)) {
          return;
        }
        onChange(
          resolveSnappedSliderValue(numericValue, {
            defaultValue,
            min,
            max,
            step,
            snapThreshold,
          }),
        );
      }}
      className={cn(
        "relative flex items-center select-none touch-none w-full h-6",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <RadixSlider.Track className="relative flex-grow h-full cursor-pointer">
        <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-800" />
        {defaultPercent !== null ? (
          <span
            data-testid="slider-default-marker"
            className="pointer-events-none absolute top-1/2 z-[1] h-3 w-0.5 -translate-y-1/2 rounded-full bg-amber-200/90 shadow-[0_0_0_1px_rgba(17,24,39,0.7)]"
            style={{ left: `calc(${defaultPercent}% - 1px)` }}
          />
        ) : null}
        {fillMode === "value" ? (
          <span
            className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
            style={{ width: `${valuePercent}%` }}
          />
        ) : null}
        <RadixSlider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-transform" />
      </RadixSlider.Track>
    </RadixSlider.Root>
  );
}
