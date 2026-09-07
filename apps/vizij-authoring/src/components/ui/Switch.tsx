import type { ReactNode } from "react";
import { Switch as SemioSwitch, Size, Variant } from "@semio/ui";
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

const SIZES: Record<"sm" | "md", Size> = {
  sm: Size.Sm,
  md: Size.Md,
};

/**
 * Labelled switch, built on `@semio/ui`'s `Switch` (Radix under the hood, so it
 * still emits `role="switch"` — asserted 5x in VariablePipelineStages.test.tsx).
 *
 * semio's `Switch` takes a `label?: string` but has no `hint`, and this app
 * pairs a bold label with a small hint line. So the label block stays local
 * (which also keeps `hint` as `ReactNode` rather than `string`) and semio's own
 * `label` prop is left unset.
 *
 * Clicking the label toggles, matching the previous behaviour. Label colours
 * were hardcoded `zinc-200`/`zinc-500` before — invisible in light mode — and
 * are now tokens.
 */
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
      <SemioSwitch
        id={id}
        checked={Boolean(checked)}
        onCheckedChange={(next) => onChange?.(next)}
        disabled={disabled}
        size={SIZES[size]}
        // semio defaults to Variant.Default, which renders a checked switch in
        // zinc. This app has always shown the accent when on, so the variant is
        // explicit — and `--color-primary-*` is remapped to the Vizij accent in
        // styles.css, so Primary is Vizij blue rather than Semio sky.
        variant={Variant.Primary}
      />
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
