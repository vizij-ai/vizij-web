import type { GraphSpec, NodeSpec } from "@vizij/node-graph-wasm";

export interface PoseGraphInputIdRemap {
  fromId: string;
  toId: string;
}

export function remapPoseGraphInputIds(
  spec: GraphSpec,
  remaps: PoseGraphInputIdRemap[],
): void {
  if (!spec || !Array.isArray(remaps) || remaps.length === 0) {
    return;
  }
  const map = new Map<string, string>();
  remaps.forEach(({ fromId, toId }) => {
    const trimmedFrom = fromId?.trim();
    const trimmedTo = toId?.trim();
    if (!trimmedFrom || !trimmedTo || trimmedFrom === trimmedTo) {
      return;
    }
    map.set(trimmedFrom, trimmedTo);
  });
  if (map.size === 0) {
    return;
  }

  const nodes = spec.nodes as NodeSpec[] | undefined;
  if (Array.isArray(nodes)) {
    nodes.forEach((node) => {
      if (node?.type !== "constant" || !node.params) {
        return;
      }
      const value = (node.params as { value?: unknown }).value;
      if (!value || typeof value !== "object") {
        return;
      }
      const recordContainer = (value as { record?: { values?: unknown } })
        .record;
      if (!recordContainer || typeof recordContainer !== "object") {
        return;
      }
      const values = (recordContainer as { values?: unknown }).values;
      if (!values || typeof values !== "object") {
        return;
      }
      const typedValues = values as {
        record?: Record<string, unknown>;
        entries?: Array<{ key: string; value?: unknown }>;
      };
      if (typedValues.record && typeof typedValues.record === "object") {
        const nextRecord: Record<string, unknown> = {};
        let changed = false;
        Object.entries(typedValues.record).forEach(([key, entry]) => {
          const nextKey = map.get(key) ?? key;
          if (nextKey !== key) {
            changed = true;
          }
          nextRecord[nextKey] = entry;
        });
        if (changed) {
          typedValues.record = nextRecord;
        }
      }
      if (Array.isArray(typedValues.entries)) {
        typedValues.entries.forEach((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            typeof entry.key !== "string"
          ) {
            return;
          }
          const nextKey = map.get(entry.key);
          if (nextKey) {
            entry.key = nextKey;
          }
        });
      }
    });
  }

  const edges = spec.edges;
  if (Array.isArray(edges)) {
    edges.forEach((edge) => {
      const selector = (edge as { selector?: unknown }).selector;
      if (!Array.isArray(selector)) {
        return;
      }
      selector.forEach((segment) => {
        if (!segment || typeof segment !== "object") {
          return;
        }
        const nextField = map.get((segment as { field?: string }).field ?? "");
        if (nextField) {
          (segment as { field?: string }).field = nextField;
        }
      });
    });
  }
}
