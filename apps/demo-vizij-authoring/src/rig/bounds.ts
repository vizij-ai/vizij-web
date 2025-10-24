import type { RawColor, RawEuler, RawVector2, RawVector3 } from "@vizij/utils";

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

export type VectorDescriptorType = "vector2" | "vector3" | "euler" | "rgb";

export function computeVectorBounds(
  descriptorType: VectorDescriptorType,
  featureKey: string,
  defaults: RawVector2 | RawVector3 | RawEuler | RawColor,
): {
  min: Array<number | null>;
  max: Array<number | null>;
} {
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
