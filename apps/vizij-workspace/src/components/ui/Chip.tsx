import type { HTMLAttributes, ReactNode } from "react";
import "./chip.css";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "default" | "info" | "success" | "warning" | "danger" | "muted";
  dismissable?: boolean;
  onDismiss?: () => void;
  children: ReactNode;
}

export function Chip({
  tone = "default",
  dismissable = false,
  onDismiss,
  className,
  children,
  ...rest
}: ChipProps) {
  const classes = ["chip", `chip--${tone}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      <span className="chip__label">{children}</span>
      {dismissable ? (
        <button
          type="button"
          className="chip__dismiss"
          aria-label="Remove"
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
