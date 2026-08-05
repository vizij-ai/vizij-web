import {
  Select as SemioSelect,
  Size,
  type SelectOption as SemioSelectOption,
} from "@semio/ui";
import { cn } from "../../utils/cn";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

const SIZES: Record<"sm" | "md", Size> = {
  sm: Size.Sm,
  md: Size.Md,
};

/**
 * Single-select, built on `@semio/ui`'s `Select`.
 *
 * Three deliberate accommodations, each covering a real gap:
 *
 * 1. **`placeholder`.** For single-select semio derives its trigger purely from
 *    `options.find(o => o.value === value)`, so an unmatched value renders an
 *    empty trigger. When a placeholder is supplied and nothing matches, a
 *    disabled `value: ""` option is prepended so the trigger has something to
 *    show — which also reads as the conventional greyed "Select an option…" row.
 * 2. **`disabled`.** semio has no component-level disabled (only per-option), so
 *    it is emulated on a wrapper. Used at exactly one call site
 *    (`SpeechPanel.tsx:682`).
 * 3. **`label`.** Kept as the app's own uppercase caption element rather than
 *    semio's `label` prop, which for single-select only feeds the multi-select
 *    trigger fallback and would not render.
 *
 * `visuals="labels"` is explicit: semio defaults to `"both"`, which reserves an
 * icon slot per option, and these options never carry icons.
 *
 * `SelectOption.description` is retained on the type — `hooks/useSpeechPlayback.ts`
 * imports it — but semio's `SelectOption` has no per-option description and no
 * `renderItem` escape hatch, so it is not rendered. No call site sets it.
 */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  label,
  disabled = false,
  className,
  size = "md",
}: SelectProps) {
  const hasMatch = options.some((option) => option.value === value);

  const semioOptions: SemioSelectOption[] = [
    ...(placeholder && !hasMatch
      ? [{ value: "", label: placeholder, disabled: true }]
      : []),
    ...options.map(
      ({
        value: optionValue,
        label: optionLabel,
        disabled: optionDisabled,
      }) => ({
        value: optionValue,
        label: optionLabel,
        disabled: optionDisabled,
      }),
    ),
  ];

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary px-1">
          {label}
        </label>
      )}
      <div className={disabled ? "pointer-events-none opacity-50" : undefined}>
        <SemioSelect<string>
          value={hasMatch ? value : ""}
          onChange={onChange}
          options={semioOptions}
          size={SIZES[size]}
          visuals="labels"
        />
      </div>
    </div>
  );
}
