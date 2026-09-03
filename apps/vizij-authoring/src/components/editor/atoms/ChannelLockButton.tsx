import type { CSSProperties } from "react";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "../../../utils/cn";

export interface ChannelLockButtonProps {
  /** Locked renders the closed padlock in the `--editor-locked` colour. */
  locked: boolean;
  /** Called on click. Not called while `disabled`. */
  onToggle: () => void;
  /**
   * Tooltip, and the accessible name — there is no visible label. Callers should
   * phrase it as the *action* rather than the state ("Lock Position" /
   * "Unlock Position"), since that is how a user reads a tooltip on a control.
   */
  title?: string;
  /** Nothing to lock. Renders the unlocked icon, non-interactive. */
  disabled?: boolean;
  /** Icon size in px. 10 matches a dense inspector row; 12 a section header. */
  iconSize?: number;
  className?: string;
}

/**
 * Icon-only padlock for a property row or a single channel.
 *
 * Colour comes from two tokens rather than a fixed palette: locked is the
 * "driven elsewhere, hands off" status colour, unlocked is the accent, so the
 * pair reads as a state change in either theme. The inline version this replaces
 * used `text-rose-300` / `text-sky-300`, which were near-invisible on a light
 * surface.
 *
 * Purely presentational and fully controlled — it neither knows nor asks what a
 * "target" is. Pair it with `useRowLock` for the aggregation.
 */
export function ChannelLockButton({
  locked,
  onToggle,
  title,
  disabled = false,
  iconSize = 10,
  className,
}: ChannelLockButtonProps) {
  const stateColor = locked
    ? "var(--editor-locked, var(--color-warning))"
    : "var(--editor-unlocked, var(--color-accent))";

  return (
    <button
      type="button"
      className={cn(
        "p-1 rounded transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        !disabled && "hover:bg-[var(--editor-lock-hover-bg)]",
        className,
      )}
      style={
        {
          color: stateColor,
          // Read by the `hover:` utility above. Nesting it as a custom property
          // keeps the hover tint derived from whichever state colour is showing,
          // so there is no third token to override.
          "--editor-lock-hover-bg": `color-mix(in srgb, ${stateColor} 20%, transparent)`,
        } as CSSProperties
      }
      title={title}
      aria-label={title}
      // No `aria-pressed`: the same atom serves a two-state row toggle *and*
      // one-way "Lock all" / "Unlock all" affordances, where a pressed state
      // would be a lie. `title` flips with the state, and it is the accessible
      // name, so the state is announced either way.
      disabled={disabled}
      onClick={onToggle}
    >
      {locked ? <Lock size={iconSize} /> : <LockOpen size={iconSize} />}
    </button>
  );
}
