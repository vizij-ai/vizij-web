import type { ReactNode, HTMLAttributes } from "react";
import "./badge.css";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "info" | "muted" | "accent";
  children: ReactNode;
}

export function Badge({
  tone = "accent",
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = ["badge", `badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
