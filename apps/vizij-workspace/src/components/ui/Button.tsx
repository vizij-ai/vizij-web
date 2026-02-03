import React, { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Button as BaseButton } from "@base-ui/react";
import { cn } from "../../utils/cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "subtle" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  pill?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "secondary", size = "md", pill = false, ...props },
    ref,
  ) => {
    return (
      <BaseButton
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:pointer-events-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98] active:brightness-90",

          {
            // Variants
            "bg-blue-600 text-white hover:bg-blue-500 shadow-sm shadow-blue-500/20 active:translate-y-px":
              variant === "primary",
            "bg-slate-800 text-slate-200 border border-slate-700/50 hover:bg-slate-700 shadow-sm active:translate-y-px":
              variant === "secondary",
            "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white":
              variant === "subtle",
            "bg-red-500/10 text-red-200 border border-red-500/20 hover:bg-red-500/20 active:translate-y-px":
              variant === "danger",
            "bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200":
              variant === "ghost",

            // Sizes
            "h-7 px-3 text-xs": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-11 px-6 text-base": size === "lg",
            "h-9 w-9 p-0": size === "icon",

            // Modifiers
            "rounded-full": pill,
            "rounded-md": !pill,
          },
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
