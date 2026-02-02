import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../utils/cn";

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
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-colors",
        {
          "bg-slate-800 border-slate-700 text-slate-300": tone === "default",
          "bg-blue-500/10 border-blue-500/20 text-blue-400": tone === "info",
          "bg-green-500/10 border-green-500/20 text-green-400":
            tone === "success",
          "bg-yellow-500/10 border-yellow-500/20 text-yellow-500":
            tone === "warning",
          "bg-red-500/10 border-red-500/20 text-red-400": tone === "danger",
          "bg-slate-900 border-slate-800 text-slate-500": tone === "muted",
        },
        className,
      )}
      {...rest}
    >
      <span>{children}</span>
      {dismissable && (
        <button
          type="button"
          className="ml-0.5 p-0.5 rounded-full hover:bg-black/20 text-current opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
          aria-label="Remove"
          onClick={onDismiss}
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
            <path
              d="M4 4l8 8m0-8l-8 8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
