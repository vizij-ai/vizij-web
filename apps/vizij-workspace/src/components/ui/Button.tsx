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
          "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98] active:brightness-90",

          {
            // Variants
            "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm shadow-accent/20 active:translate-y-px":
              variant === "primary",
            "bg-bg-secondary text-text-primary border border-border-default hover:bg-bg-secondary-hover shadow-sm active:translate-y-px":
              variant === "secondary",
            "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white":
              variant === "subtle",
            "bg-red-500/10 text-red-200 border border-red-500/20 hover:bg-red-500/20 active:translate-y-px":
              variant === "danger",
            "bg-transparent hover:bg-bg-hover text-text-muted hover:text-text-primary":
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
