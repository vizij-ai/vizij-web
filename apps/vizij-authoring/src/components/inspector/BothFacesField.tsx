import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
import { cn } from "../../utils/cn";

export interface BothFacesFieldProps {
  /**
   * The callout's heading. Two values exist in the app — `"Both Faces Value"`
   * for rig drivers and `"Both Faces Weight"` for pose weights — and they track
   * what the underlying quantity is called elsewhere in that inspector, so this
   * stays a caller's choice rather than a `kind` enum.
   */
  label: string;
  /**
   * The combined value, **already in display units**. The rig sites feed this
   * through `toDisplayValue(…, input.path)` (degrees for angular paths); the
   * pose sites are plain `0..1` and convert nothing. This component never
   * learns which is which — see `onChange`.
   */
  value: number;
  min: number;
  max: number;
  step: number;
  /**
   * The slider's amber default marker and snap target, in the same display
   * units as `value`. Only the two rig sites have one; the pose sites pass
   * nothing and get no marker, which is what they rendered before.
   */
  defaultValue?: number;
  /**
   * The new value, in display units, from either control.
   *
   * One callback for both, because all four migrated sites ran the slider and
   * the number field through **identical** bodies — the only reason they read
   * as two was the `number | number[]` union radix hands the slider, which is
   * normalised here. Whatever each site does next stays at the call site:
   * `fromDisplayValue` for the rig pair, `clampToRange`/`clamp01` for two of
   * them, nothing at all for the other two. That is the same split
   * `editor/molecules/MergeValueField.tsx` uses, and it is why this component
   * imports nothing from the app.
   */
  onChange: (nextValue: number) => void;
  /**
   * True when the two faces currently hold different values, which adds the
   * amber note. The four sites compute this four ways (an epsilon compare
   * against a shared main value, a pose-weight compare, an inline compare) so
   * the comparison stays outside; only the verdict comes in.
   */
  desynced?: boolean;
  /**
   * Width of the number field. Defaults to the rig sites' `w-[108px]`; the two
   * pose sites are narrower at `w-[92px]` because a `0..1` weight needs fewer
   * digits than a degree reading. This is a genuine pre-existing difference,
   * not drift to be normalised away here.
   */
  numberFieldClassName?: string;
  className?: string;
}

/** Identical at all four sites, so it cannot drift by living here. */
const DESYNC_MESSAGE =
  "Faces are currently controlled individually. Set this slider to re-sync both.";

/**
 * The cyan "Both Faces" callout: one slider plus number field that writes the
 * same value to the main face and the reference face at once, shown above the
 * per-face controls whenever the face scope tabs are visible.
 *
 * ## What the four sites actually shared
 *
 * Four copies of this markup sat in `InspectorContent.tsx` — reference rig,
 * reference pose, main pose, main rig. An earlier audit listed their
 * differences as the title, the range source, the warning copy and the match
 * flag. Reading them showed that list was wrong in both directions:
 *
 * - The warning copy is **identical** at all four (the JSX line breaks differ,
 *   the rendered text does not), so it is a constant here rather than a prop.
 * - Two differences the audit missed: the number field is `w-[108px]` on the
 *   rig sites and `w-[92px]` on the pose sites, and the slider's `defaultValue`
 *   marker exists only on the rig sites.
 *
 * Everything else — `fillMode="value"`, `flex-1`, `size="sm"`,
 * `allowScrub={false}`, the wrapper, the label treatment — was byte-identical.
 *
 * ## Why it lives in `inspector/` and not `editor/`
 *
 * "Both Faces" names a Vizij concept, so per the refactoring plan's §4 rule it
 * stays in the feature layer beside its callers. The cyan/amber literals are
 * carried over unchanged and deliberately not tokenised: this extraction buys
 * a shorter file and a testable unit, not portability.
 *
 * The `showScopeTabs && …` guard that decides whether the callout appears at
 * all stays at each call site, because each site guards on something different.
 */
export function BothFacesField({
  label,
  value,
  min,
  max,
  step,
  defaultValue,
  onChange,
  desynced = false,
  numberFieldClassName = "w-[108px]",
  className,
}: BothFacesFieldProps) {
  return (
    <div
      className={cn(
        "mx-1 mb-2 flex flex-col gap-1 rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-2",
        className,
      )}
    >
      <span className="text-[10px] uppercase tracking-wider text-cyan-100">
        {label}
      </span>
      <div className="flex items-center gap-2">
        <Slider
          value={value}
          min={min}
          max={max}
          step={step}
          defaultValue={defaultValue}
          fillMode="value"
          className="flex-1"
          onChange={(nextValue) =>
            onChange(
              typeof nextValue === "number" ? nextValue : (nextValue[0] ?? 0),
            )
          }
        />
        <NumberField
          value={value}
          min={min}
          max={max}
          step={step}
          size="sm"
          className={numberFieldClassName}
          allowScrub={false}
          onChange={onChange}
        />
      </div>
      {desynced ? (
        <span className="text-[10px] text-amber-100">{DESYNC_MESSAGE}</span>
      ) : null}
    </div>
  );
}
