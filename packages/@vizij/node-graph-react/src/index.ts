export { GraphProvider } from "./GraphProvider";
export { useGraphRuntime } from "./useGraphRuntime";
export {
  useGraphOutputs,
  useNodeOutput,
  useNodeOutputs,
} from "./useGraphOutputs";
export { useGraphInput } from "./useGraphInput";
export { useGraphInstance } from "./useGraphInstance";
export { useGraphPlayback } from "./useGraphPlayback";
export { GraphContext, useGraphContext } from "./GraphContext";
export type { GraphRuntimeContextValue } from "./types";

// Compatibility exports for legacy API
export { NodeGraphProvider, useNodeGraph, useGraphWrites } from "./compat";

// Re-export value helpers (functions only) and WASM package surface for convenience
export {
  valueAsNumber,
  valueAsVec3,
  valueAsVector,
  valueAsBool,
} from "./valueHelpers";
export * from "@vizij/node-graph-wasm";
