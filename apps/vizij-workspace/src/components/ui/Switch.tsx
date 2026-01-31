import { Switch as HeadlessSwitch } from "@headlessui/react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  label?: ReactNode;
  hint?: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  id,
  label,
  hint,
  className,
  size = "md",
  disabled = false,
}: SwitchProps) {
  return (
    <div className={cn("group inline-flex items-center gap-3 cursor-pointer select-none", className)}>
      <HeadlessSwitch
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer rounded-full border border-slate-700 bg-slate-800 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-blue-600 border-blue-600" : "group-hover:border-slate-600",
          {
            "h-4.5 w-8": size === "sm",
            "h-5.5 w-10": size === "md",
          }
        )}
      >
        <span className="sr-only">{label || "Toggle"}</span>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block transform rounded-full bg-slate-400 shadow ring-0 transition duration-200 ease-in-out",
            checked ? "bg-white" : "translate-x-1",
            {
              "h-2.5 w-2.5 translate-y-[2px]": size === "sm",
              "h-3.5 w-3.5 translate-y-[3px]": size === "md",
              "translate-x-3.5": size === "sm" && checked,
              "translate-x-4.5": size === "md" && checked,
              "translate-x-1": !checked,
            }
          )}
        />
      </HeadlessSwitch>
      {(label || hint) && (
        <div className="flex flex-col" onClick={() => !disabled && onChange(!checked)}>
          {label && <span className="text-[13px] font-bold text-slate-200 group-hover:text-slate-100 transition-colors">{label}</span>}
          {hint && <span className="text-[10px] text-slate-500 leading-tight font-medium">{hint}</span>}
        </div>
      )}
    </div>
  );
}
