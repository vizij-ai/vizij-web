import type { StandardRigInput } from "@vizij/utils";
import type { AnimatableComponent } from "@vizij/utils";

export interface RemapSettings {
  inLow: number;
  inAnchor: number;
  inHigh: number;
  outLow: number;
  outAnchor: number;
  outHigh: number;
}

export interface AnimatableBinding {
  targetId: string;
  inputId: string | null;
  remap: RemapSettings;
}

export type BindingMap = Record<string, AnimatableBinding>;

export type StandardInputValues = Record<string, number>;

const DEFAULT_INPUT_RANGE = { min: -1, max: 1 };
const DEFAULT_INPUT_ANCHOR = 0;

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

type LegacyRemapSettings = Partial<{
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}>;

function deriveOutputDefaults(component: AnimatableComponent): {
  outLow: number;
  outAnchor: number;
  outHigh: number;
} {
  const { min, max } = component.range;
  const anchor = clamp(component.defaultValue, min, max);
  return {
    outLow: min,
    outAnchor: anchor,
    outHigh: max,
  };
}

function deriveInputDefaults(): {
  inLow: number;
  inAnchor: number;
  inHigh: number;
} {
  return {
    inLow: DEFAULT_INPUT_RANGE.min,
    inAnchor: DEFAULT_INPUT_ANCHOR,
    inHigh: DEFAULT_INPUT_RANGE.max,
  };
}

function migrateLegacyRemap(
  legacy: LegacyRemapSettings | RemapSettings,
  component: AnimatableComponent,
): RemapSettings {
  const inputDefaults = deriveInputDefaults();
  const outputDefaults = deriveOutputDefaults(component);
  const defaults: RemapSettings = {
    inLow: inputDefaults.inLow,
    inAnchor: inputDefaults.inAnchor,
    inHigh: inputDefaults.inHigh,
    outLow: outputDefaults.outLow,
    outAnchor: outputDefaults.outAnchor,
    outHigh: outputDefaults.outHigh,
  };
  if (
    "inLow" in legacy &&
    "inHigh" in legacy &&
    "outLow" in legacy &&
    "outHigh" in legacy
  ) {
    const inLow = isFiniteNumber(legacy.inLow) ? legacy.inLow : defaults.inLow;
    const inAnchor = isFiniteNumber(legacy.inAnchor)
      ? legacy.inAnchor
      : defaults.inAnchor;
    const inHigh = isFiniteNumber(legacy.inHigh)
      ? legacy.inHigh
      : defaults.inHigh;
    let outLow = isFiniteNumber(legacy.outLow)
      ? legacy.outLow
      : defaults.outLow;
    let outHigh = isFiniteNumber(legacy.outHigh)
      ? legacy.outHigh
      : defaults.outHigh;
    if (outLow > outHigh) {
      const low = outHigh;
      const high = outLow;
      outLow = low;
      outHigh = high;
    }
    const outAnchor = clamp(
      isFiniteNumber(legacy.outAnchor) ? legacy.outAnchor : defaults.outAnchor,
      outLow,
      outHigh,
    );
    return {
      inLow,
      inAnchor,
      inHigh,
      outLow,
      outAnchor,
      outHigh,
    };
  }

  const legacyTyped = legacy as LegacyRemapSettings;
  const inLow = isFiniteNumber(legacyTyped.inMin)
    ? legacyTyped.inMin
    : defaults.inLow;
  const inHigh = isFiniteNumber(legacyTyped.inMax)
    ? legacyTyped.inMax
    : defaults.inHigh;
  const inAnchor = (inLow + inHigh) / 2;

  const legacyOutMid =
    isFiniteNumber(legacyTyped.outMin) && isFiniteNumber(legacyTyped.outMax)
      ? (legacyTyped.outMin + legacyTyped.outMax) / 2
      : defaults.outAnchor;
  const outAnchor = clamp(legacyOutMid, defaults.outLow, defaults.outHigh);

  return {
    inLow,
    inAnchor,
    inHigh,
    outLow: defaults.outLow,
    outAnchor,
    outHigh: defaults.outHigh,
  };
}

function normalizeRemap(
  remap: RemapSettings | LegacyRemapSettings | undefined,
  component: AnimatableComponent,
): RemapSettings {
  if (!remap) {
    return createDefaultRemap(component);
  }
  return migrateLegacyRemap(remap, component);
}

export function createDefaultRemap(
  component: AnimatableComponent,
): RemapSettings {
  const inputDefaults = deriveInputDefaults();
  const outputDefaults = deriveOutputDefaults(component);
  return {
    inLow: inputDefaults.inLow,
    inAnchor: inputDefaults.inAnchor,
    inHigh: inputDefaults.inHigh,
    outLow: outputDefaults.outLow,
    outAnchor: outputDefaults.outAnchor,
    outHigh: outputDefaults.outHigh,
  };
}

export function createDefaultBindings(
  components: AnimatableComponent[],
): BindingMap {
  const bindings: BindingMap = {};
  components.forEach((component) => {
    bindings[component.id] = {
      targetId: component.id,
      inputId: null,
      remap: createDefaultRemap(component),
    };
  });
  return bindings;
}

export function createDefaultInputValues(
  inputs: StandardRigInput[] = [],
): StandardInputValues {
  const values: StandardInputValues = {};
  inputs.forEach((input) => {
    values[input.id] = input.defaultValue;
  });
  return values;
}

export function updateBindingWithInput(
  binding: AnimatableBinding,
  component: AnimatableComponent,
  input: StandardRigInput | undefined,
): AnimatableBinding {
  if (!input) {
    return {
      ...binding,
      inputId: null,
      remap: {
        ...normalizeRemap(binding.remap, component),
        inLow: DEFAULT_INPUT_RANGE.min,
        inAnchor: DEFAULT_INPUT_ANCHOR,
        inHigh: DEFAULT_INPUT_RANGE.max,
      },
    };
  }
  const normalized = normalizeRemap(binding.remap, component);
  return {
    ...binding,
    inputId: input.id,
    remap: {
      ...normalized,
      inLow: input.range.min,
      inAnchor: clamp(input.defaultValue, input.range.min, input.range.max),
      inHigh: input.range.max,
      ...deriveOutputDefaults(component),
    },
  };
}

export function remapValue(value: number, remap: RemapSettings): number {
  const { inLow, inAnchor, inHigh, outLow, outAnchor, outHigh } = remap;
  if (Number.isNaN(value)) {
    return outAnchor;
  }
  if (value <= inAnchor) {
    const span = inAnchor - inLow;
    if (Math.abs(span) < EPSILON) {
      return outLow;
    }
    const t = (value - inLow) / span;
    return outLow + t * (outAnchor - outLow);
  }
  const span = inHigh - inAnchor;
  if (Math.abs(span) < EPSILON) {
    return outHigh;
  }
  const t = (value - inAnchor) / span;
  return outAnchor + t * (outHigh - outAnchor);
}

export function reconcileBindings(
  previous: BindingMap,
  components: AnimatableComponent[],
): BindingMap {
  const next: BindingMap = {};
  components.forEach((component) => {
    const existing = previous[component.id];
    if (existing) {
      const remap = normalizeRemap(existing.remap, component);
      const outputDefaults = deriveOutputDefaults(component);
      if (!Number.isFinite(remap.outLow)) {
        remap.outLow = outputDefaults.outLow;
      }
      if (!Number.isFinite(remap.outHigh)) {
        remap.outHigh = outputDefaults.outHigh;
      }
      if (!Number.isFinite(remap.outAnchor)) {
        remap.outAnchor = outputDefaults.outAnchor;
      }
      if (remap.outLow > remap.outHigh) {
        const low = remap.outHigh;
        const high = remap.outLow;
        remap.outLow = low;
        remap.outHigh = high;
      }
      remap.outAnchor = clamp(remap.outAnchor, remap.outLow, remap.outHigh);
      next[component.id] = {
        ...existing,
        targetId: component.id,
        remap,
      };
    } else {
      next[component.id] = {
        targetId: component.id,
        inputId: null,
        remap: createDefaultRemap(component),
      };
    }
  });
  return next;
}
