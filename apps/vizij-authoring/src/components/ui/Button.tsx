import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { Button as SemioButton, Size, Variant } from "@semio/ui";
import { cn } from "../../utils/cn";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "subtle" | "danger" | "ghost";
  size?: "sm" | "md" | "lg" | "icon";
  pill?: boolean;
}

/** App size -> semio Size. `icon` is a square md button; see the docblock. */
const SIZES: Record<NonNullable<ButtonProps["size"]>, Size> = {
  sm: Size.Sm,
  md: Size.Md,
  lg: Size.Lg,
  icon: Size.Md,
};

/**
 * semio Variant per app variant. This only drives semio's own accent derivation
 * (focus ring, `--accent-color`); the visible surface comes from the app classes
 * below, which win because they are utilities while semio's `variant-*` classes
 * live in `@layer components`.
 */
const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, Variant> = {
  primary: Variant.Primary,
  secondary: Variant.Default,
  subtle: Variant.Default,
  danger: Variant.Error,
  ghost: Variant.Default,
};

/**
 * Button, built on `@semio/ui`'s `Button`.
 *
 * With 291 call sites this is the highest-volume component in the app, so the
 * goal here is a **substrate swap with no visual change**: semio owns the
 * element, press/focus behaviour and accent derivation, while the existing
 * per-variant classes are kept verbatim. Restyling onto semio's own `visuals`
 * presets (`call-to-action`, `list-item`, `deemphasize`) would change every
 * button in the app at once and belongs in its own reviewable change.
 *
 * Two things must be handled explicitly:
 *
 * 1. **`aria-label` has to become semio's `altText`.** semio renders
 *    `aria-label={altText}` *after* spreading incoming props, so a caller's
 *    `aria-label` is overwritten with `undefined` and the attribute disappears
 *    entirely. `Modal`'s close button relies on `aria-label="Close"`, and nine
 *    modals' e2e assertions match `getByRole("button", { name: "Close" })` —
 *    forwarding it untranslated would have silently broken all of them.
 * 2. **`size="icon"` keeps explicit box classes.** semio infers icon-only from
 *    `children === undefined` and expects the glyph in `leftIcon`/`rightIcon`;
 *    every call site here passes the icon as `children`, so semio would pad it
 *    like a text button. `h-9 w-9 p-0` preserves the square.
 *
 * Sizes keep their explicit height and padding because semio's `sized-height`
 * scale does not line up with this app's `h-7`/`h-9`/`h-11`. `size` is still
 * forwarded so semio's internal icon sizing stays proportional.
 *
 * `variant="subtle"` keeps `bg-white/5 … hover:text-white`, which is dark-only
 * and washes out in light mode. Left as-is deliberately: fixing it changes every
 * subtle button and does not belong in a substrate swap.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "secondary",
      size = "md",
      pill = false,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    return (
      <SemioButton
        ref={ref}
        variant={VARIANTS[variant]}
        size={SIZES[size]}
        altText={ariaLabel}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed active:scale-[0.98] active:brightness-90",

          {
            // Variants
            "bg-accent-gradient text-accent-fg shadow-premium hover:shadow-accent-glow hover:scale-[1.02] active:scale-[0.98]":
              variant === "primary",
            "bg-bg-secondary text-text-primary border border-border-default hover:bg-bg-secondary-hover shadow-sm active:scale-[0.98]":
              variant === "secondary",
            "bg-white/5 text-text-secondary hover:bg-white/10 hover:text-white active:scale-[0.98]":
              variant === "subtle",
            "bg-danger text-danger-fg shadow-sm hover:bg-danger/90 active:scale-[0.98]":
              variant === "danger",
            "bg-transparent hover:bg-bg-hover text-text-muted hover:text-text-primary active:scale-[0.98]":
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
