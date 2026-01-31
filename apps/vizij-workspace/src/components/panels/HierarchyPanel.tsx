import { useMemo, useState, useEffect, useCallback } from "react";
import type { JSX } from "react/jsx-runtime";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSelectionStore } from "../../state/RigControllerProvider";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { Panel, Button, Switch } from "../ui";
// Adjust imports to point to scene-composer utilities
import { useHierarchyTreeState } from "../scene-composer/useHierarchyTreeState";
import { filterHierarchyNodes } from "../scene-composer/hierarchyFilters";

interface HierarchyPanelProps {
    allowEditActions?: boolean;
    showSelectionGlow: boolean;
    onToggleSelectionGlow: (enabled: boolean) => void;
}

export function HierarchyPanel({
    allowEditActions = true,
    showSelectionGlow,
    onToggleSelectionGlow,
}: HierarchyPanelProps) {
    const {
        objects,
        rootIds,
        getChildren,
        selectObject,
        getBreadcrumb,
        duplicateNode,
        deleteNode,
        reparentNode,
    } = useSceneComposer();
    const selectionStack = useSelectionStore((state) => state.selectionStack);
    const selectedId = selectionStack[0]?.id ?? null;

    const [search, setSearch] = useState("");

    const nodesById = useMemo(
        () => new Map(objects.map((node) => [node.id, node])),
        [objects],
    );
    const nodeIds = useMemo(() => objects.map((node) => node.id), [objects]);

    // Namespace needs to be consistent, using constant for now
    const { isExpanded, toggleNode, setExpanded } = useHierarchyTreeState(
        DEFAULT_NAMESPACE,
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

    const selectedNode = selectedId ? (nodesById.get(selectedId) ?? null) : null;
    const [reparentTarget, setReparentTarget] = useState<string>(
        selectedNode?.parentId ?? "",
    );

    useEffect(() => {
        setReparentTarget(selectedNode?.parentId ?? "");
    }, [selectedNode?.parentId]);

    const rootNodes = useMemo(
        () =>
            rootIds
                .map((id) => nodesById.get(id))
                .filter((node): node is SceneObjectNode => Boolean(node)),
        [nodesById, rootIds],
    );

    const blockedForParent = useMemo(() => {
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
    }, [nodesById, selectedNode]);

    const parentOptions = useMemo(
        () => objects.filter((node) => !blockedForParent.has(node.id)),
        [blockedForParent, objects],
    );

    useEffect(() => {
        if (!selectedId) {
            return;
        }
        const crumbs = getBreadcrumb(selectedId);
        crumbs.forEach((node) => {
            setExpanded(node.id, true);
        });
    }, [getBreadcrumb, selectedId, setExpanded]);

    useEffect(() => {
        if (!search.trim()) {
            return;
        }
        matchingIds.forEach((nodeId) => {
            const crumbs = getBreadcrumb(nodeId);
            crumbs.slice(0, -1).forEach((crumb) => {
                setExpanded(crumb.id, true);
            });
        });
    }, [getBreadcrumb, matchingIds, search, setExpanded]);

    const handleDuplicateSelection = useCallback(() => {
        if (!selectedId) return;
        const newId = duplicateNode(selectedId, {
            includeChildren: true,
            parentId: selectedNode?.parentId ?? null,
        });
        if (newId) {
            selectObject(newId);
        }
    }, [duplicateNode, selectObject, selectedId, selectedNode?.parentId]);

    const handleDeleteSelection = useCallback(() => {
        if (!selectedId) return;
        deleteNode(selectedId, { includeChildren: true });
    }, [deleteNode, selectedId]);

    const handleReparentSelection = useCallback(() => {
        if (!selectedId) return;
        const target = reparentTarget === "" ? null : reparentTarget;
        if (target === selectedNode?.parentId) {
            return;
        }
        reparentNode(selectedId, target);
    }, [reparentNode, reparentTarget, selectedId, selectedNode?.parentId]);

    const hasVisibleNodes = visibleIds
        ? visibleIds.size > 0
        : rootNodes.length > 0;

    const renderSubtree = useCallback(
        (node: SceneObjectNode, depth: number): JSX.Element | null => {
            if (!isNodeVisible(node.id) && !node.childIds.some(isNodeVisible)) {
                return null;
            }

            const childNodes = getChildren(node.id).filter((child) =>
                isNodeVisible(child.id),
            );
            const hasChildren = childNodes.length > 0;
            const expanded = isExpanded(node.id);
            const isSelected = selectedId === node.id;
            const matchesQuery = search.trim().length > 0 && matchingIds.has(node.id);

            return (
                <div key={node.id} className="hierarchy-tree__item">
                    <div
                        className="hierarchy-tree__row"
                        data-selected={isSelected ? "true" : undefined}
                        style={{ paddingLeft: `${depth * 0.9}rem` }}
                    >
                        <button
                            type="button"
                            className="hierarchy-tree__toggle"
                            aria-label={expanded ? "Collapse children" : "Expand children"}
                            disabled={!hasChildren}
                            onClick={() => toggleNode(node.id)}
                        >
                            {expanded ? "▾" : "▸"}
                        </button>
                        <button
                            type="button"
                            className="hierarchy-tree__label hierarchy-tree__label--dense"
                            onClick={() => selectObject(node.id)}
                        >
                            <span
                                className="hierarchy-tree__name"
                                data-match={matchesQuery ? "true" : undefined}
                            >
                                {node.name || node.id}
                            </span>
                            <span className="hierarchy-tree__meta-group">
                                <span className="hierarchy-tree__meta">{node.type}</span>
                                <span className="hierarchy-tree__count">
                                    {node.features.length}
                                </span>
                            </span>
                        </button>
                    </div>
                    {hasChildren && expanded && (
                        <div className="hierarchy-tree__children">
                            {childNodes.map((child) => renderSubtree(child, depth + 1))}
                        </div>
                    )}
                </div>
            );
        },
        [
            getChildren,
            isNodeVisible,
            matchingIds,
            search,
            selectObject,
            selectedId,
            toggleNode,
            isExpanded,
        ],
    );

    return (
        <Panel
            className="scene-hierarchy"
            title="Scene Hierarchy"
            description="Select objects via the tree or viewport to drive the inspector."
            badge={`${objects.length} ${objects.length === 1 ? "object" : "objects"}`}
        >
            <div className="scene-hierarchy__toolbar">
                <input
                    type="search"
                    className="scene-hierarchy__search"
                    placeholder="Search objects"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                />
                <div className="flex items-center gap-2 ml-2">
                    <label className="text-xs text-slate-400 whitespace-nowrap">Highlights</label>
                    <Switch
                        checked={showSelectionGlow}
                        onChange={(e) => onToggleSelectionGlow(e.currentTarget.checked)}
                    />
                </div>
            </div>
            {search.trim().length > 0 && (
                <div className="px-2 pb-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-center h-6 text-xs"
                        onClick={() => setSearch("")}
                    >
                        Clear Search
                    </Button>
                </div>
            )}

            {allowEditActions ? (
                <>
                    <div className="scene-hierarchy__actions">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleDuplicateSelection}
                            disabled={!selectedId}
                        >
                            Duplicate
                        </Button>
                        <Button
                            variant="danger"
                            size="sm"
                            onClick={handleDeleteSelection}
                            disabled={!selectedId}
                        >
                            Delete
                        </Button>
                    </div>

                    <div className="scene-hierarchy__reparent">
                        <label htmlFor="scene-reparent-select">Parent</label>
                        <select
                            id="scene-reparent-select"
                            value={reparentTarget}
                            onChange={(event) => setReparentTarget(event.target.value)}
                            disabled={!selectedId}
                        >
                            <option value="">Scene root</option>
                            {parentOptions.map((node) => (
                                <option key={node.id} value={node.id}>
                                    {node.name || node.id}
                                </option>
                            ))}
                        </select>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleReparentSelection}
                            disabled={!selectedId || parentOptions.length === 0}
                        >
                            Move
                        </Button>
                    </div>
                </>
            ) : null}

            <div className="scene-hierarchy__tree">
                {!hasVisibleNodes && search.trim().length > 0 && (
                    <p className="scene-hierarchy__empty">
                        No results found for “{search.trim()}”.
                    </p>
                )}
                {!hasVisibleNodes && search.trim().length === 0 && (
                    <p className="scene-hierarchy__empty">
                        {objects.length === 0
                            ? "Load a Vizij scene to populate the hierarchy."
                            : "All objects are hidden. Expand a parent node to continue."}
                    </p>
                )}
                {rootNodes.map((node) => renderSubtree(node, 0))}
            </div>
        </Panel>
    );
}
