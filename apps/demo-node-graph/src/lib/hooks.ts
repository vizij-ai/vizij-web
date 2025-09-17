import { useMemo } from "react";
import useGraphStore from "../state/useGraphStore";
import { useNodeGraph } from "@vizij/node-graph-react";
import type { PortSnapshot } from "@vizij/node-graph-wasm";

/**
 * Returns the connected source value for a given node's target handle.
 * Example: useConnectedValue(targetNodeId, "a", "out")
 */

export function useConnectedValue(
  targetNodeId: string,
  handleId: string,
  outputKey: string = "out",
): PortSnapshot | undefined {
  const { edges } = useGraphStore();
  const { getNodeOutputSnapshot } = useNodeGraph();

  const val = useMemo(() => {
    const edge = edges.find(
      (e) =>
        e.target === targetNodeId && (e.targetHandle ?? "out") === handleId,
    );
    if (!edge) return undefined;
    return getNodeOutputSnapshot(edge.source, outputKey);
  }, [edges, getNodeOutputSnapshot, targetNodeId, handleId, outputKey]);

  return val;
}

/**
 * Get all connected values for a list of handles on a target node.
 * Returns a map from handleId to the connected value (if any).
 */
export function useConnectedValues(
  targetNodeId: string,
  handleIds: string[],
  outputKey: string = "out",
): Record<string, PortSnapshot | undefined> {
  const { edges } = useGraphStore();
  const { getNodeOutputSnapshot } = useNodeGraph();

  const map = useMemo(() => {
    const result: Record<string, PortSnapshot | undefined> = {};
    for (const h of handleIds) {
      const edge = edges.find(
        (e) => e.target === targetNodeId && (e.targetHandle ?? "out") === h,
      );
      if (!edge) continue;
      result[h] = getNodeOutputSnapshot(edge.source, outputKey);
    }
    return result;
  }, [edges, getNodeOutputSnapshot, targetNodeId, handleIds, outputKey]);

  return map;
}
