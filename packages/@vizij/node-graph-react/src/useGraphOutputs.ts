import { useSyncExternalStore, useRef } from "react";
import { useGraphContext } from "./GraphContext";

/**
 * useGraphOutputs
 * Subscribe to provider snapshot and derive selected data via selector.
 *
 * selector: (snapshot) => TSelected
 * equalityFn: optional equality check (a,b) => boolean to avoid updates when values are deeply equal
 *
 * Implementation uses useSyncExternalStore where the snapshot getter applies the selector.
 * We memoize the last selected value and compare with equalityFn to avoid allocating new values
 * and to reduce re-renders.
 */
export function useGraphOutputs<TSelected>(
  selector: (snapshot: any) => TSelected,
  equalityFn?: (a: TSelected, b: TSelected) => boolean,
): TSelected {
  const runtime = useGraphContext();
  if (!runtime) {
    throw new Error("useGraphOutputs must be used within a <GraphProvider />");
  }

  const subscribe = (cb: () => void) => runtime.subscribe(cb);

  // Keep a ref to the last selected value for equality comparisons in the snapshot getter
  const lastRef = useRef<{ value?: TSelected }>({ value: undefined });

  const getSelectedSnapshot = () => {
    const snap = runtime.getSnapshot?.() ?? { evalResult: null, version: 0 };
    const next = selector(snap);
    const prev = lastRef.current.value;
    const eq = equalityFn
      ? equalityFn(prev as TSelected, next as TSelected)
      : prev === next;
    if (!eq) {
      lastRef.current.value = next;
    }
    return lastRef.current.value as TSelected;
  };

  const selected = useSyncExternalStore(
    subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot,
  );
  return selected;
}

/**
 * useNodeOutputs
 * Convenience hook to get all outputs for a node by id.
 * Returns the node.outputs snapshot or null if not available.
 */
export function useNodeOutputs(nodeId: string) {
  return useGraphOutputs((snap) => {
    const evalResult = snap?.evalResult;
    // Support both shapes:
    // - { nodes: { [nodeId]: { outputs: { ... } } } } (legacy)
    // - { nodes: { [nodeId]: { ...ports } } } (canonical)
    const byNode = evalResult?.nodes?.[nodeId];
    if (!byNode) return null;
    return (byNode as any)?.outputs ?? byNode;
  });
}

/**
 * useNodeOutput
 * Convenience hook to select a specific output key for a node.
 * Returns the value (ValueJSON) or null if not available.
 */
export function useNodeOutput(nodeId: string, key?: string) {
  return useGraphOutputs((snap) => {
    const evalResult = snap?.evalResult;
    // Support both shapes (see above)
    const byNode = evalResult?.nodes?.[nodeId];
    if (!byNode) return null;
    const outputs = (byNode as any)?.outputs ?? byNode;
    if (outputs == null) return null;
    if (key == null) return outputs;
    return outputs?.[key] ?? null;
  });
}
