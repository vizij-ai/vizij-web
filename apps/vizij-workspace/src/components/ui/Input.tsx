import { forwardRef, type ReactNode } from "react";
import type { InputHTMLAttributes } from "react";
import { Input as BaseInput } from "@base-ui/react";
import { cn } from "../../utils/cn";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: "sm" | "md";
  startContent?: ReactNode;
  endContent?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, size = "md", startContent, endContent, ...props }, ref) => {
    return (
      <div
        className={cn(
          "group flex items-center w-full rounded-md border border-border-default bg-bg-input shadow-sm transition-colors focus-within:ring-2 focus-within:ring-accent focus-within:border-transparent",
          {
            "h-7": size === "sm",
            "h-9": size === "md",
          },
          className,
        )}
      >
        {startContent && <div className="pl-2 flex items-center pointer-events-none text-text-muted">{startContent}</div>}
        <BaseInput
          ref={ref}
          className={cn(
            "flex h-8 w-full rounded-md border border-border-default bg-bg-input px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 text-text-primary",
            {
              "text-xs": size === "sm",
              "text-sm": size === "md",
              "pl-3": !startContent,
              "pr-3": !endContent,
            },
          )}
          {...props}
        />
        {endContent && <div className="pr-2 flex items-center pointer-events-none text-text-muted">{endContent}</div>}
      </div>
    );
  },
);

Input.displayName = "Input";
