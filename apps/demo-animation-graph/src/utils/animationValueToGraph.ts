import { type Value } from "@vizij/animation-react";
import { toValueJSON } from "@vizij/value-json";
import type { ValueJSON } from "@vizij/node-graph-wasm";

export function animationValueToValueJSON(
  value?: Value,
): ValueJSON | undefined {
  if (!value) return undefined;
  return toValueJSON(value);
}
