import type { ValueJSON } from "./types";

/**
 * Attempt to coerce a loosely structured value into a number.
 * Supports plain numbers as well as tagged `{ data: number }` payloads.
 */
export function valueAsNumber(
  value: ValueJSON | undefined,
): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (value && typeof value === "object") {
    const candidate = (value as { data?: unknown; value?: unknown }).data;
    if (typeof candidate === "number") {
      return candidate;
    }
    const alt = (value as { value?: unknown }).value;
    if (typeof alt === "number") {
      return alt;
    }
  }
  return undefined;
}

/**
 * Extract a Vec3-like tuple (length 3 numeric array) if present.
 */
export function valueAsVec3(
  value: ValueJSON | undefined,
): [number, number, number] | undefined {
  const asArray = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? (value as { data?: unknown }).data
      : undefined;

  if (
    Array.isArray(asArray) &&
    asArray.length === 3 &&
    asArray.every((item) => typeof item === "number")
  ) {
    return asArray as [number, number, number];
  }
  return undefined;
}

/**
 * Extract a boolean flag from a loosely structured value object.
 */
export function valueAsBool(value: ValueJSON | undefined): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object") {
    const candidate = (value as { data?: unknown; value?: unknown }).data;
    if (typeof candidate === "boolean") {
      return candidate;
    }
    const alt = (value as { value?: unknown }).value;
    if (typeof alt === "boolean") {
      return alt;
    }
  }
  return undefined;
}
