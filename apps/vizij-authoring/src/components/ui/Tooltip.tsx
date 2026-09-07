import type { ReactNode } from "react";
import { Tooltip as SemioTooltip } from "@semio/ui";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  disabled?: boolean;
}

/**
 * Tooltip, built on `@semio/ui`'s `Tooltip`.
 *
 * This replaces a hand-rolled implementation (~118 lines of `createPortal`,
 * `getBoundingClientRect` math and rAF re-positioning on scroll/resize) that was
 * **mouse-only** — no focus or keyboard trigger, so tooltip content was
 * unreachable without a pointer. semio's is Radix-based and handles focus,
 * Escape, and collision repositioning.
 *
 * Each semio `Tooltip` mounts its own provider, so no root provider is needed.
 *
 * Dropped from the old signature, both unused at every call site: `delay` (semio
 * owns the timing) and `className` (there is no longer an app-owned wrapper to
 * style — the old one injected an extra `relative flex items-center` div that
 * silently affected the layout of whatever it wrapped).
 */
export function Tooltip({
  content,
  children,
  side = "top",
  disabled,
}: TooltipProps) {
  return (
    <SemioTooltip content={content} side={side} disabled={disabled}>
      {children}
    </SemioTooltip>
  );
}
