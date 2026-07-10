import type { Value } from "@vizij/animation-react";
import {
  fromAroraValueJSON,
  isNormalizedValue,
  valueAsBool,
  valueAsNumber,
  valueAsNumericArray,
  valueAsText,
  valueAsTransform,
  valueAsVector,
  type NormalizedValue,
} from "@vizij/value-json";

const DASH = "—";

export function formatNumericArray(
  data: readonly number[] | number[] | undefined,
): string {
  if (!data || data.length === 0) return DASH;
  return data
    .map((entry) =>
      Number.isFinite(entry) ? Number(entry).toFixed(3) : String(entry),
    )
    .join(", ");
}

function formatValueInternal(value: Value | undefined): string {
  if (!value) return DASH;

  // Handle structural types that need recursive formatting first — arora
  // serde forms decode into the same {type,data} shape (enum tags display as
  // their variant id; names are hashed one-way on the Rust side).
  const nv: NormalizedValue | undefined = isNormalizedValue(value as never)
    ? (value as unknown as NormalizedValue)
    : fromAroraValueJSON(value as never);
  if (nv) {
    switch (nv.type) {
      case "enum": {
        const [enumTag, inner] = nv.data;
        const innerDisplay = inner ? formatValueInternal(inner as Value) : DASH;
        return `${enumTag}${innerDisplay !== DASH ? `: ${innerDisplay}` : ""}`;
      }
      case "record": {
        const record = nv.data;
        return JSON.stringify(
          Object.fromEntries(
            Object.entries(record).map(([key, entry]) => [
              key,
              formatValueInternal(entry as Value),
            ]),
          ),
        );
      }
      case "array":
      case "list":
      case "tuple": {
        const items = nv.data as readonly Value[];
        return `[${items.map((entry) => formatValueInternal(entry)).join(", ")}]`;
      }
      default:
        break;
    }
  }

  const transform = valueAsTransform(value);
  if (transform) {
    return [
      `translation: ${formatNumericArray(transform.translation)}`,
      `rotation: ${formatNumericArray(transform.rotation)}`,
      `scale: ${formatNumericArray(transform.scale)}`,
    ].join("\n");
  }

  const vec = valueAsVector(value);
  if (vec && vec.length > 0) {
    return formatNumericArray(vec.map((n) => Number(n)));
  }

  const text = valueAsText(value);
  if (typeof text === "string") {
    return text;
  }

  const num = valueAsNumber(value);
  if (typeof num === "number" && Number.isFinite(num)) {
    return num.toFixed(3);
  }

  const boolVal = valueAsBool(value);
  if (typeof boolVal === "boolean") {
    return boolVal ? "true" : "false";
  }

  const numericArray = valueAsNumericArray(value);
  if (numericArray && numericArray.length > 0) {
    return formatNumericArray(numericArray);
  }

  return JSON.stringify((value as any)?.data ?? value ?? null);
}

export function formatValue(value: Value | undefined): string {
  return formatValueInternal(value);
}

export function valueToSeries(value: Value | undefined): number[] | null {
  if (!value) return null;

  const nv: NormalizedValue | undefined = isNormalizedValue(value as never)
    ? (value as unknown as NormalizedValue)
    : fromAroraValueJSON(value as never);
  if (nv) {
    switch (nv.type) {
      case "enum": {
        const [, inner] = nv.data;
        return valueToSeries(inner as Value);
      }
      case "record": {
        for (const entry of Object.values(nv.data)) {
          const series = valueToSeries(entry as Value);
          if (series && series.length > 0) {
            return series;
          }
        }
        return null;
      }
      default:
        break;
    }
  }

  const vector = valueAsVector(value);
  if (vector && vector.length > 0) {
    return vector.map((entry) =>
      Number.isFinite(Number(entry)) ? Number(entry) : 0,
    );
  }

  const numericArray = valueAsNumericArray(value);
  if (numericArray && numericArray.length > 0) {
    return numericArray.map((entry) =>
      Number.isFinite(entry) ? Number(entry) : 0,
    );
  }

  const num = valueAsNumber(value);
  if (typeof num === "number" && Number.isFinite(num)) {
    return [num];
  }

  const boolVal = valueAsBool(value);
  if (typeof boolVal === "boolean") {
    return [boolVal ? 1 : 0];
  }

  return null;
}
