import {
  STANDARD_RIG_INPUTS,
  type StandardRigInput,
} from "./standardRigInputs";
import type { AnimatableComponent } from "./animatableMetadata";

export interface RemapSettings {
  inMin: number;
  inMax: number;
  outMin: number;
  outMax: number;
}

export interface AnimatableBinding {
  targetId: string;
  inputId: string | null;
  remap: RemapSettings;
}

export type BindingMap = Record<string, AnimatableBinding>;

export type StandardInputValues = Record<string, number>;

const DEFAULT_INPUT_RANGE = { min: -1, max: 1 };

export function createDefaultRemap(
  component: AnimatableComponent,
): RemapSettings {
  return {
    inMin: DEFAULT_INPUT_RANGE.min,
    inMax: DEFAULT_INPUT_RANGE.max,
    outMin: component.range.min,
    outMax: component.range.max,
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

export function createDefaultInputValues(): StandardInputValues {
  const values: StandardInputValues = {};
  STANDARD_RIG_INPUTS.forEach((input) => {
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
        ...binding.remap,
        inMin: DEFAULT_INPUT_RANGE.min,
        inMax: DEFAULT_INPUT_RANGE.max,
      },
    };
  }
  return {
    ...binding,
    inputId: input.id,
    remap: {
      inMin: input.range.min,
      inMax: input.range.max,
      outMin: component.range.min,
      outMax: component.range.max,
    },
  };
}

export function remapValue(value: number, remap: RemapSettings): number {
  const { inMin, inMax, outMin, outMax } = remap;
  if (Number.isNaN(value)) {
    return outMin;
  }
  if (Math.abs(inMax - inMin) < 1e-6) {
    return outMin;
  }
  const t = (value - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

export function reconcileBindings(
  previous: BindingMap,
  components: AnimatableComponent[],
): BindingMap {
  const next: BindingMap = {};
  const EPSILON = 1e-6;
  components.forEach((component) => {
    const existing = previous[component.id];
    if (existing) {
      const needsOutUpdate =
        Math.abs(existing.remap.outMin - component.range.min) > EPSILON ||
        Math.abs(existing.remap.outMax - component.range.max) > EPSILON;
      const remap = {
        ...existing.remap,
      };
      if (needsOutUpdate) {
        remap.outMin = component.range.min;
        remap.outMax = component.range.max;
      }
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
