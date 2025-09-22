import React, { useCallback } from "react";
import { GraphProvider } from "./GraphProvider";
import { useGraphContext } from "./GraphContext";
import { useGraphOutputs } from "./useGraphOutputs";
import { valueAsNumber } from "./valueHelpers";

/**
 * Compatibility layer exporting legacy names to ease migration.
 *
 * These shims are intentionally small and delegate to the new runtime/store
 * surface. They provide the minimal surface required by existing tests and
 * consumers. They are not full feature parity but can be extended as needed.
 */

/** Alias provider to old name (accepts legacy `autostart` prop) */
export const NodeGraphProvider: React.FC<any> = ({
  autostart,
  autoStart,
  spec,
  children,
  ...rest
}) => {
  const actualAutoStart = autostart ?? autoStart ?? false;
  return (
    <GraphProvider spec={spec} autoStart={actualAutoStart} {...rest}>
      {children}
    </GraphProvider>
  );
};

/** Legacy-style hook that returns a runtime-like object */
export function useNodeGraph() {
  const rt: any = useGraphContext();

  if (!rt) {
    throw new Error("useNodeGraph must be used within a <NodeGraphProvider />");
  }

  const subscribeToNode = useCallback(
    (nodeId: string, cb: () => void) => {
      // Simple subscription: re-run cb on any snapshot change.
      // This is coarse-grained but sufficient for most legacy usages and tests.
      return rt.subscribe(() => cb());
    },
    [rt],
  );

  const subscribeToWrites = useCallback(
    (cb: () => void) => {
      return rt.subscribe(() => cb());
    },
    [rt],
  );

  const getNodeOutputSnapshot = (nodeId?: string, key?: string) => {
    const snap = rt.getSnapshot?.();
    const nodes = snap?.evalResult?.nodes;
    if (!nodeId || !nodes) return undefined;
    // Support both shapes:
    // 1) { nodes: { [id]: { outputs: { key: PortSnapshot } } } } (new)
    // 2) { nodes: { [id]: { key: PortSnapshot } } } (legacy/mock)
    const byNode = nodes[nodeId];
    if (!byNode) return undefined;
    const outputs = byNode.outputs ?? byNode;
    if (!outputs) return undefined;
    if (!key) return outputs?.out ?? Object.values(outputs)[0];
    return outputs[key];
  };

  const getNodeOutput = (nodeId?: string) => {
    const snap = rt.getSnapshot?.();
    const nodes = snap?.evalResult?.nodes;
    if (!nodeId || !nodes) return undefined;
    const byNode = nodes[nodeId];
    if (!byNode) return undefined;
    return byNode.outputs ?? byNode;
  };

  return {
    ready: rt.ready,
    setParam: rt.setParam,
    reload: rt.loadGraph,
    stageInput: rt.stageInput,
    setTime: rt.setTime,
    subscribeToNode,
    getNodeOutputSnapshot,
    getNodeOutput,
    subscribeToWrites,
    getWrites: rt.getWrites,
    clearWrites: rt.clearWrites,
    getLastDt: () => undefined,
  } as const;
}

/** Legacy hook to access recent writes (array) */
const EMPTY_WRITES: readonly any[] = [];
export function useGraphWrites() {
  return useGraphOutputs((snap) => snap?.evalResult?.writes ?? EMPTY_WRITES);
}

/** Re-export value helpers for legacy consumers/tests */
export { valueAsNumber };
