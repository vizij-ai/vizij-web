import React, { useEffect, useState } from "react";
import { Input } from "./Input";

export interface RowSliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
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
  onChange,
  disabled = false,
  label,
  className = "",
}: RowSliderProps) {
  const [inputValue, setInputValue] = useState(() => String(value));

  useEffect(() => {
    setInputValue(String(value));
  }, [value]);

  const handleRangeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(event.target.value);
    if (Number.isFinite(newValue)) {
      onChange(newValue);
      setInputValue(event.target.value);
    }
  };

  const handleNumberChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
      className={`row-slider ${className}`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {label && <label className="row-slider__label">{label}</label>}
      <input
        type="range"
        className="row-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleRangeChange}
        disabled={disabled}
        aria-label={label || "Value slider"}
      />
      <Input
        type="number"
        className="row-slider__value"
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
