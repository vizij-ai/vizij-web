import { memo } from "react";
import { SliderNumberField, Size } from "@semio/ui";
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
    <SliderNumberField
      value={value || defaultValue || 0}
      onChange={onChange}
      min={min}
      max={max}
      size={Size.Sm}
      strictSlider={min !== undefined && max !== undefined && min !== -Infinity && max !== Infinity}
    />
  );
}

export const NumberSlider = memo(InnerNumberSlider);
