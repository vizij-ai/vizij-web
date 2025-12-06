import type { InputHTMLAttributes } from "react";
import "./switch.css";

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  size?: "sm" | "md";
}

export function Switch({
  label,
  hint,
  className,
  size = "md",
  ...props
}: SwitchProps) {
  const classes = ["switch", `switch--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes}>
      <input type="checkbox" className="switch__input" {...props} />
      <span className="switch__track">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">
        {label}
        {hint ? <span className="switch__hint">{hint}</span> : null}
      </span>
    </label>
  );
}
