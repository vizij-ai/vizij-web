import type { SceneObjectNode } from "../../scene/sceneGraph";

export interface HierarchyFilterResult {
  visibleIds: Set<string> | null;
  matchingIds: Set<string>;
}

export function filterHierarchyNodes(
  rootIds: readonly string[],
  nodesById: Map<string, SceneObjectNode>,
  rawQuery: string,
): HierarchyFilterResult {
  const query = rawQuery.trim().toLowerCase();
  if (!query) {
    return {
      visibleIds: null,
      matchingIds: new Set(),
    };
  }

  const visibleIds = new Set<string>();
  const matchingIds = new Set<string>();

  const visit = (nodeId: string, ancestorMatched: boolean): boolean => {
    const node = nodesById.get(nodeId);
    if (!node) {
      return false;
    }
    const label = (node.name || node.id).toLowerCase();
    const nodeMatches = label.includes(query);
    if (nodeMatches) {
      matchingIds.add(nodeId);
    }

    let descendantMatch = false;
    node.childIds.forEach((childId) => {
      const childHasMatch = visit(childId, ancestorMatched || nodeMatches);
      if (childHasMatch) {
        descendantMatch = true;
      }
    });

    const shouldShow = nodeMatches || ancestorMatched || descendantMatch;
    if (shouldShow) {
      visibleIds.add(nodeId);
    }

    return nodeMatches || descendantMatch;
  };

  rootIds.forEach((rootId) => {
    visit(rootId, false);
  });

  return { visibleIds, matchingIds };
}
