import {
  instanceOfRawEuler,
  instanceOfRawRGB,
  instanceOfRawVector3,
  type AnimatableNumber,
  type AnimatableColor,
  type AnimatableEuler,
  type AnimatableVector3,
  type AnimatableValue,
  type RawColor,
  type RawEuler,
  type RawRGB,
  type RawValue,
  type RawVector3,
} from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import { computeNumberBounds, computeVectorBounds } from "@vizij/utils";
import { APPROX_EQUAL_EPSILON } from "../../utils/constants";
import type { FeatureEntry, VectorFeatureEntry, RenderableLike } from "./types";

export function formatStandardInputLabel(input: StandardRigInput): string {
  return input.path;
}

export function isApproximatelyEqual(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  if (
    a === null ||
    b === null ||
    a === undefined ||
    b === undefined ||
    Number.isNaN(a) ||
    Number.isNaN(b)
  ) {
    return false;
  }
  return Math.abs(a - b) < APPROX_EQUAL_EPSILON;
}

export function ensureVectorValue(
  entry: VectorFeatureEntry,
  value: RawValue | undefined,
): RawVector3 | RawEuler | RawRGB {
  if (entry.vector.descriptorType === "rgb") {
    if (value && instanceOfRawRGB(value)) {
      return { r: value.r, g: value.g, b: value.b };
    }
    return { r: 0, g: 0, b: 0 };
  }

  const fallback = { x: 0, y: 0, z: 0 };
  if (value && instanceOfRawEuler(value)) {
    return { x: value.x, y: value.y, z: value.z };
  }
  if (value && instanceOfRawVector3(value)) {
    return { x: value.x, y: value.y, z: value.z };
  }
  return fallback;
}

export function cloneVectorTuple(
  tuple: readonly [number | null, number | null, number | null],
): [number | null, number | null, number | null] {
  return [tuple[0], tuple[1], tuple[2]];
}

export function getUnitsForEntry(entry: FeatureEntry): string | undefined {
  const key = entry.featureKey.toLowerCase();
  if (entry.type === "number") {
    if (key.includes("rotation") || key.includes("angle")) {
      return "rad";
    }
    if (key.includes("translation") || key.includes("position")) {
      return "m";
    }
    return undefined;
  }

  if (entry.vector.descriptorType === "euler" || key.includes("rotation")) {
    return "rad";
  }
  if (key.includes("translation") || key.includes("position")) {
    return "m";
  }
  return undefined;
}

export function buildDefaultAnimatable(
  entry: FeatureEntry,
  defaultValue: RawValue,
): AnimatableValue | null {
  const labelBase = `${entry.elementName} ${entry.featureLabel}`;

  if (entry.type === "number") {
    const numericDefault = typeof defaultValue === "number" ? defaultValue : 0;
    const [min, max] = computeNumberBounds(numericDefault, entry.featureKey);
    const units = getUnitsForEntry(entry);

    const descriptor: AnimatableNumber = {
      id: crypto.randomUUID(),
      name: labelBase,
      type: "number",
      default: numericDefault,
      constraints: {
        min,
        max,
      },
      pub: {
        public: true,
        output: labelBase,
        units,
      },
    };
    return descriptor;
  }

  const defaults = ensureVectorValue(entry, defaultValue);
  const { min: computedMin, max: computedMax } = computeVectorBounds(
    entry.vector.descriptorType,
    entry.featureKey,
    defaults,
  );
  const units = getUnitsForEntry(entry);

  type VecThree = [number | null, number | null, number | null] | undefined;

  const min = [computedMin[0], computedMin[1], computedMin[2]] as VecThree;
  const max = [computedMax[0], computedMax[1], computedMax[2]] as VecThree;

  if (entry.vector.descriptorType === "rgb") {
    const descriptor: AnimatableColor = {
      id: crypto.randomUUID(),
      name: labelBase,
      type: "rgb",
      default: defaults as RawColor,
      constraints: {
        min,
        max,
      },
      pub: {
        public: true,
        output: labelBase,
      },
    };
    return descriptor;
  }

  if (entry.vector.descriptorType === "euler") {
    const descriptor: AnimatableEuler = {
      id: crypto.randomUUID(),
      name: labelBase,
      type: "euler",
      default: defaults as RawEuler,
      constraints: {
        min,
        max,
      },
      pub: {
        public: true,
        output: labelBase,
        units: units ?? "rad",
      },
    };
    return descriptor;
  }

  const descriptor: AnimatableVector3 = {
    id: crypto.randomUUID(),
    name: labelBase,
    type: "vector3",
    default: defaults as RawVector3,
    constraints: {
      min,
      max,
    },
    pub: {
      public: true,
      output: labelBase,
      units,
    },
  };
  return descriptor;
}

export function isAnimatableReferencedElsewhere(
  world: Record<string, RenderableLike>,
  targetElementId: string,
  targetFeatureKey: string,
  animatableId: string,
): boolean {
  return Object.values(world).some((renderable) => {
    if (!renderable.features) {
      return false;
    }
    return Object.entries(renderable.features).some(([featureKey, feature]) =>
      Boolean(
        feature &&
          feature.animated &&
          feature.value === animatableId &&
          !(
            renderable.id === targetElementId && featureKey === targetFeatureKey
          ),
      ),
    );
  });
}
