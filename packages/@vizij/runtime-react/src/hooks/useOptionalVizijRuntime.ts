import { useContext } from "react";
import { VizijRuntimeContext } from "../context";
import type { VizijRuntimeContextValue } from "../types";

export function useOptionalVizijRuntime(): VizijRuntimeContextValue | null {
  return useContext(VizijRuntimeContext);
}
