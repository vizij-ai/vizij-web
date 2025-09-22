import { useMemo } from "react";
import { useGraphContext } from "./GraphContext";

/**
 * useGraphRuntime
 * Returns the Graph runtime API exposed by the provider.
 * This is a lightweight passthrough hook.
 */
export function useGraphRuntime() {
  return useGraphContext();
}
