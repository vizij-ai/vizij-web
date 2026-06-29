import { Switch as BaseSwitch } from "@base-ui/react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface SwitchProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "size" | "onChange"
  > {
  onChange?: (checked: boolean) => void;
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
    <div
      className={cn(
        "group inline-flex items-center gap-3 cursor-pointer select-none",
        className,
      )}
    >
      <BaseSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer rounded-full border border-border-default bg-bg-input transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg-app disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-accent border-accent" : "group-hover:border-border-hover",
          {
            "h-4.5 w-8": size === "sm",
            "h-5.5 w-10": size === "md",
          },
        )}
      >
        <BaseSwitch.Thumb
          className={cn(
            "pointer-events-none inline-block transform rounded-full bg-zinc-400 shadow ring-0 transition duration-200 ease-in-out",
            checked ? "bg-white" : "translate-x-1",
            {
              "h-2.5 w-2.5 translate-y-[2px]": size === "sm",
              "h-3.5 w-3.5 translate-y-[3px]": size === "md",
              "translate-x-3.5": size === "sm" && checked,
              "translate-x-4.5": size === "md" && checked,
              "translate-x-1": !checked,
            },
          )}
        />
      </BaseSwitch.Root>
      {(label || hint) && (
        <div
          className="flex flex-col"
          onClick={() => !disabled && onChange?.(!checked)}
        >
          {label && (
            <span className="text-[13px] font-bold text-text-primary transition-colors">
              {label}
            </span>
          )}
          {hint && (
            <span className="text-[10px] text-text-muted leading-tight font-medium">
              {hint}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
