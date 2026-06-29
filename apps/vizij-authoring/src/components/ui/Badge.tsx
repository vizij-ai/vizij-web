import type { ReactNode, HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

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
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-widest uppercase border transition-all duration-200",
        tone === "accent" &&
          "bg-accent-subtle border-accent/50 text-accent shadow-sm",
        tone === "info" && "bg-bg-secondary border-border-default text-text-secondary",
        tone === "muted" && "bg-bg-secondary/60 border-border-subtle text-text-muted",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
