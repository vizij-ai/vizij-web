import type { RawValue } from "../animated-values";

export function cloneRawValue<T extends RawValue>(value: T): T {
  if (value && typeof value === "object") {
    return JSON.parse(JSON.stringify(value)) as T;
  }
  return value;
}

export function rawValuesEqual(
  a: RawValue | undefined,
  b: RawValue | undefined,
): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
