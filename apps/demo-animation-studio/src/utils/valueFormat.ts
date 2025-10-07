import type { Value } from "@vizij/animation-react";
import {
  isNormalizedValue,
  valueAsBool,
  valueAsNumber,
  valueAsNumericArray,
  valueAsText,
  valueAsTransform,
  valueAsVector,
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

  // Handle structural types that need recursive formatting first.
  if (isNormalizedValue(value)) {
    const tag = value.type.toLowerCase();

    if (tag === "enum") {
      const [enumTag, inner] = value.data;
      const innerDisplay = inner ? formatValueInternal(inner as Value) : DASH;
      return `${enumTag}${innerDisplay !== DASH ? `: ${innerDisplay}` : ""}`;
    }

    if (tag === "record") {
      const record = value.data;
      return JSON.stringify(
        Object.fromEntries(
          Object.entries(record).map(([key, entry]) => [
            key,
            formatValueInternal(entry as Value),
          ]),
        ),
      );
    }

    if (tag === "array" || tag === "list" || tag === "tuple") {
      const items = value.data as Value[];
      return `[${items.map((entry) => formatValueInternal(entry)).join(", ")}]`;
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

  if (isNormalizedValue(value)) {
    const tag = value.type.toLowerCase();
    if (tag === "enum") {
      return valueToSeries(value.data[1] as Value);
    }
    if (tag === "record") {
      for (const entry of Object.values(value.data)) {
        const series = valueToSeries(entry as Value);
        if (series && series.length > 0) return series;
      }
      return null;
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
