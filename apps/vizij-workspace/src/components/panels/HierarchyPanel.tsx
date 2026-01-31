import { useMemo, useState, useEffect, useCallback } from "react";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Box, Folder } from "lucide-react";
import type { JSX } from "react/jsx-runtime";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSelectionStore } from "../../state/RigControllerProvider";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { Panel, Button, Select } from "../ui";
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
                                {(() => {
                                    const isShape = node.type.toLowerCase() === 'shape';
                                    const Icon = isShape ? Box : Folder;
                                    const typeLabel = isShape ? "Shape" : "Group";
                                    return (
                                        <span
                                            className="flex items-center justify-center w-4 h-4 bg-blue-500/10 text-blue-400 rounded-sm select-none border border-blue-500/20"
                                            title={typeLabel}
                                        >
                                            <Icon size={10} strokeWidth={2.5} />
                                        </span>
                                    );
                                })()}
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
            className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
            title="Face Hierarchy"
            description="Select objects via the tree or viewport to drive the inspector."
            badge={null}
            actions={null}
        >
            <div className="flex flex-col h-full gap-1 p-1">


                {/* Compact Actions Toolbar */}
                {allowEditActions && selectedId && (
                    <div className="flex items-center gap-1 p-1 rounded bg-blue-900/10 border border-blue-500/20 mb-1 mx-1">
                        <button
                            type="button"
                            onClick={() => onToggleSelectionGlow(!showSelectionGlow)}
                            className={cn(
                                "flex items-center justify-center h-6 w-6 rounded hover:bg-white/5 transition-colors",
                                showSelectionGlow ? "text-yellow-400" : "text-slate-400 hover:text-slate-300"
                            )}
                            title="Toggle Selection Glow"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="5" />
                                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                            </svg>
                        </button>

                        <div className="w-px h-4 bg-blue-500/20 mx-1" />

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-slate-400 hover:text-blue-300 hover:bg-blue-500/20"
                            onClick={handleDuplicateSelection}
                            title="Duplicate Selection"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-slate-400 hover:text-red-300 hover:bg-red-500/20"
                            onClick={handleDeleteSelection}
                            title="Delete Selection"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </Button>


                        <div className="w-px h-4 bg-blue-500/20 mx-1" />

                        <Popover className="relative">
                            <PopoverButton
                                as={Button}
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-slate-400 hover:text-blue-300 hover:bg-blue-500/20 data-[open]:text-blue-300 data-[open]:bg-blue-500/20"
                                title="Move Selection"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 9-3 3 3 3" /><path d="M9 5l3-3 3 3" /><path d="m19 9 3 3-3 3" /><path d="M9 19l3 3 3-3" /><path d="M2 12h20" /><path d="M12 2v20" /></svg>
                            </PopoverButton>

                            <PopoverPanel
                                anchor="right start"
                                className="w-64 p-3 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl shadow-black/50 z-[100] flex flex-col gap-3 transition duration-200 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
                            >
                                {({ close }) => (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-medium text-slate-400">
                                                Move <span className="text-blue-300 truncate inline-block max-w-[120px] align-bottom">{selectedNode?.name || selectedNode?.id}</span> to under:
                                            </span>
                                            <Select
                                                size="sm"
                                                className="w-full text-xs"
                                                value={reparentTarget}
                                                onChange={setReparentTarget}
                                                options={[
                                                    { value: "", label: "Scene Root" },
                                                    ...parentOptions.map((node) => ({
                                                        value: node.id,
                                                        label: node.name || node.id,
                                                    })),
                                                ]}
                                            />
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 text-xs"
                                                onClick={() => close()}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                className="h-7 text-xs px-4"
                                                onClick={() => {
                                                    handleReparentSelection();
                                                    close();
                                                }}
                                                disabled={!selectedId}
                                            >
                                                Move
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </PopoverPanel>
                        </Popover>
                    </div>
                )}

                {/* Search Bar */}
                <div className="flex items-center gap-2 px-1 mb-1">
                    <div className="relative flex-1 group h-7">
                        <div className="absolute inset-y-0 left-2 flex items-center pointer-events-none text-slate-500 group-focus-within:text-blue-500 transition-colors">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                        </div>
                        <input
                            type="search"
                            className="w-full h-full rounded bg-slate-900/50 border border-slate-800 hover:border-slate-700 focus:border-blue-500/50 pl-7 pr-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/20 transition-all font-medium"
                            placeholder="Filter..."
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    </div>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0 pr-1">{objects.length}</span>
                </div>

                <div className="flex-1 min-h-[200px] overflow-y-auto px-1 custom-scrollbar">
                    {!hasVisibleNodes && (
                        <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs gap-3 border border-dashed border-slate-800/50 rounded-xl bg-slate-900/20 m-1">
                            {search.trim().length > 0 ? (
                                <>
                                    <span className="font-medium text-slate-400">No results</span>
                                    <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="h-6 text-[10px] text-blue-400 hover:text-blue-300">Clear</Button>
                                </>
                            ) : (
                                <span className="font-medium text-slate-400">Empty</span>
                            )}
                        </div>
                    )}
                    <div className="flex flex-col pb-4">
                        {rootNodes.map((node) => renderSubtree(node, 0))}
                    </div>
                </div>
            </div>
        </Panel>
    );
}
