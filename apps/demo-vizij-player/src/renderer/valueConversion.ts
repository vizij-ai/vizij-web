import type { ValueJSON } from "@vizij/orchestrator-react";
import {
  isNormalizedValue,
  valueAsBool,
  valueAsColorRgba,
  valueAsNumber,
  valueAsText,
  valueAsTransform,
  valueAsVector,
} from "@vizij/value-json";
import type { RawValue } from "@vizij/utils";

function numericArrayToRaw(arr: number[]): RawValue {
  const normalized = arr.map((entry) => Number(entry ?? 0));
  switch (normalized.length) {
    case 2:
      return { x: normalized[0], y: normalized[1] } as unknown as RawValue;
    case 3:
      return {
        x: normalized[0],
        y: normalized[1],
        z: normalized[2],
      } as unknown as RawValue;
    case 4:
      return {
        x: normalized[0],
        y: normalized[1],
        z: normalized[2],
        w: normalized[3],
      } as unknown as RawValue;
    default:
      return normalized as unknown as RawValue;
  }
}

export function valueJSONToRaw(value?: ValueJSON): RawValue | undefined {
  if (value == null) {
    return undefined;
  }
  if (
    typeof value === "number" ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value as unknown as RawValue;
  }
  if (isNormalizedValue(value)) {
    switch (value.type) {
      case "float": {
        const num = valueAsNumber(value);
        return typeof num === "number" ? (num as RawValue) : undefined;
      }
      case "bool": {
        const boolVal = valueAsBool(value);
        return typeof boolVal === "boolean" ? (boolVal as RawValue) : undefined;
      }
      case "text": {
        const textVal = valueAsText(value);
        return typeof textVal === "string" ? (textVal as RawValue) : undefined;
      }
      case "vec2":
      case "vec3":
      case "vec4":
      case "quat":
      case "vector": {
        const vec = valueAsVector(value);
        return vec ? numericArrayToRaw(vec) : undefined;
      }
      case "colorrgba": {
        const color = valueAsColorRgba(value);
        if (!color) {
          return undefined;
        }
        const [r = 0, g = 0, b = 0, a = 1] = color;
        return { r, g, b, a } as unknown as RawValue;
      }
      case "transform": {
        const tr = valueAsTransform(value);
        if (!tr) {
          return undefined;
        }
        const translationRaw = numericArrayToRaw(tr.translation);
        const rotationRaw = numericArrayToRaw(tr.rotation);
        const scaleRaw = numericArrayToRaw(tr.scale);
        return {
          translation: translationRaw,
          rotation: rotationRaw,
          scale: scaleRaw,
          pos: translationRaw,
          rot: rotationRaw,
        } as unknown as RawValue;
      }
      case "enum": {
        const [tag, inner] = value.data;
        return {
          tag,
          value: valueJSONToRaw(inner),
        } as unknown as RawValue;
      }
      case "record": {
        const result: Record<string, RawValue | undefined> = {};
        Object.entries(value.data).forEach(([key, entry]) => {
          result[key] = valueJSONToRaw(entry);
        });
        return result as unknown as RawValue;
      }
      default:
        return undefined;
    }
  }
  if (Array.isArray(value)) {
    return value.map((entry) => valueJSONToRaw(entry)) as unknown as RawValue;
  }
  if (typeof value === "object") {
    const result: Record<string, RawValue | undefined> = {};
    Object.entries(value).forEach(([key, entry]) => {
      result[key] = valueJSONToRaw(entry as ValueJSON);
    });
    return result as unknown as RawValue;
  }
  return undefined;
}
