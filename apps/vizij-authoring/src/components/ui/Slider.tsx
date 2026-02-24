import { Slider as BaseSlider } from "@base-ui/react";
import { cn } from "../../utils/cn";

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  fillMode?: "none" | "value";
  onChange?: (value: number | number[]) => void;
  disabled?: boolean;
  className?: string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
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

  return (
    <BaseSlider.Root
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={(val) => {
        if (onChange) {
          onChange(val as number);
        }
      }}
      disabled={disabled}
      className={cn(
        "relative flex items-center select-none touch-none w-full h-6",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <BaseSlider.Control className="flex h-full w-full items-center">
        <BaseSlider.Track className="relative flex-grow h-full cursor-pointer">
          <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-zinc-800" />
          {fillMode === "value" ? (
            <span
              className="pointer-events-none absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
              style={{ width: `${valuePercent}%` }}
            />
          ) : null}
          <BaseSlider.Thumb className="block w-3 h-3 bg-white rounded-full shadow-md hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-transform" />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  );
}
