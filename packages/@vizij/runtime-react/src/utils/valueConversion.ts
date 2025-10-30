import {
  isNormalizedValue,
  valueAsBool,
  valueAsColorRgba,
  valueAsNumber,
  valueAsText,
  valueAsTransform,
  valueAsVector,
} from "@vizij/value-json";
import type { ValueJSON } from "@vizij/orchestrator-react";
import type { RawValue } from "@vizij/utils";

function numericArrayToRaw(arr: number[]): RawValue {
  const normalised = arr.map((entry) => Number(entry ?? 0));
  switch (normalised.length) {
    case 2:
      return {
        x: normalised[0],
        y: normalised[1],
        r: normalised[0],
        g: normalised[1],
      } as unknown as RawValue;
    case 3:
      return {
        x: normalised[0],
        y: normalised[1],
        z: normalised[2],
        r: normalised[0],
        g: normalised[1],
        b: normalised[2],
      } as unknown as RawValue;
    case 4:
      return {
        x: normalised[0],
        y: normalised[1],
        z: normalised[2],
        w: normalised[3],
        r: normalised[0],
        g: normalised[1],
        b: normalised[2],
        a: normalised[3],
      } as unknown as RawValue;
    default:
      return normalised as unknown as RawValue;
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
    return value as RawValue;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => valueJSONToRaw(entry)) as unknown as RawValue;
  }

  if (typeof value === "object" && !("type" in value)) {
    const entries = Object.entries(value).map(([key, entry]) => [
      key,
      valueJSONToRaw(entry as ValueJSON),
    ]);
    return Object.fromEntries(entries) as unknown as RawValue;
  }

  if (!isNormalizedValue(value)) {
    return undefined;
  }

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
      const text = valueAsText(value);
      return typeof text === "string" ? (text as RawValue) : undefined;
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
      const transform = valueAsTransform(value);
      if (!transform) {
        return undefined;
      }
      return {
        translation: numericArrayToRaw(transform.translation),
        rotation: numericArrayToRaw(transform.rotation),
        scale: numericArrayToRaw(transform.scale),
      } as unknown as RawValue;
    }
    case "record": {
      const entries = Object.entries(value.data ?? {}).map(([key, entry]) => [
        key,
        valueJSONToRaw(entry),
      ]);
      return Object.fromEntries(entries) as unknown as RawValue;
    }
    case "enum": {
      const [tag, inner] = value.data;
      return {
        tag,
        value: valueJSONToRaw(inner),
      } as unknown as RawValue;
    }
    default:
      return undefined;
  }
}
