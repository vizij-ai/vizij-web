import type { ReactNode } from "react";
import { cn } from "../../../utils/cn";

export interface RowCheckboxProps {
  checked: boolean;
  onChange: () => void;
  /** Text beside the box. */
  children: ReactNode;
  /** Tooltip, and the accessible description of what the selection is for. */
  title?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A small labelled checkbox that lives **inside a clickable row** without
 * triggering it.
 *
 * That containment is the entire reason it exists as a component. A checkbox
 * dropped into a row whose own `onClick` selects the row will, on every click,
 * both toggle itself and select the row — so each of the five copies of this in
 * `VariablesPanel` carried the same `onClick={(event) => event.stopPropagation()}`
 * on the label. Getting that wrong is silent: the checkbox still works, it just
 * also does something else.
 *
 * Deliberately a **native** `<input type="checkbox">` rather than `ui/Checkbox`.
 * `ui/Checkbox` renders a 28px box built for a form; these sit in a 9px-text row
 * of icon buttons, where it would be four times the height of its own label.
 * Swapping them is a design decision, not a refactor.
 *
 * Carries no colour of its own — callers pass one through `className`, because
 * what a row-level selection *means* (and therefore what colour it should be) is
 * the caller's business. In vizij these are bulk-copy selections and pass
 * `text-cyan-200`.
 */
export function RowCheckbox({
  checked,
  onChange,
  children,
  title,
  disabled = false,
  className,
}: RowCheckboxProps) {
  return (
    <label
      className={cn(
        "flex items-center gap-1 text-[9px]",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
      title={title}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      {children}
    </label>
  );
}
