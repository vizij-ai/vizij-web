import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { cn } from "../../utils/cn";
import { Input } from "./Input";
import {
  resolveSliderDefaultPercent,
  resolveSnappedSliderValue,
} from "./sliderDefaultBehavior";

export interface RowSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  defaultValue?: number;
  snapThreshold?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

export function RowSlider({
  value,
  min,
  max,
  step,
  defaultValue,
  snapThreshold,
  onChange,
  disabled = false,
  label,
  className = "",
}: RowSliderProps) {
  const [inputValue, setInputValue] = useState(() => String(value));
  const defaultPercent = resolveSliderDefaultPercent({
    defaultValue,
    min,
    max,
  });

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleRangeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = resolveSnappedSliderValue(parseFloat(event.target.value), {
      defaultValue,
      min,
      max,
      step,
      snapThreshold,
    });
    if (Number.isFinite(newValue)) {
      onChange(newValue);
      setInputValue(String(newValue));
    }
  };

  const handleNumberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    setInputValue(rawValue);
    const newValue = parseFloat(rawValue);
    if (!Number.isNaN(newValue)) {
      onChange(newValue);
    }
  };

  const handleNumberBlur = () => {
    setInputValue(String(value));
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 flex-grow min-w-0 inspector-row-hit-target",
        className,
      )}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {label && (
        <label className="text-[10px] text-text-secondary font-bold whitespace-nowrap uppercase tracking-tighter">
          {label}
        </label>
      )}
      <div className="relative flex-1 min-w-0">
        {defaultPercent !== null ? (
          <span
            data-testid="slider-default-marker"
            className="pointer-events-none absolute top-1/2 z-[1] h-3 w-0.5 -translate-y-1/2 rounded-full bg-amber-200/90 shadow-[0_0_0_1px_rgba(17,24,39,0.7)]"
            style={{ left: `calc(${defaultPercent}% - 1px)` }}
          />
        ) : null}
        <input
          type="range"
          className={cn(
            "flex-1 min-w-0 h-1.5 w-full bg-zinc-800/60 rounded-full cursor-pointer appearance-none transition-all duration-200",
            "accent-blue-500 hover:accent-blue-400",
            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:hover:scale-125 [&::-webkit-slider-thumb]:hover:bg-blue-400",
            "[&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:hover:scale-125 [&::-moz-range-thumb]:hover:bg-blue-400",
          )}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleRangeChange}
          disabled={disabled}
          aria-label={label || "Value slider"}
        />
      </div>
      <Input
        type="number"
        className="inspector-numeric-control flex-none text-center text-[10px] tabular-nums font-black bg-zinc-950/40 border-zinc-800/60 h-6 p-0 transition-all hover:border-zinc-700/80 focus:border-blue-500/50"
        value={inputValue}
        onChange={handleNumberChange}
        onBlur={handleNumberBlur}
        disabled={disabled}
        step={step}
        min={min}
        max={max}
        aria-label={label ? `${label} value` : "Value"}
      />
    </div>
  );
}
