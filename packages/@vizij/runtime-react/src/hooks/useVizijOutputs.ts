import {
  useVizijStore,
  type VizijData,
  type VizijActions,
} from "@vizij/render";
import { getLookup } from "@vizij/utils";
import type { RawValue } from "@vizij/utils";
import { useVizijRuntime } from "./useVizijRuntime";

export function useVizijOutputs(
  paths: string[],
): Record<string, RawValue | undefined> {
  const { namespace } = useVizijRuntime();
  return useVizijStore((state: VizijData & VizijActions) => {
    const result: Record<string, RawValue | undefined> = {};
    paths.forEach((path) => {
      const lookup = getLookup(namespace, path);
      result[path] = state.values.get(lookup);
    });
    return result;
  });
}
