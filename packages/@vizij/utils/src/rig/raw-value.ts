import type { RawValue } from "../animated-values";
import { cloneDeepSafe } from "../cloneDeepSafe";

export function cloneRawValue<T extends RawValue>(value: T): T {
  return cloneDeepSafe(value);
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
