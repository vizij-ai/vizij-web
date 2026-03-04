import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Popover as BasePopover } from "@base-ui/react";
import { Box, Folder, Lock, Plus, Search, Unlock, X } from "lucide-react";
import type { JSX } from "react/jsx-runtime";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useSceneComposer } from "../../scene/useSceneComposer";
import {
  useBindingAuthoring,
  useSelectionStore,
} from "../../state/RigControllerProvider";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { cn } from "../../utils/cn";
import { EmptyState } from "../ui/EmptyState";
import { Panel, Button, Select, PanelSearch, TreeRow } from "../ui";
import { useHierarchyTreeState } from "../scene-composer/useHierarchyTreeState";
import { filterHierarchyNodes } from "../scene-composer/hierarchyFilters";

interface HierarchyPanelProps {
  allowEditActions?: boolean;
  showSelectionGlow: boolean;
  onToggleSelectionGlow: (enabled: boolean) => void;
  onSelectObject?: (id: string, options?: { additive?: boolean }) => void;
  referenceFaceFile: File | null;
  onClosePanel?: () => void;
}

function collectTopLevelSelectionIds(
  selectedIds: string[],
  nodesById: Map<string, SceneObjectNode>,
): string[] {
  if (selectedIds.length <= 1) {
    return selectedIds;
  }
  const selectedSet = new Set(selectedIds);
  return selectedIds.filter((nodeId) => {
    let current = nodesById.get(nodeId);
    while (current?.parentId) {
      if (selectedSet.has(current.parentId)) {
        return false;
      }
      current = nodesById.get(current.parentId);
    }
    return true;
  });
}

function collectLockableTargetIdsForNode(
  node: SceneObjectNode | null,
): string[] {
  if (!node) {
    return [];
  }
  const ids = new Set<string>();
  node.features.forEach((feature) => {
    feature.components.forEach((component) => {
      const targetId = component.targetId?.trim();
      if (!targetId) {
        return;
      }
      ids.add(targetId);
    });
  });
  return Array.from(ids);
}

const TRANSFORM_FEATURE_KEYS = new Set(["translation", "rotation", "scale"]);
const KNOWN_NON_MORPH_FEATURE_KEYS = new Set([
  "translation",
  "rotation",
  "scale",
  "opacity",
  "color",
]);

export function HierarchyPanel({
  allowEditActions = true,
  showSelectionGlow,
  onToggleSelectionGlow,
  onSelectObject,
  referenceFaceFile,
  onClosePanel,
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

  // Filtering
  const [search, setSearch] = useState("");
  const nodesById = useMemo(
    () => new Map(objects.map((node) => [node.id, node])),
    [objects],
  );
  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const selectedIds = useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();
    selectionStack.forEach((selection) => {
      if (selection.namespace !== DEFAULT_NAMESPACE) {
        return;
      }
      if (!nodesById.has(selection.id) || seen.has(selection.id)) {
        return;
      }
      ids.push(selection.id);
      seen.add(selection.id);
    });
    return ids;
  }, [nodesById, selectionStack]);
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedId = selectedIds[0] ?? null;
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const handleSetInspectorTargetLocked = useBindingAuthoring(
    (state) => state.handleSetInspectorTargetLocked,
  );
  const selectedNodes = useMemo(
    () =>
      selectedIds
        .map((id) => nodesById.get(id))
        .filter((node): node is SceneObjectNode => Boolean(node)),
    [nodesById, selectedIds],
  );
  const selectedNode = selectedNodes[0] ?? null;
  const selectedTopLevelIds = useMemo(
    () => collectTopLevelSelectionIds(selectedIds, nodesById),
    [nodesById, selectedIds],
  );
  const selectedLockTargetBatches = useMemo(
    () =>
      selectedIds
        .map((nodeId) => {
          const node = nodesById.get(nodeId) ?? null;
          return {
            nodeId,
            targetIds: collectLockableTargetIdsForNode(node),
          };
        })
        .filter((batch) => batch.targetIds.length > 0),
    [nodesById, selectedIds],
  );
  const selectedLockTargetIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    selectedLockTargetBatches.forEach((batch) => {
      batch.targetIds.forEach((targetId) => {
        if (seen.has(targetId)) {
          return;
        }
        seen.add(targetId);
        ids.push(targetId);
      });
    });
    return ids;
  }, [selectedLockTargetBatches]);
  const lockSummaryByNodeId = useMemo(() => {
    const summary = new Map<
      string,
      { lockableCount: number; lockedCount: number }
    >();
    objects.forEach((node) => {
      const lockableTargetIds = collectLockableTargetIdsForNode(node);
      const lockableCount = lockableTargetIds.length;
      const lockedCount = lockableTargetIds.reduce(
        (count, targetId) =>
          lockedInspectorTargetIds.has(targetId) ? count + 1 : count,
        0,
      );
      summary.set(node.id, { lockableCount, lockedCount });
    });
    return summary;
  }, [lockedInspectorTargetIds, objects]);
  const selectedLockedTargetCount = useMemo(
    () =>
      selectedLockTargetIds.reduce(
        (count, targetId) =>
          lockedInspectorTargetIds.has(targetId) ? count + 1 : count,
        0,
      ),
    [lockedInspectorTargetIds, selectedLockTargetIds],
  );
  const hasLockableSelection = selectedLockTargetIds.length > 0;
  const areSelectedTargetsFullyLocked =
    hasLockableSelection &&
    selectedLockedTargetCount === selectedLockTargetIds.length;
  const handleToggleLockSelection = useCallback(() => {
    if (selectedLockTargetIds.length === 0) {
      return;
    }
    const nextLocked = !areSelectedTargetsFullyLocked;
    const applied = new Set<string>();
    selectedLockTargetBatches.forEach((batch) => {
      batch.targetIds.forEach((targetId) => {
        if (applied.has(targetId)) {
          return;
        }
        applied.add(targetId);
        handleSetInspectorTargetLocked(targetId, nextLocked);
      });
    });
  }, [
    areSelectedTargetsFullyLocked,
    handleSetInspectorTargetLocked,
    selectedLockTargetBatches,
    selectedLockTargetIds,
  ]);
  const smartLockTargets = useMemo(() => {
    const lockIds = new Set<string>();
    const unlockIds = new Set<string>();

    objects.forEach((node) => {
      node.features.forEach((feature) => {
        const featureKey = feature.key.trim().toLowerCase();
        const shouldLock = TRANSFORM_FEATURE_KEYS.has(featureKey);
        const shouldUnlock =
          featureKey === "color" ||
          !KNOWN_NON_MORPH_FEATURE_KEYS.has(featureKey);
        feature.components.forEach((component) => {
          const targetId = component.targetId?.trim();
          if (!targetId) {
            return;
          }
          if (shouldLock) {
            lockIds.add(targetId);
            return;
          }
          if (shouldUnlock) {
            unlockIds.add(targetId);
          }
        });
      });
    });

    lockIds.forEach((targetId) => {
      unlockIds.delete(targetId);
    });

    return {
      lockIds: Array.from(lockIds),
      unlockIds: Array.from(unlockIds),
    };
  }, [objects]);
  const hasSmartLockTargets =
    smartLockTargets.lockIds.length > 0 ||
    smartLockTargets.unlockIds.length > 0;
  const handleApplySmartTransformLocks = useCallback(() => {
    if (!hasSmartLockTargets) {
      return;
    }
    smartLockTargets.lockIds.forEach((targetId) => {
      handleSetInspectorTargetLocked(targetId, true);
    });
    smartLockTargets.unlockIds.forEach((targetId) => {
      handleSetInspectorTargetLocked(targetId, false);
    });
  }, [handleSetInspectorTargetLocked, hasSmartLockTargets, smartLockTargets]);

  // Use the optimized filters from hierarchyFilters.ts
  const { visibleIds, matchingIds } = useMemo(
    () => filterHierarchyNodes(rootIds, nodesById, search),
    [rootIds, nodesById, search],
  );

  const isNodeVisible = useCallback(
    (nodeId: string) => !visibleIds || visibleIds.has(nodeId),
    [visibleIds],
  );

  // Tree State
  const nodeIds = useMemo(() => objects.map((n) => n.id), [objects]);
  const { isExpanded, toggleNode, setExpanded } = useHierarchyTreeState(
    DEFAULT_NAMESPACE,
    nodeIds,
  );

  // Sync expansion when selection changes
  useEffect(() => {
    if (!selectedId) return;
    const crumbs = getBreadcrumb(selectedId);
    crumbs.forEach((node) => {
      setExpanded(node.id, true);
    });
  }, [getBreadcrumb, selectedId, setExpanded]);

  // Sync expansion when search results change
  useEffect(() => {
    if (!search.trim()) return;
    matchingIds.forEach((nodeId) => {
      const crumbs = getBreadcrumb(nodeId);
      crumbs.slice(0, -1).forEach((crumb) => {
        setExpanded(crumb.id, true);
      });
    });
  }, [getBreadcrumb, matchingIds, search, setExpanded]);

  const handleSelect = useCallback(
    (id: string, event?: ReactMouseEvent<HTMLElement>) => {
      const additive = Boolean(event?.metaKey || event?.ctrlKey);
      const options = additive ? { additive: true } : undefined;
      if (onSelectObject) {
        onSelectObject(id, options);
        return;
      }
      selectObject(id, options);
    },
    [onSelectObject, selectObject],
  );

  const handleDuplicateSelection = useCallback(() => {
    if (!selectedId) return;
    const newId = duplicateNode(selectedId, {
      includeChildren: true,
      parentId: selectedNode?.parentId ?? null,
    });
    if (newId) {
      handleSelect(newId);
    }
  }, [duplicateNode, handleSelect, selectedId, selectedNode?.parentId]);

  const handleDeleteSelection = useCallback(() => {
    if (selectedTopLevelIds.length === 0) return;
    selectedTopLevelIds.forEach((id) => {
      deleteNode(id, { includeChildren: true });
    });
  }, [deleteNode, selectedTopLevelIds]);

  // Reparenting state
  const initialReparentTarget = useMemo(() => {
    if (selectedNodes.length === 0) {
      return "";
    }
    const parentId = selectedNodes[0]?.parentId ?? null;
    const hasSameParent = selectedNodes.every(
      (node) => node.parentId === parentId,
    );
    return hasSameParent ? (parentId ?? "") : "";
  }, [selectedNodes]);
  const [reparentTarget, setReparentTarget] = useState<string>(
    initialReparentTarget,
  );
  // Add state for popover
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  useEffect(() => {
    setReparentTarget(initialReparentTarget);
  }, [initialReparentTarget]);

  const handleReparentSelection = useCallback(() => {
    if (selectedTopLevelIds.length === 0) return;
    const target = reparentTarget === "" ? null : reparentTarget;
    selectedTopLevelIds.forEach((id) => {
      const node = nodesById.get(id);
      if (!node || node.parentId === target) {
        return;
      }
      reparentNode(id, target);
    });
  }, [nodesById, reparentNode, reparentTarget, selectedTopLevelIds]);

  const blockedForParent = useMemo(() => {
    if (selectedNodes.length === 0) return new Set<string>();
    const blocked = new Set<string>();
    const pending = selectedNodes.map((node) => node.id);
    while (pending.length > 0) {
      const current = pending.pop();
      if (!current || blocked.has(current)) continue;
      blocked.add(current);
      const child = nodesById.get(current);
      if (child) pending.push(...child.childIds);
    }
    return blocked;
  }, [nodesById, selectedNodes]);

  const parentOptions = useMemo(
    () => objects.filter((node) => !blockedForParent.has(node.id)),
    [blockedForParent, objects],
  );

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
      const isSelected = selectedIdSet.has(node.id);

      const isShape = node.type.toLowerCase() === "shape";
      const Icon = isShape ? Box : Folder;
      const typeLabel = isShape ? "Shape" : "Group";
      const lockSummary = lockSummaryByNodeId.get(node.id) ?? {
        lockableCount: 0,
        lockedCount: 0,
      };
      const hasLockableTargets = lockSummary.lockableCount > 0;
      const isFullyLocked =
        hasLockableTargets &&
        lockSummary.lockedCount === lockSummary.lockableCount;
      const lockTitle = `Locked properties: ${lockSummary.lockedCount}/${lockSummary.lockableCount}`;

      return (
        <TreeRow
          key={node.id}
          depth={depth}
          label={node.name || node.id}
          hasChildren={hasChildren}
          isExpanded={expanded}
          isSelected={isSelected}
          onToggle={() => toggleNode(node.id)}
          onSelect={(event) => handleSelect(node.id, event)}
          highlightQuery={search}
          icon={null}
          actions={
            <>
              <span
                className="flex items-center justify-center w-4 h-4 bg-accent/10 text-accent rounded-sm select-none border border-accent/20"
                title={typeLabel}
              >
                <Icon size={10} strokeWidth={2.5} />
              </span>
              {hasLockableTargets && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[9px] font-mono rounded-sm px-1 py-0.5 border",
                    isFullyLocked
                      ? "text-amber-200 border-amber-300/40 bg-amber-500/15"
                      : "text-text-muted border-border-default/80 bg-bg-panel",
                  )}
                  title={lockTitle}
                >
                  <Lock size={9} />
                  <span>
                    {lockSummary.lockedCount}/{lockSummary.lockableCount}
                  </span>
                </span>
              )}
              {node.features.length > 0 && (
                <span className="text-[9px] text-text-muted font-mono">
                  {node.features.length}
                </span>
              )}
            </>
          }
        >
          {hasChildren && expanded && (
            <div className="flex flex-col">
              {childNodes.map((child) => renderSubtree(child, depth + 1))}
            </div>
          )}
        </TreeRow>
      );
    },
    [
      getChildren,
      isNodeVisible,
      search,
      handleSelect,
      lockSummaryByNodeId,
      selectedIdSet,
      toggleNode,
      isExpanded,
    ],
  );

  // --- Virtual Root Rendering ---
  const rootNodes = useMemo(
    () =>
      rootIds
        .map((id) => nodesById.get(id))
        .filter((n): n is SceneObjectNode => !!n),
    [nodesById, rootIds],
  );
  const hasVisibleNodes = visibleIds
    ? visibleIds.size > 0
    : rootNodes.length > 0;

  const renderMainFaceRoot = () => {
    const isMainExpanded = isExpanded("virtual_main_face");
    return (
      <TreeRow
        depth={0}
        label="Main Face"
        hasChildren={true}
        isExpanded={isMainExpanded}
        onToggle={() => toggleNode("virtual_main_face")}
        icon={<Folder size={12} className="text-accent" />}
        actions={
          <span className="text-[9px] text-text-muted font-mono ml-auto">
            {objects.length}
          </span>
        }
        className="text-text-secondary"
      >
        {isMainExpanded && (
          <div className="flex flex-col border-l border-border-default/50 ml-3 pl-1">
            {!hasVisibleNodes && (
              <div className="py-2 px-6 text-xs text-text-muted italic">
                Empty or no match
              </div>
            )}
            {rootNodes.map((node) => renderSubtree(node, 0))}
          </div>
        )}
      </TreeRow>
    );
  };

  const renderReferenceFaceRoot = () => {
    const isRefExpanded = isExpanded("virtual_ref_face");
    const fileLabel = referenceFaceFile
      ? referenceFaceFile.name
      : "No file loaded";

    return (
      <div className="flex flex-col mt-1">
        <TreeRow
          depth={0}
          label="Reference Face"
          hasChildren={true}
          isExpanded={isRefExpanded}
          onToggle={() => toggleNode("virtual_ref_face")}
          icon={<Folder size={12} className="text-purple-400" />}
          className="text-purple-200"
        >
          {isRefExpanded && (
            <div className="flex flex-col border-l border-border-default/50 ml-3 pl-1">
              <div className="py-1 px-2 flex items-center gap-2">
                <span className="text-[10px] text-text-muted">File:</span>
                <span
                  className={cn(
                    "text-[10px] font-mono",
                    referenceFaceFile
                      ? "text-text-primary"
                      : "text-text-muted italic",
                  )}
                >
                  {fileLabel}
                </span>
              </div>
            </div>
          )}
        </TreeRow>
      </div>
    );
  };

  useEffect(() => {
    setExpanded("virtual_main_face", true);
    setExpanded("virtual_ref_face", true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedCount = selectedIds.length;
  const canDuplicateSelection = selectedTopLevelIds.length === 1;
  const moveTargetLabel =
    selectedCount === 1
      ? (selectedNode?.name ?? selectedNode?.id ?? "selection")
      : `${selectedCount} elements`;

  return (
    <Panel
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      title="Face Elements"
      description="Select objects via the tree or viewport to drive the inspector."
      actions={
        onClosePanel ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-text-secondary hover:text-text-primary"
            onClick={onClosePanel}
            title="Hide panel"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null
      }
    >
      <div className="flex flex-col h-full gap-1 p-1">
        {allowEditActions && selectedCount > 0 && (
          <div className="flex items-center gap-1 p-1 rounded bg-accent/10 border border-accent/20 mb-1 mx-1">
            <button
              type="button"
              onClick={() => onToggleSelectionGlow(!showSelectionGlow)}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded hover:bg-white/5 transition-colors",
                showSelectionGlow
                  ? "text-yellow-400"
                  : "text-text-muted hover:text-text-primary",
              )}
              title="Toggle Selection Glow"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            </button>
            <div className="w-px h-4 bg-accent/20 mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-text-muted hover:text-accent hover:bg-accent/20"
              onClick={handleDuplicateSelection}
              title="Duplicate Selection"
              disabled={!canDuplicateSelection}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </Button>
            <BasePopover.Root open={isMoveOpen} onOpenChange={setIsMoveOpen}>
              <BasePopover.Trigger
                className={cn(
                  "h-6 w-6 p-0 flex items-center justify-center rounded text-text-muted hover:text-accent hover:bg-accent/20 data-[state=open]:text-accent data-[state=open]:bg-accent/20 transition-colors",
                )}
                title="Move Selection"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m5 9-3 3 3 3" />
                  <path d="M9 5l3-3 3 3" />
                  <path d="m19 9 3 3-3 3" />
                  <path d="M9 19l3 3 3-3" />
                  <path d="M2 12h20" />
                  <path d="M12 2v20" />
                </svg>
              </BasePopover.Trigger>
              <BasePopover.Portal>
                <BasePopover.Positioner
                  side="right"
                  align="start"
                  sideOffset={5}
                >
                  <BasePopover.Popup className="w-64 p-3 bg-bg-panel border border-border-default rounded-xl shadow-2xl shadow-black/50 z-[100] flex flex-col gap-3 transition duration-200 ease-out data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-text-muted">
                        Move{" "}
                        <span className="text-accent truncate inline-block max-w-[120px] align-bottom">
                          {moveTargetLabel}
                        </span>{" "}
                        to under:
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
                        onClick={() => setIsMoveOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        className="h-7 text-xs px-4"
                        onClick={() => {
                          handleReparentSelection();
                          setIsMoveOpen(false);
                        }}
                        disabled={selectedTopLevelIds.length === 0}
                      >
                        Move
                      </Button>
                    </div>
                  </BasePopover.Popup>
                </BasePopover.Positioner>
              </BasePopover.Portal>
            </BasePopover.Root>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-6 w-6 p-0 hover:bg-accent/20",
                areSelectedTargetsFullyLocked
                  ? "text-amber-300 hover:text-amber-200"
                  : "text-text-muted hover:text-accent",
              )}
              onClick={handleToggleLockSelection}
              title={
                areSelectedTargetsFullyLocked
                  ? "Unlock Selection"
                  : "Lock Selection"
              }
              disabled={!hasLockableSelection}
            >
              {areSelectedTargetsFullyLocked ? (
                <Unlock size={14} />
              ) : (
                <Lock size={14} />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-text-muted hover:text-accent hover:bg-accent/20"
              onClick={handleApplySmartTransformLocks}
              title="Apply Smart Transform Locks (all face elements)"
              disabled={!hasSmartLockTargets}
            >
              <span className="relative flex items-center justify-center">
                <Lock size={12} />
                <Plus size={8} className="absolute -right-1 -bottom-1" />
              </span>
            </Button>

            <div className="ml-auto" />

            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-500/70 hover:text-red-400 hover:bg-red-500/20"
              onClick={handleDeleteSelection}
              title="Delete Selection"
              disabled={selectedTopLevelIds.length === 0}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2 px-1 mb-1">
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder="Filter..."
          />
        </div>

        <div className="flex-1 min-h-[200px] overflow-y-auto px-1 custom-scrollbar">
          <div className="flex flex-col pb-4">
            {referenceFaceFile ? (
              <>
                {renderMainFaceRoot()}
                {renderReferenceFaceRoot()}
              </>
            ) : (
              <>
                {!hasVisibleNodes && (
                  <EmptyState
                    icon={Search}
                    iconSize={18}
                    title={
                      search.trim().length > 0 ? "No results" : "Scene is empty"
                    }
                    description={
                      search.trim().length > 0
                        ? `No objects found matching "${search}"`
                        : "Add objects to the scene to see them here."
                    }
                    action={
                      search.trim().length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearch("")}
                          className="h-6 text-[10px] text-accent hover:text-accent-hover"
                        >
                          Clear Search
                        </Button>
                      ) : undefined
                    }
                    className="py-12"
                  />
                )}
                {rootNodes.map((node) => renderSubtree(node, 0))}
              </>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
