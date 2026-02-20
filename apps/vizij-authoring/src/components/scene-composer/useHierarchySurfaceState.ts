import { useCallback, useEffect, useMemo, useState } from "react";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { filterHierarchyNodes } from "./hierarchyFilters";
import {
  useHierarchyTreeState,
  type HierarchyTreeState,
} from "./useHierarchyTreeState";

interface HierarchySurfaceStateOptions {
  namespace: string;
  objects: SceneObjectNode[];
  rootIds: readonly string[];
  selectedId: string | null;
  getBreadcrumb: (nodeId: string) => SceneObjectNode[];
}

export interface HierarchySurfaceState extends HierarchyTreeState {
  search: string;
  setSearch: (query: string) => void;
  nodesById: Map<string, SceneObjectNode>;
  rootNodes: SceneObjectNode[];
  visibleIds: Set<string> | null;
  matchingIds: Set<string>;
  hasVisibleNodes: boolean;
  isNodeVisible: (nodeId: string) => boolean;
}

export function computeBlockedHierarchyParentIds(
  nodesById: ReadonlyMap<string, SceneObjectNode>,
  selectedNode: SceneObjectNode | null | undefined,
): Set<string> {
  if (!selectedNode) {
    return new Set<string>();
  }

  const blocked = new Set<string>([selectedNode.id]);
  const pending = [...selectedNode.childIds];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || blocked.has(current)) continue;
    blocked.add(current);
    const child = nodesById.get(current);
    if (child) {
      pending.push(...child.childIds);
    }
  }

  return blocked;
}

export function useHierarchySurfaceState({
  namespace,
  objects,
  rootIds,
  selectedId,
  getBreadcrumb,
}: HierarchySurfaceStateOptions): HierarchySurfaceState {
  const [search, setSearch] = useState("");

  const nodesById = useMemo(
    () => new Map(objects.map((node) => [node.id, node])),
    [objects],
  );
  const nodeIds = useMemo(() => objects.map((node) => node.id), [objects]);
  const { isExpanded, toggleNode, setExpanded } = useHierarchyTreeState(
    namespace,
    nodeIds,
  );

  const { visibleIds, matchingIds } = useMemo(
    () => filterHierarchyNodes(rootIds, nodesById, search),
    [rootIds, nodesById, search],
  );

  const isNodeVisible = useCallback(
    (nodeId: string) => !visibleIds || visibleIds.has(nodeId),
    [visibleIds],
  );

  useEffect(() => {
    if (!selectedId) return;
    const crumbs = getBreadcrumb(selectedId);
    crumbs.forEach((node) => {
      setExpanded(node.id, true);
    });
  }, [getBreadcrumb, selectedId, setExpanded]);

  useEffect(() => {
    if (!search.trim()) return;
    matchingIds.forEach((nodeId) => {
      const crumbs = getBreadcrumb(nodeId);
      crumbs.slice(0, -1).forEach((crumb) => {
        setExpanded(crumb.id, true);
      });
    });
  }, [getBreadcrumb, matchingIds, search, setExpanded]);

  const rootNodes = useMemo(
    () =>
      rootIds
        .map((id) => nodesById.get(id))
        .filter((node): node is SceneObjectNode => Boolean(node)),
    [nodesById, rootIds],
  );

  const hasVisibleNodes = visibleIds
    ? visibleIds.size > 0
    : rootNodes.length > 0;

  return {
    search,
    setSearch,
    nodesById,
    rootNodes,
    visibleIds,
    matchingIds,
    hasVisibleNodes,
    isNodeVisible,
    isExpanded,
    toggleNode,
    setExpanded,
  };
}
