import type {
  AnimatableValue,
  AnimatableNumber,
  AnimatableVector2,
  AnimatableVector3,
  AnimatableEuler,
  AnimatableColor,
} from "@vizij/utils";
import type {
  RawValue,
  RawVector2,
  RawVector3,
  RawEuler,
  RawColor,
  RawRGB,
} from "@vizij/utils";

type VectorComponent = "x" | "y" | "z" | "r" | "g" | "b";

export interface AnimatableComponent {
  /**
   * Unique id derived from the animatable id + component suffix.
   */
  id: string;
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

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return fallback;
}

function computeFallbackRange(defaultValue: number): {
  min: number;
  max: number;
} {
  const delta = Math.max(Math.abs(defaultValue), 1);
  console.log(
    "Computing fallback around 1 (default, min, max)",
    defaultValue,
    defaultValue - delta,
    defaultValue + delta,
  );
  return {
    min: defaultValue - delta,
    max: defaultValue + delta,
  };
}

function computeTranslationBounds(componentValue: number): [number, number] {
  if (Math.abs(componentValue) < 1e-4) {
    return [-1, 1];
  }
  if (componentValue >= 0) {
    return [0, componentValue * 2];
  }
  return [componentValue * 2, 0];
}

function computeScaleBounds(componentValue: number): [number, number] {
  let min = 0;
  let max = 2;
  if (componentValue < min) {
    min = componentValue;
  }
  if (componentValue > max) {
    max = componentValue;
  }
  return [min, max];
}

export function computeNumberBounds(
  defaultValue: number,
  featureKey: string,
): [number, number] {
  const key = featureKey.toLowerCase();
  if (key.includes("opacity")) {
    return [0, 1];
  }
  if (key.includes("scale")) {
    return computeScaleBounds(defaultValue);
  }
  if (key.includes("rotation") || key.includes("angle")) {
    const extent = Math.max(Math.abs(defaultValue), Math.PI);
    return [-extent, extent];
  }
  if (key.includes("translation") || key.includes("position")) {
    return computeTranslationBounds(defaultValue);
  }
  if (defaultValue === 0) {
    return [0, 1];
  }
  if (defaultValue > 0) {
    return [0, defaultValue * 2];
  }
  return [defaultValue * 2, 0];
}

type VectorDescriptorType = "vector2" | "vector3" | "euler" | "rgb";

export function computeVectorBounds(
  descriptorType: VectorDescriptorType,
  featureKey: string,
  defaults: RawVector2 | RawVector3 | RawEuler | RawColor,
): {
  min: Array<number | null>;
  max: Array<number | null>;
} {
  // console.log("Computing bounds", descriptorType, featureKey, defaults)
  switch (descriptorType) {
    case "rgb":
      return {
        min: [0, 0, 0],
        max: [1, 1, 1],
      };
    case "euler":
      return {
        min: [-Math.PI, -Math.PI, -Math.PI],
        max: [Math.PI, Math.PI, Math.PI],
      };
    case "vector2": {
      const vector = defaults as RawVector2;
      const xRange = computeNumberBounds(vector.x ?? 0, featureKey);
      const yRange = computeNumberBounds(vector.y ?? 0, featureKey);
      return {
        min: [xRange[0], yRange[0]],
        max: [xRange[1], yRange[1]],
      };
    }
    case "vector3": {
      const vector = defaults as RawVector3;
      const xRange = computeNumberBounds(vector.x ?? 0, featureKey);
      const yRange = computeNumberBounds(vector.y ?? 0, featureKey);
      const zRange = computeNumberBounds(vector.z ?? 0, featureKey);
      return {
        min: [xRange[0], yRange[0], zRange[0]],
        max: [xRange[1], yRange[1], zRange[1]],
      };
    }
    default:
      return {
        min: [0, 0, 0],
        max: [0, 0, 0],
      };
  }
}

function resolveRangeFromConstraints(
  min: number | null | undefined,
  max: number | null | undefined,
  defaultValue: number,
): { min: number; max: number } {
  if (typeof min === "number" && Number.isFinite(min)) {
    if (typeof max === "number" && Number.isFinite(max) && max !== min) {
      return { min, max };
    }
    const derivedMax = max ?? defaultValue;
    if (Number.isFinite(derivedMax) && derivedMax !== min) {
      return {
        min,
        max: derivedMax,
      };
    }
  }
  if (typeof max === "number" && Number.isFinite(max)) {
    const derivedMin = min ?? defaultValue;
    if (Number.isFinite(derivedMin) && derivedMin !== max) {
      return {
        min: derivedMin,
        max,
      };
    }
  }
  return computeFallbackRange(defaultValue);
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
  if (Array.isArray(vector)) {
    const index = componentToIndex(component);
    return coerceNumber(vector[index], fallback);
  }
  if (typeof vector === "object") {
    const record = vector as unknown as Record<string, unknown>;
    for (const key of componentKeys(component)) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
  }
  return fallback;
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
): AnimatableComponent {
  const defaultValue = coerceNumber(animatable.default, 0);
  const range = resolveRangeFromConstraints(
    animatable.constraints?.min,
    animatable.constraints?.max,
    defaultValue,
  );
  return {
    id: animatable.id,
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
    console.log("extracting", animatable, component, defaultValue);
    const range = resolveRangeFromConstraints(
      getVectorConstraintComponent(animatable.constraints, component, "min"),
      getVectorConstraintComponent(animatable.constraints, component, "max"),
      defaultValue,
    );
    return {
      id: `${animatable.id}:${component}`,
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
  Object.values(animatables).forEach((animatable) => {
    switch (animatable.type) {
      case "number": {
        result.push(extractNumberComponent(animatable));
        break;
      }
      case "vector2":
      case "vector3":
      case "euler": {
        result.push(...extractVectorComponents(animatable));
        break;
      }
      case "rgb": {
        result.push(...extractVectorComponents(animatable));
        break;
      }
      default:
        // Skip unsupported animatable types (strings, colors, etc.) for rig mapping.
        break;
    }
  });
  return result.sort((a, b) => a.label.localeCompare(b.label));
}

function cloneVector2(defaultValue: unknown): RawVector2 {
  if (defaultValue && typeof defaultValue === "object") {
    const value = defaultValue as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(value, "x") &&
      Object.prototype.hasOwnProperty.call(value, "y")
    ) {
      return {
        x: coerceNumber(value.x, 0),
        y: coerceNumber(value.y, 0),
      };
    }
  }
  return { x: 0, y: 0 };
}

function cloneVector3(defaultValue: unknown): RawVector3 {
  if (defaultValue && typeof defaultValue === "object") {
    const value = defaultValue as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(value, "x") &&
      Object.prototype.hasOwnProperty.call(value, "y") &&
      Object.prototype.hasOwnProperty.call(value, "z")
    ) {
      return {
        x: coerceNumber(value.x, 0),
        y: coerceNumber(value.y, 0),
        z: coerceNumber(value.z, 0),
      };
    }
  }
  return { x: 0, y: 0, z: 0 };
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
      Object.prototype.hasOwnProperty.call(value, "r") &&
      Object.prototype.hasOwnProperty.call(value, "g") &&
      Object.prototype.hasOwnProperty.call(value, "b")
    ) {
      return {
        r: coerceNumber(value.r, 0),
        g: coerceNumber(value.g, 0),
        b: coerceNumber(value.b, 0),
      };
    }
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
