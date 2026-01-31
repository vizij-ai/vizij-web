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
        "bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]",
        tone === "info" && "bg-slate-800/40 border-slate-700/50 text-slate-400",
        tone === "muted" && "bg-slate-900/40 border-slate-800/60 text-slate-500",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
