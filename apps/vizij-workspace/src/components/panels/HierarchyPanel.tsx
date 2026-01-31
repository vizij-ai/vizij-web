import { useMemo, useState, useEffect, useCallback } from "react";
import type { JSX } from "react/jsx-runtime";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSelectionStore } from "../../state/RigControllerProvider";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { Panel, Button, Switch, Select } from "../ui";
import { cn } from "../../utils/cn";
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
                <div key={node.id} className="flex flex-col">
                    <div
                        className={cn(
                            "group flex items-center gap-1.5 rounded px-1 min-h-[26px] transition-all cursor-default select-none",
                            isSelected
                                ? "bg-blue-600/20 text-blue-100 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.3)]"
                                : "text-slate-400 hover:bg-slate-800/40 hover:text-slate-200"
                        )}
                        style={{ marginLeft: `${depth * 12}px` }}
                        onClick={(e) => {
                            e.stopPropagation();
                            selectObject(node.id);
                        }}
                    >
                        <button
                            type="button"
                            className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-slate-700/50 transition-transform duration-200",
                                !hasChildren && "opacity-0 pointer-events-none",
                                expanded && "rotate-90"
                            )}
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleNode(node.id);
                            }}
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                        </button>

                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span
                                className={cn(
                                    "text-[11px] font-medium truncate",
                                    matchesQuery && "text-yellow-400 underline decoration-yellow-400/50 underline-offset-2",
                                    isSelected && "text-blue-200"
                                )}
                            >
                                {node.name || node.id}
                            </span>

                            <span className="flex items-center gap-1.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-[9px] font-bold uppercase tracking-tighter bg-slate-800 px-1 rounded text-slate-500">
                                    {node.type.slice(0, 3)}
                                </span>
                                {node.features.length > 0 && (
                                    <span className="text-[9px] text-slate-500 font-mono">
                                        {node.features.length}
                                    </span>
                                )}
                            </span>
                        </div>
                    </div>
                    {hasChildren && expanded && (
                        <div className="flex flex-col">
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
            className="flex-1 min-h-0"
            title="Scene Hierarchy"
            description="Select objects via the tree or viewport to drive the inspector."
            badge={`${objects.length} ${objects.length === 1 ? "node" : "nodes"}`}
        >
            <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                        <input
                            type="search"
                            className="w-full h-8 rounded-md bg-slate-950/50 border border-slate-800 px-3 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all"
                            placeholder="Filter hierarchy..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/30 border border-slate-800/50">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Glow</span>
                        <Switch
                            checked={showSelectionGlow}
                            onChange={onToggleSelectionGlow}
                        />
                    </div>
                </div>

                {allowEditActions && (
                    <div className="flex flex-col gap-2 p-2 rounded-lg bg-slate-800/20 border border-slate-800/40">
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                className="flex-1 h-7 text-[11px]"
                                onClick={handleDuplicateSelection}
                                disabled={!selectedId}
                            >
                                Duplicate
                            </Button>
                            <Button
                                variant="danger"
                                size="sm"
                                className="flex-1 h-7 text-[11px]"
                                onClick={handleDeleteSelection}
                                disabled={!selectedId}
                            >
                                Delete
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            <Select
                                size="sm"
                                className="flex-1"
                                value={reparentTarget}
                                onChange={setReparentTarget}
                                disabled={!selectedId}
                                options={[
                                    { value: "", label: "Scene Root" },
                                    ...parentOptions.map((node) => ({
                                        value: node.id,
                                        label: node.name || node.id,
                                    })),
                                ]}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                className="h-7 px-3 text-[11px]"
                                onClick={handleReparentSelection}
                                disabled={!selectedId || parentOptions.length === 0}
                            >
                                Move
                            </Button>
                        </div>
                    </div>
                )}

                <div className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto rounded border border-slate-800/60 bg-slate-950/30 p-1 custom-scrollbar">
                    {!hasVisibleNodes && (
                        <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-xs italic gap-2">
                            {search.trim().length > 0 ? (
                                <>
                                    <span>No results for "{search}"</span>
                                    <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="h-6 text-[10px]">Clear Filter</Button>
                                </>
                            ) : (
                                <span>Hierarchy is empty</span>
                            )}
                        </div>
                    )}
                    <div className="flex flex-col">
                        {rootNodes.map((node) => renderSubtree(node, 0))}
                    </div>
                </div>
            </div>
        </Panel>
    );
}
