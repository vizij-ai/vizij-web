import { useMemo } from "react";
import useGraphStore from "../state/useGraphStore";
import { useNodeOutput } from "@vizij/node-graph-react";
import type { ValueJSON } from "@vizij/node-graph-wasm";

/**
 * Resolve the connected source (nodeId, portKey) for a given target node/handle,
 * then subscribe to that specific port using useNodeOutput.
 *
 * - If no edge is connected to the target handle, returns undefined.
 * - If the source handle is unspecified, defaults to "out".
 *
 * This avoids depending on node.data.inputs and instead uses the actual graph edges.
 */
export function useConnectedValue(
  targetNodeId: string | undefined,
  targetHandle: string,
  defaultPortKey: string = "out"
): ValueJSON | undefined {
  const edges = useGraphStore((s) => s.edges);

  const { sourceNodeId, sourcePortKey } = useMemo(() => {
    if (!targetNodeId) {
      return { sourceNodeId: undefined, sourcePortKey: defaultPortKey };
    }
    const edge = edges.find(
      (e) => e.target === targetNodeId && e.targetHandle === targetHandle
    );
    if (!edge) {
      return { sourceNodeId: undefined, sourcePortKey: defaultPortKey };
    }
    return {
      sourceNodeId: edge.source,
      sourcePortKey: edge.sourceHandle ?? defaultPortKey,
    };
  }, [edges, targetNodeId, targetHandle, defaultPortKey]);

  // Safe to call with undefined; hook will no-op subscribe and return undefined
  return useNodeOutput(sourceNodeId, sourcePortKey);
}
