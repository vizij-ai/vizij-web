import {
  valueAsNumber as normalizedValueAsNumber,
  valueAsNumericArray as normalizedValueAsNumericArray,
  valueAsTransform as normalizedValueAsTransform,
  type NormalizedTransform,
} from "@vizij/value-json";
import type { Value } from "./types";

export function valueAsNumber(v: Value | undefined): number | undefined {
  return normalizedValueAsNumber(v);
}

export function valueAsNumericArray(
  v: Value | undefined,
  fallback = 0,
): number[] | undefined {
  return normalizedValueAsNumericArray(v, fallback);
}

export function valueAsTransform(
  v: Value | undefined,
): NormalizedTransform | undefined {
  return normalizedValueAsTransform(v);
}
