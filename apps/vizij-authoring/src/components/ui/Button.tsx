import React, { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import "./button.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "subtle" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  pill?: boolean;
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      pill = false,
      iconOnly = false,
      ...props
    },
    ref,
  ) => {
    const variantClass = variant === "secondary" ? "" : variant;
    const classes = [
      "button",
      variantClass,
      size !== "md" ? size : "",
      pill ? "pill" : "",
      iconOnly ? "icon-only" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <button ref={ref} className={classes} {...props} />;
  },
);

Button.displayName = "Button";
