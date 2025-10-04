import {
  valueAsNumber as sharedValueAsNumber,
  valueAsVec3 as sharedValueAsVec3,
  valueAsBool as sharedValueAsBool,
} from "@vizij/value-json";
import type { ValueJSON } from "./types";

export function valueAsNumber(
  value: ValueJSON | undefined,
): number | undefined {
  return sharedValueAsNumber(value);
}

export function valueAsVec3(
  value: ValueJSON | undefined,
): [number, number, number] | undefined {
  return sharedValueAsVec3(value);
}

export function valueAsBool(value: ValueJSON | undefined): boolean | undefined {
  return sharedValueAsBool(value);
}
