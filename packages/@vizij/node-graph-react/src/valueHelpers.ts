/**
 * Value helpers ported from the legacy index.tsx.
 * Provides convenient readers for ValueJSON/PortSnapshot shapes.
 *
 * Only a small subset is exported (valueAsNumber) but we include related helpers
 * for completeness and future use.
 */

import type { PortSnapshot } from "@vizij/node-graph-wasm";
import {
  valueAsNumber as sharedValueAsNumber,
  valueAsVec3 as sharedValueAsVec3,
  valueAsVector as sharedValueAsVector,
  valueAsBool as sharedValueAsBool,
  type ValueJSON,
} from "@vizij/value-json";

function extractValueJSON(
  v?: PortSnapshot | ValueJSON | null,
): ValueJSON | undefined {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && "value" in v && "shape" in v) {
    return (v as PortSnapshot).value;
  }
  if (typeof v === "object" && v !== null) {
    return v as ValueJSON;
  }
  return undefined;
}

export function valueAsNumber(
  v?: PortSnapshot | ValueJSON | null,
): number | undefined {
  const val = extractValueJSON(v);
  return sharedValueAsNumber(val);
}

export function valueAsVec3(
  v?: PortSnapshot | ValueJSON | null,
): [number, number, number] | undefined {
  const val = extractValueJSON(v);
  return sharedValueAsVec3(val);
}

export function valueAsVector(
  v?: PortSnapshot | ValueJSON | null,
): number[] | undefined {
  const val = extractValueJSON(v);
  return sharedValueAsVector(val);
}

export function valueAsBool(
  v?: PortSnapshot | ValueJSON | null,
): boolean | undefined {
  const val = extractValueJSON(v);
  return sharedValueAsBool(val);
}
