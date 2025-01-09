import { memo } from "react";
import { RawNumber } from "@semio/utils";
import "./controller-styles.css";

function InnerNumberSlider({
  value,
  onChange,
  defaultValue,
  min,
  max,
}: {
  value?: RawNumber;
  onChange: (value: RawNumber) => void;
  defaultValue?: RawNumber;
  min?: RawNumber;
  max?: RawNumber;
}) {
  return (
    <input
      type="range"
      className="slider"
      defaultValue={defaultValue}
      value={value}
      onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      min={min}
      max={max}
      step={0.01}
    />
  );
}

export const NumberSlider = memo(InnerNumberSlider);
