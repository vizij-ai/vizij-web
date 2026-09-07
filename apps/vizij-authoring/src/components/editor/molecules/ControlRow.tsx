import type { CSSProperties, ReactNode } from "react";
import { Sliders } from "lucide-react";
import { Slider } from "../../ui/Slider";
import { cn } from "../../../utils/cn";

/**
 * The value a `ControlRow` renders.
 *
 * Declared here rather than imported so the layer owns its own contract. It is a
 * structural subset of vizij's `InputCatalogRow`, so that type satisfies it with
 * no adapter and no change at the call sites — but nothing in `editor/` depends
 * on the app's catalogue.
 */
export interface ControlRowValue {
  /** Identifies the control to the change handler. */
  inputId: string;
  label: string;
  value?: number | null;
  defaultValue?: number;
  min?: number;
  max?: number;
  /** `false` renders the read-only note instead of the slider. */
  editable?: boolean;
}

export interface ControlRowProps {
  row: ControlRowValue;
  selected: boolean;
  /** Driven from elsewhere — disables the slider and shows `lockedMessage`. */
  locked: boolean;
  /** Indentation level; each step insets the row by 14px. */
  depth?: number;
  /** `false` makes the row inert: no hover, no click, not tab-reachable. */
  selectable?: boolean;
  lockedMessage?: string;
  onSelect: () => void;
  onValueChange: (inputId: string, value: number) => void;
  /** Right-aligned controls in the header. */
  actions?: ReactNode;
  /** Leading glyph. Defaults to a sliders icon. */
  icon?: ReactNode;
  className?: string;
}

const DEPTH_INSET_PX = 14;

/**
 * A selectable card holding one numeric control: label, optional actions, and
 * either a slider or a read-only note.
 *
 * Extracted from `VariablesPanel`'s `FlatInputControlRow` (~100 lines in an
 * 8,753-line file) with its behaviour intact. It was already almost free of
 * domain logic — it coerced a non-finite value to 0, unwrapped the array the
 * slider can emit, and called back with the id — so the extraction is mostly a
 * matter of giving it a contract of its own.
 *
 * Three things changed on the way out, all of them making it portable:
 *
 * 1. `InputCatalogRow` became the local `ControlRowValue`. Structural typing means
 *    call sites are unaffected.
 * 2. The leading icon is a prop, defaulted to the original glyph.
 * 3. Two hardcoded colours became tokens: `text-cyan-300` → `--editor-control-accent`
 *    (fallback keeps the exact colour) and `text-amber-300` → `--editor-locked`,
 *    which is the token `ChannelLockButton` already uses for the same meaning.
 *    That second one shifts the shade very slightly — amber-300 `#fcd34d` to the
 *    warning token's `#fbbf24` in dark mode — and is deliberate: "driven from
 *    elsewhere" now renders one colour across the editor instead of two.
 *
 * Surface opacities are written as `color-mix` because that is what Tailwind's
 * `/35` and `/60` modifiers compile to, so the card stays pixel-identical.
 *
 * Controlled: it holds no state and reports every change.
 */
export function ControlRow({
  row,
  selected,
  locked,
  depth = 0,
  selectable = true,
  lockedMessage,
  onSelect,
  onValueChange,
  actions,
  icon,
  className,
}: ControlRowProps) {
  const value =
    typeof row.value === "number" && Number.isFinite(row.value) ? row.value : 0;
  const paddingLeft = Math.max(0, depth) * DEPTH_INSET_PX;

  const select = () => {
    if (!selectable) return;
    onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={selectable ? 0 : -1}
      style={
        {
          marginLeft: `${paddingLeft}px`,
          "--control-row-border": selected
            ? "color-mix(in oklab, var(--editor-accent, var(--color-accent)) 60%, transparent)"
            : "color-mix(in oklab, var(--editor-border, var(--border-default)) 50%, transparent)",
          "--control-row-bg": selected
            ? "color-mix(in oklab, var(--editor-accent, var(--color-accent)) 10%, transparent)"
            : "color-mix(in oklab, var(--editor-panel-bg, var(--bg-panel)) 35%, transparent)",
          "--control-row-border-hover":
            "color-mix(in oklab, var(--editor-border, var(--border-default)) 70%, transparent)",
          "--control-row-bg-hover":
            "color-mix(in oklab, var(--editor-panel-bg, var(--bg-panel)) 45%, transparent)",
        } as CSSProperties
      }
      title={row.label}
      className={cn(
        "rounded border px-2 py-1.5 flex flex-col gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        "border-[var(--control-row-border)] bg-[var(--control-row-bg)]",
        selectable &&
          "hover:border-[var(--control-row-border-hover)] hover:bg-[var(--control-row-bg-hover)]",
        className,
      )}
      aria-disabled={!selectable}
      onClick={select}
      onKeyDown={(event) => {
        if (!selectable) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        select();
      }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {icon ?? (
          <Sliders
            size={12}
            className="shrink-0"
            style={{ color: "var(--editor-control-accent, #67e8f9)" }}
          />
        )}
        <span className="text-xs truncate text-[var(--editor-value-fg,var(--text-primary))]">
          {row.label}
        </span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {actions}
        </div>
      </div>
      {row.editable ? (
        // The slider owns pointer events inside the card; without this a drag
        // would also select the row.
        <div
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Slider
            value={value}
            defaultValue={row.defaultValue}
            min={row.min}
            max={row.max}
            step={0.01}
            disabled={locked}
            onChange={(nextValue) => {
              const normalizedValue = Array.isArray(nextValue)
                ? nextValue[0]
                : nextValue;
              if (!Number.isFinite(normalizedValue)) return;
              onValueChange(row.inputId, normalizedValue);
            }}
          />
        </div>
      ) : (
        <p className="text-[10px] text-[var(--editor-muted-fg,var(--text-muted))]">
          Derived control (read-only)
        </p>
      )}
      {locked ? (
        <p
          className="text-[10px]"
          style={{ color: "var(--editor-locked, var(--color-warning))" }}
        >
          {lockedMessage ??
            "Animation playback is currently driving this input."}
        </p>
      ) : null}
    </div>
  );
}
