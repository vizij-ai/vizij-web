import { useMemo } from "react";
import useGraphStore from "../state/useGraphStore";
import { useNodeGraph } from "@vizij/node-graph-react";

/**
 * Returns the connected source value for a given node's target handle.
 * Example: useConnectedValue(targetNodeId, "a", "out")
 *
 * - Finds the edge whose target == targetNodeId and targetHandle == handleId
 * - Looks up the source node's output map in the graph runtime
 * - Returns outputs[sourceId]?.[outputKey]
 */
import type { ValueJSON } from "@vizij/node-graph-wasm";

export function useConnectedValue(
  targetNodeId: string,
  handleId: string,
  outputKey: string = "out"
): ValueJSON | undefined {
  const { edges } = useGraphStore();
  const { outputs } = useNodeGraph();

  const val = useMemo(() => {
    const edge = edges.find(
      (e) => e.target === targetNodeId && (e.targetHandle ?? "out") === handleId
    );
    if (!edge) return undefined;
    const srcOutputs = outputs?.[edge.source] as Record<string, ValueJSON> | undefined;
    return srcOutputs ? srcOutputs[outputKey] : undefined;
  }, [edges, outputs, targetNodeId, handleId, outputKey]);

  return val;
}

/**
 * Get all connected values for a list of handles on a target node.
 * Returns a map from handleId to the connected value (if any).
 */
export function useConnectedValues(
  targetNodeId: string,
  handleIds: string[],
  outputKey: string = "out"
): Record<string, ValueJSON | undefined> {
  const { edges } = useGraphStore();
  const { outputs } = useNodeGraph();

  const map = useMemo(() => {
    const result: Record<string, ValueJSON | undefined> = {};
    for (const h of handleIds) {
      const edge = edges.find(
        (e) => e.target === targetNodeId && (e.targetHandle ?? "out") === h
      );
      if (!edge) continue;
      const srcOutputs = outputs?.[edge.source] as Record<string, ValueJSON> | undefined;
      if (srcOutputs) {
        result[h] = srcOutputs[outputKey];
      }
    }
    return result;
  }, [edges, outputs, targetNodeId, handleIds, outputKey]);

  return map;
}
