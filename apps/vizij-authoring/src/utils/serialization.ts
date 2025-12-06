import { cloneDeepSafe } from "@vizij/utils";

/**
 * Clones data safely, preserving types like Map/Set/TypedArray.
 * Replaces the legacy JSON.parse(JSON.stringify(...)) pattern.
 */
export function cloneSerializable<T>(value: T): T {
  return cloneDeepSafe(value);
}
