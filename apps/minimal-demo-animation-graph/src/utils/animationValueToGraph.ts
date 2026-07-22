import {
  toValueJSON,
  type ValueJSON as DeviceValueJSON,
} from "@vizij/value-json";
import type { ValueJSON } from "@vizij/node-graph-wasm";

/**
 * Re-key a value the animation device wrote to the store (Vizij `ValueJSON`)
 * into the node-graph's `ValueJSON` for `stageInput`. The two vocabularies are
 * structurally the same; `toValueJSON` normalizes the shape.
 */
export function animationValueToValueJSON(
  value?: DeviceValueJSON | null,
): ValueJSON | undefined {
  if (value === undefined || value === null) return undefined;
  return toValueJSON(value) as ValueJSON;
}
