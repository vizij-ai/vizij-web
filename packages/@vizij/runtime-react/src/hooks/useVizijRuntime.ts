import { useContext } from "react";
import { VizijRuntimeContext } from "../context";
import type { VizijRuntimeContextValue } from "../types";

export function useVizijRuntime(): VizijRuntimeContextValue {
  const ctx = useContext(VizijRuntimeContext);
  if (!ctx) {
    throw new Error(
      "useVizijRuntime must be used within a VizijRuntimeProvider.",
    );
  }
  return ctx;
}
