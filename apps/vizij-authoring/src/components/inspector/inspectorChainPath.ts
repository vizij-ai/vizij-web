export type InspectorChainMode = "scene" | "rig" | "pose";

export type InspectorChainNode = {
  mode: InspectorChainMode;
  id: string;
  label: string;
  view?: "quick" | "features" | "bindings";
  targetId?: string;
};

export function appendOrRevisitInspectorChainPath(
  current: InspectorChainNode[],
  nextNode: InspectorChainNode,
): InspectorChainNode[] {
  if (current.length === 0) {
    return [nextNode];
  }
  const existingIndex = current.findIndex(
    (entry) => entry.mode === nextNode.mode && entry.id === nextNode.id,
  );
  if (existingIndex >= 0) {
    const next = current.slice(0, existingIndex + 1);
    next[existingIndex] = nextNode;
    return next;
  }
  return [...current, nextNode];
}
