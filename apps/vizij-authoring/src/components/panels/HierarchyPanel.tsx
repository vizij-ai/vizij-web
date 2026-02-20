import { useMemo, useState, useEffect, useCallback } from "react";
import { Popover as BasePopover } from "@base-ui/react";
import { Box, Folder, Search } from "lucide-react";
import type { JSX } from "react/jsx-runtime";
import type { SceneObjectNode } from "../../scene/sceneGraph";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSelectionStore } from "../../state/RigControllerProvider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { DEFAULT_NAMESPACE } from "../../utils/constants";
import { cn } from "../../utils/cn";
import { EmptyState } from "../ui/EmptyState";
import { Panel, Button, Select, PanelSearch, TreeRow } from "../ui";
import {
  computeBlockedHierarchyParentIds,
  useHierarchySurfaceState,
} from "../scene-composer/useHierarchySurfaceState";

interface HierarchyPanelProps {
  allowEditActions?: boolean;
  showSelectionGlow: boolean;
  onToggleSelectionGlow: (enabled: boolean) => void;
  onSelectObject?: (id: string) => void;
}

export function HierarchyPanel({
  allowEditActions = true,
  showSelectionGlow,
  onToggleSelectionGlow,
  onSelectObject,
}: HierarchyPanelProps) {
  const {
    objects,
    rootIds,
    getNode,
    getChildren,
    selectObject,
    getBreadcrumb,
    duplicateNode,
    deleteNode,
    reparentNode,
  } = useSceneComposer();
  const selectionStack = useSelectionStore((state) => state.selectionStack);
  const selectedId = selectionStack[0]?.id ?? null;
  const selectedNode = useMemo(
    () => (selectedId ? getNode(selectedId) : null),
    [getNode, selectedId],
  );
  const referenceFace = useReferenceFace();
  const {
    search,
    setSearch,
    nodesById,
    rootNodes,
    hasVisibleNodes,
    isNodeVisible,
    isExpanded,
    toggleNode,
    setExpanded,
  } = useHierarchySurfaceState({
    namespace: DEFAULT_NAMESPACE,
    objects,
    rootIds,
    selectedId,
    getBreadcrumb,
  });

  const handleSelect = useCallback(
    (id: string) => {
      if (onSelectObject) {
        onSelectObject(id);
      }
      selectObject(id);
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
    if (!selectedId) return;
    deleteNode(selectedId, { includeChildren: true });
  }, [deleteNode, selectedId]);

  // Reparenting state
  const [reparentTarget, setReparentTarget] = useState<string>(
    selectedNode?.parentId ?? "",
  );
  // Add state for popover
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  useEffect(() => {
    setReparentTarget(selectedNode?.parentId ?? "");
  }, [selectedNode?.parentId]);

  const handleReparentSelection = useCallback(() => {
    if (!selectedId) return;
    const target = reparentTarget === "" ? null : reparentTarget;
    if (target === selectedNode?.parentId) return;
    reparentNode(selectedId, target);
  }, [reparentNode, reparentTarget, selectedId, selectedNode?.parentId]);

  const blockedForParent = useMemo(
    () => computeBlockedHierarchyParentIds(nodesById, selectedNode),
    [nodesById, selectedNode],
  );

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
      const isSelected = selectedId === node.id;

      const isShape = node.type.toLowerCase() === "shape";
      const Icon = isShape ? Box : Folder;
      const typeLabel = isShape ? "Shape" : "Group";

      return (
        <TreeRow
          key={node.id}
          depth={depth}
          label={node.name || node.id}
          hasChildren={hasChildren}
          isExpanded={expanded}
          isSelected={isSelected}
          onToggle={() => toggleNode(node.id)}
          onSelect={() => handleSelect(node.id)}
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
      selectedId,
      toggleNode,
      isExpanded,
    ],
  );

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
    const fileLabel = referenceFace.file
      ? referenceFace.file.name
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
                    referenceFace.file
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

  return (
    <Panel
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      title="Face Elements"
      description="Select objects via the tree or viewport to drive the inspector."
    >
      <div className="flex flex-col h-full gap-1 p-1">
        {allowEditActions && selectedId && (
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
                          {selectedNode?.name || selectedNode?.id}
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
                        disabled={!selectedId}
                      >
                        Move
                      </Button>
                    </div>
                  </BasePopover.Popup>
                </BasePopover.Positioner>
              </BasePopover.Portal>
            </BasePopover.Root>

            <div className="ml-auto" />

            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-red-500/70 hover:text-red-400 hover:bg-red-500/20"
              onClick={handleDeleteSelection}
              title="Delete Selection"
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
            {referenceFace.file ? (
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
