import type {
  AnimatableValue,
  AnimatableNumber,
  AnimatableVector2,
  AnimatableVector3,
  AnimatableEuler,
  AnimatableColor,
  RawValue,
  RawVector2,
  RawVector3,
  RawEuler,
  RawColor,
  RawRGB,
} from "../animated-values";
import {
  computeNumberBounds,
  computeVectorBounds,
  type VectorDescriptorType,
} from "./bounds";

type VectorComponent = "x" | "y" | "z" | "r" | "g" | "b";

export interface AnimatableComponent {
  /**
   * Unique id derived from the animatable id + component suffix.
   */
  id: string;
  /**
   * Sanitised identifier suitable for graph node ids.
   */
  safeId: string;
  animatableId: string;
  animatableType: AnimatableValue["type"];
  /**
   * Optional component identifier (`x`, `y`, `z`) when the animatable is a vector/euler.
   */
  component?: VectorComponent;
  label: string;
  defaultValue: number;
  range: {
    min: number;
    max: number;
  };
}

export type ComponentOverrideMap = Partial<Record<VectorComponent, number>>;

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, "_");
}

function ensureUniqueSafeId(base: string, registry: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (registry.has(candidate)) {
    candidate = `${base}_${suffix++}`;
  }
  registry.add(candidate);
  return candidate;
}

// Arora engine-emitted scalar Value wrappers ({ f32: 1 }, { f64: 1 }, ...).
// The wasm runtime marshals animatable defaults in this record encoding, so the
// plain-number reader below must unwrap it before falling back to a default.
const SCALAR_VALUE_KEYS = [
  "f32",
  "f64",
  "i64",
  "i32",
  "u64",
  "u32",
  "float",
] as const;

function unwrapScalarValue(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of SCALAR_VALUE_KEYS) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
}

// Arora struct Value encoding: { struct: { fields: [{ value: <scalar> }, ...] } }.
// Vector animatable defaults arrive in this form; return the ordered field value
// at the requested component index.
function unwrapStructComponent(
  value: unknown,
  index: number,
): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const struct = (value as { struct?: unknown }).struct;
  if (!struct || typeof struct !== "object") {
    return undefined;
  }
  const fields = (struct as { fields?: unknown }).fields;
  if (!Array.isArray(fields)) {
    return undefined;
  }
  const field = fields[index] as { value?: unknown } | undefined;
  return unwrapScalarValue(field?.value);
}

function coerceNumber(value: unknown, fallback: number): number {
  const scalar = unwrapScalarValue(value);
  return scalar !== undefined ? scalar : fallback;
}

function resolveRangeFromConstraints(
  min: number | null | undefined,
  max: number | null | undefined,
  defaultValue: number,
  computeFallback: () => { min: number; max: number },
): { min: number; max: number } {
  const hasMin = typeof min === "number" && Number.isFinite(min);
  const hasMax = typeof max === "number" && Number.isFinite(max);

  if (hasMin && hasMax) {
    return { min: min as number, max: max as number };
  }

  if (hasMin) {
    const fallback = computeFallback();
    const base = Number.isFinite(defaultValue)
      ? defaultValue
      : (fallback.max ?? (min as number));
    const derivedMax = Math.max(base, fallback.max, min as number);
    return {
      min: min as number,
      max: derivedMax,
    };
  }

  if (hasMax) {
    const fallback = computeFallback();
    const base = Number.isFinite(defaultValue)
      ? defaultValue
      : (fallback.min ?? (max as number));
    const derivedMin = Math.min(base, fallback.min, max as number);
    return {
      min: derivedMin,
      max: max as number,
    };
  }

  return computeFallback();
}

function formatComponentLabel(
  animatable: AnimatableValue,
  component?: VectorComponent,
): string {
  const base = animatable.name || animatable.id;
  if (!component) {
    return base;
  }
  return `${base} (${component.toUpperCase()})`;
}

function componentToIndex(component: VectorComponent): 0 | 1 | 2 {
  switch (component) {
    case "x":
    case "r":
      return 0;
    case "y":
    case "g":
      return 1;
    default:
      return 2;
  }
}

function componentKeys(component: VectorComponent): readonly string[] {
  switch (component) {
    case "x":
      return ["x", "r"];
    case "y":
      return ["y", "g"];
    case "z":
      return ["z", "b"];
    case "r":
      return ["r", "x"];
    case "g":
      return ["g", "y"];
    case "b":
      return ["b", "z"];
    default:
      return [component];
  }
}

function getVectorComponentValue(
  vector:
    | RawVector2
    | RawVector3
    | RawEuler
    | RawColor
    | number[]
    | null
    | undefined,
  component: VectorComponent,
  fallback: number,
): number {
  if (!vector) {
    return fallback;
  }
  const index = componentToIndex(component);
  if (Array.isArray(vector)) {
    return coerceNumber(vector[index], fallback);
  }
  if (typeof vector === "object") {
    // Arora struct encoding ({ struct: { fields: [...] } }) has no x/y/z keys.
    const structComponent = unwrapStructComponent(vector, index);
    if (structComponent !== undefined) {
      return structComponent;
    }
    const record = vector as unknown as Record<string, unknown>;
    for (const key of componentKeys(component)) {
      const candidate = unwrapScalarValue(record[key]);
      if (candidate !== undefined) {
        return candidate;
      }
    }
  }
  return fallback;
}

function inferFeatureKey(animatable: AnimatableValue): string {
  return (
    animatable.pub?.output ??
    animatable.name ??
    (typeof animatable.id === "string" ? animatable.id : "")
  );
}

function computeNumberFallbackRange(
  animatable: AnimatableNumber,
  defaultValue: number,
): { min: number; max: number } {
  const [min, max] = computeNumberBounds(
    defaultValue,
    inferFeatureKey(animatable),
  );
  return { min, max };
}

function computeVectorFallbackRange(
  animatable:
    | AnimatableVector2
    | AnimatableVector3
    | AnimatableEuler
    | AnimatableColor,
  component: VectorComponent,
  defaultValue: number,
): { min: number; max: number } {
  let descriptorType: VectorDescriptorType;
  let defaults: RawVector2 | RawVector3 | RawEuler | RawColor;

  switch (animatable.type) {
    case "vector2":
      descriptorType = "vector2";
      defaults = cloneVector2(animatable.default);
      break;
    case "vector3":
      descriptorType = "vector3";
      defaults = cloneVector3(animatable.default);
      break;
    case "euler":
      descriptorType = "euler";
      defaults = cloneVector3(animatable.default);
      break;
    case "rgb":
      descriptorType = "rgb";
      defaults = cloneColor(animatable.default);
      break;
    default:
      descriptorType = "vector3";
      defaults = cloneVector3(animatable.default);
      break;
  }

  const { min, max } = computeVectorBounds(
    descriptorType,
    inferFeatureKey(animatable),
    defaults,
  );
  const index = componentToIndex(component);
  const fallbackMin = min[index];
  const fallbackMax = max[index];
  if (
    typeof fallbackMin === "number" &&
    Number.isFinite(fallbackMin) &&
    typeof fallbackMax === "number" &&
    Number.isFinite(fallbackMax)
  ) {
    return { min: fallbackMin, max: fallbackMax };
  }
  const generic = computeNumberBounds(
    defaultValue,
    inferFeatureKey(animatable),
  );
  return { min: generic[0], max: generic[1] };
}

function getVectorConstraintComponent(
  constraints:
    | AnimatableVector3["constraints"]
    | AnimatableVector2["constraints"]
    | AnimatableEuler["constraints"]
    | AnimatableColor["constraints"],
  component: VectorComponent,
  bound: "min" | "max",
): number | null | undefined {
  const values = constraints?.[bound];
  if (!Array.isArray(values)) {
    return undefined;
  }
  const index = componentToIndex(component);
  return values[index] ?? undefined;
}

function extractNumberComponent(
  animatable: AnimatableNumber,
  registry: Set<string>,
): AnimatableComponent {
  const defaultValue = coerceNumber(animatable.default, 0);
  const range = resolveRangeFromConstraints(
    animatable.constraints?.min,
    animatable.constraints?.max,
    defaultValue,
    () => computeNumberFallbackRange(animatable, defaultValue),
  );
  const id = animatable.id;
  const safeBase = sanitizeIdentifier(id);
  return {
    id,
    safeId: ensureUniqueSafeId(safeBase, registry),
    animatableId: animatable.id,
    animatableType: animatable.type,
    label: formatComponentLabel(animatable),
    defaultValue,
    range,
  };
}

function extractVectorComponents(
  animatable:
    | AnimatableVector2
    | AnimatableVector3
    | AnimatableEuler
    | AnimatableColor,
  registry: Set<string>,
): AnimatableComponent[] {
  let components: VectorComponent[];
  if (animatable.type === "vector2") {
    components = ["x", "y"];
  } else if (animatable.type === "rgb") {
    components = ["r", "g", "b"];
  } else {
    components = ["x", "y", "z"];
  }

  return components.map((component) => {
    const defaultValue = getVectorComponentValue(
      animatable.default,
      component,
      0,
    );
    const range = resolveRangeFromConstraints(
      getVectorConstraintComponent(animatable.constraints, component, "min"),
      getVectorConstraintComponent(animatable.constraints, component, "max"),
      defaultValue,
      () => computeVectorFallbackRange(animatable, component, defaultValue),
    );
    const id = `${animatable.id}:${component}`;
    const safeBase = sanitizeIdentifier(id);
    return {
      id,
      safeId: ensureUniqueSafeId(safeBase, registry),
      animatableId: animatable.id,
      animatableType: animatable.type,
      component,
      label: formatComponentLabel(animatable, component),
      defaultValue,
      range,
    };
  });
}

export function extractAnimatableComponents(
  animatables: Record<string, AnimatableValue>,
): AnimatableComponent[] {
  const result: AnimatableComponent[] = [];
  const safeRegistry = new Set<string>();
  Object.values(animatables).forEach((animatable) => {
    switch (animatable.type) {
      case "number": {
        result.push(extractNumberComponent(animatable, safeRegistry));
        break;
      }
      case "vector2":
      case "vector3":
      case "euler": {
        result.push(...extractVectorComponents(animatable, safeRegistry));
        break;
      }
      case "rgb": {
        result.push(...extractVectorComponents(animatable, safeRegistry));
        break;
      }
      default:
        // Skip unsupported animatable types (strings, colors, etc.) for rig mapping.
        break;
    }
  });
  return result.sort((a, b) => a.label.localeCompare(b.label));
}

// The clone helpers below feed the fallback range computation (computeVector*
// Bounds) and buildAnimatableValue. They must decode the same forms the base
// reader does — plain {x,y,z}/{r,g,b}, arrays, AND the arora struct encoding
// ({ struct: { fields: [...] } }) — or a struct-form default reads as 0 and the
// derived range collapses (e.g. a scale of 25 clamped to the [0,2] fallback,
// shrinking mask/occluder shapes). getVectorComponentValue handles all forms.
function cloneVector2(defaultValue: unknown): RawVector2 {
  return {
    x: getVectorComponentValue(defaultValue as RawVector2, "x", 0),
    y: getVectorComponentValue(defaultValue as RawVector2, "y", 0),
  };
}

function cloneVector3(defaultValue: unknown): RawVector3 {
  return {
    x: getVectorComponentValue(defaultValue as RawVector3, "x", 0),
    y: getVectorComponentValue(defaultValue as RawVector3, "y", 0),
    z: getVectorComponentValue(defaultValue as RawVector3, "z", 0),
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function hslToRgb(h: number, s: number, l: number): RawRGB {
  const hueToRgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const hh = ((h % 1) + 1) % 1;
  const ss = clamp01(s);
  const ll = clamp01(l);

  if (ss === 0) {
    return {
      r: ll,
      g: ll,
      b: ll,
    };
  }

  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;

  return {
    r: hueToRgb(p, q, hh + 1 / 3),
    g: hueToRgb(p, q, hh),
    b: hueToRgb(p, q, hh - 1 / 3),
  };
}

function cloneColor(defaultValue: unknown): RawRGB {
  if (defaultValue && typeof defaultValue === "object") {
    const value = defaultValue as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(value, "h") &&
      Object.prototype.hasOwnProperty.call(value, "s") &&
      Object.prototype.hasOwnProperty.call(value, "l")
    ) {
      const h = coerceNumber(value.h, 0);
      const s = coerceNumber(value.s, 0);
      const l = coerceNumber(value.l, 0);
      return hslToRgb(h, s, l);
    }
    // Plain {r,g,b}, arrays, and the arora struct encoding all decode here.
    return {
      r: getVectorComponentValue(defaultValue as RawColor, "r", 0),
      g: getVectorComponentValue(defaultValue as RawColor, "g", 0),
      b: getVectorComponentValue(defaultValue as RawColor, "b", 0),
    };
  }
  return { r: 0, g: 0, b: 0 };
}

function applyVector2Overrides(
  base: RawVector2,
  overrides: ComponentOverrideMap,
): RawVector2 {
  const next: RawVector2 = { ...base };
  (["x", "y"] as const).forEach((component) => {
    if (Object.prototype.hasOwnProperty.call(overrides, component)) {
      next[component] = overrides[component]!;
    }
  });
  return next;
}

function applyVector3Overrides<T extends RawVector3 | RawEuler>(
  base: T,
  overrides: ComponentOverrideMap,
): T {
  const next: T = { ...base };
  (["x", "y", "z"] as const).forEach((component) => {
    if (Object.prototype.hasOwnProperty.call(overrides, component)) {
      next[component] = overrides[component]!;
    }
  });
  return next;
}

function applyColorOverrides(
  base: RawRGB,
  overrides: ComponentOverrideMap,
): RawRGB {
  const next: RawRGB = { ...base };
  (["r", "g", "b"] as const).forEach((component) => {
    const value = overrides[component];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[component] = value;
    }
  });
  return next;
}

export function buildAnimatableValue(
  animatable: AnimatableValue,
  overrides: ComponentOverrideMap | number | undefined,
): RawValue {
  switch (animatable.type) {
    case "number": {
      if (typeof overrides === "number") {
        return overrides;
      }
      if (
        overrides &&
        typeof overrides === "object" &&
        "x" in overrides &&
        overrides.x !== undefined
      ) {
        return overrides.x;
      }
      return coerceNumber(animatable.default, 0);
    }
    case "vector2": {
      const base = cloneVector2(animatable.default);
      if (typeof overrides === "number") {
        return applyVector2Overrides(base, { x: overrides, y: overrides });
      }
      return applyVector2Overrides(base, overrides ?? {});
    }
    case "vector3":
    case "euler": {
      const base = cloneVector3(animatable.default);
      if (typeof overrides === "number") {
        return applyVector3Overrides(base, {
          x: overrides,
          y: overrides,
          z: overrides,
        });
      }
      return applyVector3Overrides(base, overrides ?? {});
    }
    case "rgb": {
      const base = cloneColor(animatable.default);
      if (typeof overrides === "number") {
        return applyColorOverrides(base, {
          r: overrides,
          g: overrides,
          b: overrides,
        });
      }
      return applyColorOverrides(base, overrides ?? {});
    }
    default:
      return animatable.default;
  }
}
