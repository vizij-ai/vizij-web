import { useCallback } from "react";
import {
  useVizijStore,
  type VizijData,
  type VizijActions,
} from "@vizij/render";
import { getLookup } from "@vizij/utils";
import type { RawValue } from "@vizij/utils";
import type { ValueJSON } from "@vizij/value-json";
import type { ShapeJSON } from "../types";
import { useVizijRuntime } from "./useVizijRuntime";

export function useRigInput(
  path: string,
): [RawValue | undefined, (value: ValueJSON, shape?: ShapeJSON) => void] {
  const { namespace, setInput } = useVizijRuntime();
  const value = useVizijStore((state: VizijData & VizijActions) => {
    return state.values.get(getLookup(namespace, path)) as RawValue | undefined;
  });

  const setter = useCallback(
    (next: ValueJSON, shape?: ShapeJSON) => {
      setInput(path, next, shape);
    },
    [path, setInput],
  );

  return [value, setter];
}
