import { useCallback, useMemo, useState } from "react";
import { useVizijStore } from "@vizij/render";
import type { VizijActions, VizijData } from "@vizij/render";
import { getLookup } from "@vizij/utils";
import type {
  RawEuler,
  RawHSL,
  RawRGB,
  RawValue,
  RawVector2,
  RawVector3,
} from "@vizij/utils";

import { useAnimatableList } from "../hooks/useAnimatableList";
import type { AnimatableListGroup, AnimatableListItem } from "../types";
import { CollapsiblePanel } from "./CollapsiblePanel";

type SetValueFn = (id: string, namespace: string, value: RawValue) => void;

type ResetFn = (item: AnimatableListItem) => void;

type NumberConstraints = {
  min?: number;
  max?: number;
};

type VectorConstraints = {
  min?: Array<number | null>;
  max?: Array<number | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRGB(value: RawValue | undefined): value is RawRGB {
  return isRecord(value) && "r" in value && "g" in value && "b" in value;
}

function isHSL(value: RawValue | undefined): value is RawHSL {
  return isRecord(value) && "h" in value && "s" in value && "l" in value;
}

function cloneValue<T extends RawValue>(value: T): T {
  if (!isRecord(value)) {
    return value;
  }
  return { ...(value as Record<string, unknown>) } as unknown as T;
}

function getRgbScale(value?: RawRGB) {
  if (!value) return 255;
  return value.r > 1 || value.g > 1 || value.b > 1 ? 255 : 1;
}

function getHslScale(value?: RawHSL) {
  return {
    h: value && value.h > 1 ? 360 : 1,
    s: value && value.s > 1 ? 100 : 1,
    l: value && value.l > 1 ? 100 : 1,
  };
}

function normalizeRgb(rgb: RawRGB | undefined) {
  if (!rgb) {
    return { r: 0, g: 0, b: 0 };
  }
  const scale = getRgbScale(rgb);
  return {
    r: Math.min(1, Math.max(0, scale === 255 ? rgb.r / 255 : rgb.r)),
    g: Math.min(1, Math.max(0, scale === 255 ? rgb.g / 255 : rgb.g)),
    b: Math.min(1, Math.max(0, scale === 255 ? rgb.b / 255 : rgb.b)),
  };
}

function denormalizeRgb(normalized: RawRGB, reference?: RawRGB) {
  const scale = getRgbScale(reference);
  if (scale === 255) {
    return {
      r: Math.round(normalized.r * 255),
      g: Math.round(normalized.g * 255),
      b: Math.round(normalized.b * 255),
    } as RawRGB;
  }
  return normalized;
}

function hslToRgbNormalized(hsl: RawHSL) {
  const h = ((hsl.h % 1) + 1) % 1;
  const s = Math.min(1, Math.max(0, hsl.s));
  const l = Math.min(1, Math.max(0, hsl.l));

  if (s === 0) {
    return { r: l, g: l, b: l };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: hue2rgb(p, q, h + 1 / 3),
    g: hue2rgb(p, q, h),
    b: hue2rgb(p, q, h - 1 / 3),
  };
}

function rgbToHslNormalized(rgb: RawRGB) {
  const r = rgb.r;
  const g = rgb.g;
  const b = rgb.b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
      default:
        break;
    }
    h /= 6;
  }

  return { h, s, l } as RawHSL;
}

function hexComponent(value: number) {
  const hex = value.toString(16).padStart(2, "0");
  return hex.length > 2 ? hex.slice(-2) : hex;
}

function rgbToHex(rgb: RawRGB) {
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  return `#${hexComponent(r)}${hexComponent(g)}${hexComponent(b)}`;
}

function hexToRgb(hex: string): RawRGB {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const num = parseInt(value, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return { r, g, b };
}

function toCssColor(value: RawValue | undefined) {
  if (isRGB(value)) {
    const normalized = normalizeRgb(value);
    return rgbToHex(normalized);
  }
  if (isHSL(value)) {
    const scales = getHslScale(value);
    const normalized: RawHSL = {
      h: (((value.h / (scales.h === 360 ? 360 : 1)) % 1) + 1) % 1,
      s: Math.min(1, Math.max(0, value.s / (scales.s === 100 ? 100 : 1))),
      l: Math.min(1, Math.max(0, value.l / (scales.l === 100 ? 100 : 1))),
    };
    const rgb = hslToRgbNormalized(normalized);
    return rgbToHex(rgb);
  }
  return "#000000";
}

function fromCssColor(hex: string, reference: RawValue | undefined) {
  const rgb = hexToRgb(hex);
  const normalized: RawRGB = {
    r: rgb.r / 255,
    g: rgb.g / 255,
    b: rgb.b / 255,
  };

  if (isHSL(reference)) {
    const scales = getHslScale(reference);
    const hsl = rgbToHslNormalized(normalized);
    return {
      h: scales.h === 360 ? hsl.h * 360 : hsl.h,
      s: scales.s === 100 ? hsl.s * 100 : hsl.s,
      l: scales.l === 100 ? hsl.l * 100 : hsl.l,
    } as RawHSL;
  }

  const refRgb = isRGB(reference) ? reference : undefined;
  const denormalized = denormalizeRgb(normalized, refRgb);
  return denormalized as RawRGB;
}

interface RowProps {
  item: AnimatableListItem;
  namespace: string;
  setValue: SetValueFn;
  resetValue: ResetFn;
}

function useAnimValue(
  namespace: string,
  item: AnimatableListItem,
): RawValue | undefined {
  const selector = useCallback(
    (state: VizijData & VizijActions) =>
      state.values.get(getLookup(namespace, item.id)) ?? item.defaultValue,
    [namespace, item.id, item.defaultValue],
  );

  return useVizijStore(selector);
}

function NumberRow({ item, namespace, setValue, resetValue }: RowProps) {
  const value = useAnimValue(namespace, item) as number;
  const numericValue = Number.isFinite(value) ? Number(value) : 0;
  const constraints = item.constraints as NumberConstraints | undefined;
  const min =
    typeof constraints?.min === "number" ? constraints.min : undefined;
  const max =
    typeof constraints?.max === "number" ? constraints.max : undefined;

  return (
    <div className="anim-row">
      <div className="anim-row-label">
        <span>{item.label}</span>
        <button
          type="button"
          className="btn btn-reset"
          onClick={() => resetValue(item)}
        >
          Reset
        </button>
      </div>
      <div className="anim-row-control">
        {typeof min === "number" && typeof max === "number" ? (
          <input
            type="range"
            min={min}
            max={max}
            step={0.01}
            value={numericValue}
            onChange={(event) =>
              setValue(item.id, namespace, Number(event.target.value))
            }
          />
        ) : null}
        <input
          type="number"
          value={numericValue}
          onChange={(event) =>
            setValue(item.id, namespace, Number(event.target.value))
          }
          className="numeric-input"
        />
      </div>
      <div className="anim-row-meta">
        <span>{item.type}</span>
        {typeof min === "number" && typeof max === "number" ? (
          <span>
            [{min}, {max}]
          </span>
        ) : null}
      </div>
    </div>
  );
}

function VectorRow({ item, namespace, setValue, resetValue }: RowProps) {
  const axes =
    isRecord(item.defaultValue) && "z" in item.defaultValue
      ? ["x", "y", "z"]
      : ["x", "y"];
  const baseValue = (useAnimValue(namespace, item) ?? item.defaultValue) as
    | RawVector2
    | RawVector3
    | RawEuler;
  const constraints = item.constraints as VectorConstraints | undefined;
  const baseRecord = baseValue as unknown as Record<string, number>;
  const displayValue = axes.reduce(
    (acc, axis) => {
      const current = baseRecord[axis];
      acc[axis] = typeof current === "number" ? current : 0;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="anim-row">
      <div className="anim-row-label">
        <span>{item.label}</span>
        <button
          type="button"
          className="btn btn-reset"
          onClick={() => resetValue(item)}
        >
          Reset
        </button>
      </div>
      <div className="anim-row-control vector-control">
        {axes.map((axis, index) => (
          <label key={axis}>
            <span>{axis}</span>
            <input
              type="number"
              value={displayValue[axis]}
              onChange={(event) => {
                const next = Number(event.target.value);
                const updated = { ...baseRecord, [axis]: next } as Record<
                  string,
                  number
                >;
                setValue(item.id, namespace, updated as unknown as RawValue);
              }}
              className="numeric-input"
              min={constraints?.min?.[index] ?? undefined}
              max={constraints?.max?.[index] ?? undefined}
              step={0.01}
            />
          </label>
        ))}
      </div>
      <div className="anim-row-meta">
        <span>{item.type}</span>
      </div>
    </div>
  );
}

function BooleanRow({ item, namespace, setValue, resetValue }: RowProps) {
  const value = Boolean(useAnimValue(namespace, item) ?? item.defaultValue);
  return (
    <div className="anim-row">
      <div className="anim-row-label">
        <span>{item.label}</span>
        <button
          type="button"
          className="btn btn-reset"
          onClick={() => resetValue(item)}
        >
          Reset
        </button>
      </div>
      <div className="anim-row-control">
        <label className="toggle">
          <input
            type="checkbox"
            checked={value}
            onChange={(event) =>
              setValue(item.id, namespace, event.target.checked)
            }
          />
          <span>{value ? "On" : "Off"}</span>
        </label>
      </div>
      <div className="anim-row-meta">
        <span>{item.type}</span>
      </div>
    </div>
  );
}

function StringRow({ item, namespace, setValue, resetValue }: RowProps) {
  const value = String(
    useAnimValue(namespace, item) ?? item.defaultValue ?? "",
  );
  return (
    <div className="anim-row">
      <div className="anim-row-label">
        <span>{item.label}</span>
        <button
          type="button"
          className="btn btn-reset"
          onClick={() => resetValue(item)}
        >
          Reset
        </button>
      </div>
      <div className="anim-row-control">
        <input
          type="text"
          value={value}
          onChange={(event) => setValue(item.id, namespace, event.target.value)}
          className="text-input" /* reuse styling */
        />
      </div>
      <div className="anim-row-meta">
        <span>{item.type}</span>
      </div>
    </div>
  );
}

function ColorRow({ item, namespace, setValue, resetValue }: RowProps) {
  const value = (useAnimValue(namespace, item) ?? item.defaultValue) as
    | RawRGB
    | RawHSL
    | undefined;
  const cssColor = useMemo(() => toCssColor(value), [value]);

  return (
    <div className="anim-row">
      <div className="anim-row-label">
        <span>{item.label}</span>
        <button
          type="button"
          className="btn btn-reset"
          onClick={() => resetValue(item)}
        >
          Reset
        </button>
      </div>
      <div className="anim-row-control color-control">
        <input
          type="color"
          value={cssColor}
          onChange={(event) =>
            setValue(
              item.id,
              namespace,
              fromCssColor(event.target.value, value ?? item.defaultValue),
            )
          }
        />
        <code>{cssColor}</code>
      </div>
      <div className="anim-row-meta">
        <span>{item.type}</span>
      </div>
    </div>
  );
}

function UnsupportedRow({ item, namespace, resetValue }: RowProps) {
  const value = useAnimValue(namespace, item);
  return (
    <div className="anim-row">
      <div className="anim-row-label">
        <span>{item.label}</span>
        <button
          type="button"
          className="btn btn-reset"
          onClick={() => resetValue(item)}
        >
          Reset
        </button>
      </div>
      <div className="anim-row-control">
        <pre className="unsupported-value">
          {JSON.stringify(value ?? item.defaultValue, null, 2)}
        </pre>
      </div>
      <div className="anim-row-meta">
        <span>{item.type}</span>
        <span>Unsupported editor</span>
      </div>
    </div>
  );
}

function renderRow(props: RowProps) {
  switch (props.item.type) {
    case "number":
      return <NumberRow {...props} />;
    case "vector2":
    case "vector3":
    case "euler":
      return <VectorRow {...props} />;
    case "boolean":
      return <BooleanRow {...props} />;
    case "string":
      return <StringRow {...props} />;
    case "rgb":
    case "hsl":
      return <ColorRow {...props} />;
    default:
      return <UnsupportedRow {...props} />;
  }
}

function GroupSection({
  group,
  namespace,
  setValue,
  resetValue,
}: {
  group: AnimatableListGroup;
  namespace: string;
  setValue: SetValueFn;
  resetValue: ResetFn;
}) {
  return (
    <details className="anim-group">
      <summary>
        <span>{group.label}</span>
        <span className="tag">{group.items.length}</span>
      </summary>
      <div className="anim-group-body">
        {group.items.map((item: AnimatableListItem) => (
          <div className="anim-row-wrapper" key={item.id}>
            {renderRow({ item, namespace, setValue, resetValue })}
          </div>
        ))}
      </div>
    </details>
  );
}

export function AnimatableInspector({ namespace }: { namespace: string }) {
  const [filter, setFilter] = useState("");
  const { groups, total, filtered } = useAnimatableList(namespace, filter);
  const setValue = useVizijStore((state) => state.setValue);

  const resetValue = (item: AnimatableListItem) => {
    setValue(item.id, namespace, cloneValue(item.defaultValue));
  };

  return (
    <CollapsiblePanel
      title="Animatables"
      className="animatable-panel"
      bodyClassName="inspector-body"
      headerEnd={
        <span className="tag">
          {filtered} / {total}
        </span>
      }
      defaultOpen={false}
    >
      <div className="inspector-search">
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter by name, id, type…"
        />
        <span>
          {filtered === total ? "Showing all" : `Filtered to ${filtered}`}
        </span>
      </div>
      {groups.length === 0 ? (
        <div className="panel-status">
          No animatables match the current filter.
        </div>
      ) : (
        <div className="anim-groups">
          {groups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              namespace={namespace}
              setValue={setValue}
              resetValue={resetValue}
            />
          ))}
        </div>
      )}
    </CollapsiblePanel>
  );
}
