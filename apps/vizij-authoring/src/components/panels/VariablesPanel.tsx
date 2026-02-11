import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, Folder, Zap, Activity, Play, Search } from "lucide-react";
import type { StandardRigInput } from "@vizij/utils";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { PanelSearch, TreeRow } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import type { PoseDefinition } from "../../poseRig/types";
import type { ManagedStandardInput } from "../../types/standardInputs";

// ----------------------------------------------------------------------------
// Types & Helper Functions
// ----------------------------------------------------------------------------

type NodeType = "folder" | "pose" | "rig";
type RigNodeSource = "auto" | "preset" | "custom" | "reference";

interface RigNodeData {
  input: StandardRigInput;
  source: RigNodeSource;
  disabled?: boolean;
}

interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  children: Map<string, TreeNode>;
  showChildren: boolean; // Default expansion state
  data?: PoseDefinition | RigNodeData;
}

function resolveManagedSource(entry: ManagedStandardInput): RigNodeSource {
  const isPreset = entry.metadata?.elementType === "standard";
  if (isPreset) {
    return "preset";
  }
  return entry.source;
}

const SOURCE_BADGE_CLASS: Record<RigNodeSource, string> = {
  auto: "bg-sky-900/40 text-sky-200",
  preset: "bg-emerald-900/40 text-emerald-200",
  custom: "bg-amber-900/40 text-amber-200",
  reference: "bg-violet-900/40 text-violet-200",
};

function getOrCreateChild(
  parent: TreeNode,
  key: string,
  label: string,
): TreeNode {
  if (!parent.children.has(key)) {
    parent.children.set(key, {
      id: `${parent.id}/${key}`,
      label,
      type: "folder",
      children: new Map(),
      showChildren: true,
    });
  }
  return parent.children.get(key)!;
}

function simplifyNode(node: TreeNode): TreeNode {
  const newChildren = new Map<string, TreeNode>();
  for (const [key, child] of node.children) {
    newChildren.set(key, simplifyNode(child));
  }

  const newNode = { ...node, children: newChildren };

  if (newNode.type === "folder" && newNode.children.size === 1) {
    const child = newNode.children.values().next().value!;
    if (child.type === "folder") {
      return {
        ...child,
        label: `${newNode.label} / ${child.label}`,
      };
    }
  }

  return newNode;
}

// ----------------------------------------------------------------------------
// Components
// ----------------------------------------------------------------------------

interface TreeRowWrapperProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAction?: (node: TreeNode, action: string) => void;
  onSelect?: (node: TreeNode) => void;
  selection?: { type: "pose" | "rig"; id: string } | null;
  searchQuery: string;
}

function TreeRowWrapper({
  node,
  depth,
  expanded,
  onToggle,
  onAction,
  onSelect,
  selection,
  searchQuery,
}: TreeRowWrapperProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.size > 0;

  // Check selection
  const isSelected =
    selection &&
    ((node.type === "pose" &&
      selection.type === "pose" &&
      (node.data as PoseDefinition)?.id === selection.id) ||
      (node.type === "rig" &&
        selection.type === "rig" &&
        (node.data as ManagedStandardInput)?.input?.id === selection.id));

  // Determine Icon
  let Icon = Folder;
  if (node.type === "pose") Icon = Activity;
  else if (node.type === "rig") Icon = Zap;

  // Determine Icon Color
  let iconClass = "text-text-muted";
  if (node.type === "pose") iconClass = "text-purple-400";
  else if (node.type === "rig") iconClass = "text-yellow-400";

  return (
    <TreeRow
      depth={depth}
      label={node.label}
      hasChildren={hasChildren}
      isExpanded={isExpanded}
      isSelected={!!isSelected}
      onToggle={() => onToggle(node.id)}
      onSelect={!hasChildren ? () => onSelect?.(node) : undefined}
      highlightQuery={searchQuery}
      icon={<Icon size={12} strokeWidth={2} className={iconClass} />}
      actions={
        <>
          {node.type === "pose" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:text-accent"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(node, "play");
              }}
              title="Apply Pose"
            >
              <Play size={10} fill="currentColor" />
            </Button>
          )}

          {node.type === "rig" && node.data && (
            <span
              className={`text-[9px] font-mono px-1 rounded ${
                SOURCE_BADGE_CLASS[(node.data as RigNodeData).source]
              }`}
            >
              {(node.data as RigNodeData).source}
            </span>
          )}
        </>
      }
    >
      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {Array.from(node.children.values())
            .sort((a, b) => {
              // Folders first
              if (a.type === "folder" && b.type !== "folder") return -1;
              if (a.type !== "folder" && b.type === "folder") return 1;
              return a.label.localeCompare(b.label);
            })
            .map((child) => (
              <TreeRowWrapper
                key={child.id}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onAction={onAction}
                onSelect={onSelect}
                selection={selection}
                searchQuery={searchQuery}
              />
            ))}
        </div>
      )}
    </TreeRow>
  );
}

interface VariablesPanelProps {
  selectedRigId?: string | null;
  onSelectRig?: (id: string | null) => void;
  onSelectPose?: (id: string) => void;
}

export function VariablesPanel({
  selectedRigId,
  onSelectRig,
  onSelectPose,
}: VariablesPanelProps) {
  const { poses, applyPose, selectPose, selectedPoseId } = usePoseRig();
  const { managedStandardInputs, handleCreateCustomStandardInput } =
    useBindingAuthoring((state) => state);
  const referenceFace = useReferenceFace();

  // State for search
  const [search, setSearch] = useState("");
  const [enabledSources, setEnabledSources] = useState<Set<RigNodeSource>>(
    () => new Set(["auto", "preset", "custom", "reference"]),
  );

  // State for tree expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["root"]),
  );

  const mainFaceRigEntries = useMemo(() => {
    return managedStandardInputs
      .filter((entry) => Boolean(entry.input.path?.trim()))
      .map((entry) => ({
        input: entry.input,
        source: resolveManagedSource(entry),
        disabled: entry.disabled,
      }));
  }, [managedStandardInputs]);

  const referenceRigEntries = useMemo(
    () =>
      referenceFace.standardInputs
        .filter((entry) => Boolean(entry.path?.trim()))
        .map((entry) => ({
          input: entry,
          source: "reference" as const,
        })),
    [referenceFace.standardInputs],
  );

  const sourceCounts = useMemo(() => {
    const counts: Record<RigNodeSource, number> = {
      auto: 0,
      preset: 0,
      custom: 0,
      reference: 0,
    };
    mainFaceRigEntries.forEach((entry) => {
      counts[entry.source] += 1;
    });
    counts.reference = referenceRigEntries.length;
    return counts;
  }, [mainFaceRigEntries, referenceRigEntries.length]);

  // Build Tree
  const rootNode = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      label: "Variables",
      type: "folder",
      children: new Map(),
      showChildren: true,
    };

    const hasReferenceFace = !!referenceFace.file;

    // Helper to get the target root for main face items
    let targetRoot = root;
    if (hasReferenceFace) {
      const mainFaceRoot: TreeNode = {
        id: "main_face",
        label: "Main Face",
        type: "folder",
        children: new Map(),
        showChildren: true,
      };
      root.children.set("main_face", mainFaceRoot);
      targetRoot = mainFaceRoot;
    }

    // 1. Process Poses (Main Face)
    poses.forEach((pose) => {
      const groupParts = pose.group
        ? pose.group.split("/").filter(Boolean)
        : [];
      let current = targetRoot;

      // Traverse/Create groups
      for (const part of groupParts) {
        current = getOrCreateChild(current, part, part);
      }

      // Add Pose Node
      const poseKey = `pose_${pose.id}`;
      current.children.set(poseKey, {
        id: `${current.id}/${poseKey}`,
        label: pose.name,
        type: "pose",
        children: new Map(),
        showChildren: false,
        data: pose,
      });
    });

    // 2. Process path-backed Rigs (Main Face)
    mainFaceRigEntries.forEach((entry) => {
      if (!enabledSources.has(entry.source)) {
        return;
      }
      const input = entry.input;
      const pathParts = input.path ? input.path.split("/").filter(Boolean) : [];

      let current = targetRoot;
      for (const part of pathParts) {
        current = getOrCreateChild(current, part, part);
      }

      const rigKey = `rig_${input.id}`;
      current.children.set(rigKey, {
        id: `${current.id}/${rigKey}`,
        label: input.label || input.id,
        type: "rig",
        children: new Map(),
        showChildren: false,
        data: entry,
      });
    });

    // --- Reference Face ---
    if (hasReferenceFace) {
      const refFaceRoot: TreeNode = {
        id: "ref_face",
        label: "Reference Face",
        type: "folder",
        children: new Map(),
        showChildren: true,
      };
      root.children.set("ref_face", refFaceRoot);

      if (referenceFace.isLoaded) {
        // Add standard inputs from Reference Face
        referenceRigEntries.forEach((entry) => {
          if (!enabledSources.has("reference")) {
            return;
          }
          const input = entry.input;
          const pathParts = input.path
            ? input.path.split("/").filter(Boolean)
            : [];
          let current = refFaceRoot;
          for (const part of pathParts) {
            current = getOrCreateChild(current, part, part);
          }

          const key = `ref_${input.id}`;
          current.children.set(key, {
            id: `${current.id}/${key}`,
            label: input.label || input.id,
            type: "rig",
            children: new Map(),
            showChildren: false,
            data: entry,
          });
        });
      } else {
        refFaceRoot.children.set("placeholder", {
          id: "ref_placeholder",
          label: referenceFace.isLoading ? "Loading..." : "Waiting for file...",
          type: "folder",
          children: new Map(),
          showChildren: false,
        });
      }
    }

    // Simplify tree structure (combine intermediate folders)
    const simplifiedChildren = new Map<string, TreeNode>();
    for (const [key, child] of root.children) {
      simplifiedChildren.set(key, simplifyNode(child));
    }
    root.children = simplifiedChildren;

    return root;
  }, [
    poses,
    enabledSources,
    mainFaceRigEntries,
    referenceRigEntries,
    referenceFace.isLoaded,
    referenceFace.isLoading,
    referenceFace.file,
  ]);

  // Filter tree based on search
  const visibleRoot = useMemo(() => {
    if (!search.trim()) return rootNode;

    const query = search.trim().toLowerCase();

    const visit = (node: TreeNode): TreeNode | null => {
      const label = node.label.toLowerCase();
      const nodeMatches = label.includes(query);

      const filteredChildren = new Map<string, TreeNode>();
      let hasMatchingChild = false;

      for (const [key, child] of node.children) {
        const filteredChild = visit(child);
        if (filteredChild) {
          filteredChildren.set(key, filteredChild);
          hasMatchingChild = true;
        }
      }

      if (nodeMatches || hasMatchingChild) {
        // If it's a folder, we need to clone it to update children map.
        // We also want to ensure it's expanded if it has matching children.
        return {
          ...node,
          children: filteredChildren,
          // When searching, we generally want to see the results, so effectively treated as expanded
          // But tree expansion state is managed separately.
        };
      }

      return null;
    };

    // Filter children of root
    const filteredRootChildren = new Map<string, TreeNode>();
    for (const [key, child] of rootNode.children) {
      const filteredChild = visit(child);
      if (filteredChild) {
        filteredRootChildren.set(key, filteredChild);
      }
    }

    return {
      ...rootNode,
      children: filteredRootChildren,
    };
  }, [rootNode, search]);

  // Auto-expand folders when searching
  useEffect(() => {
    if (!search.trim()) return;

    const idsToExpand = new Set<string>();
    const visit = (node: TreeNode) => {
      // Expand everything in the filtered tree
      idsToExpand.add(node.id);
      for (const child of node.children.values()) {
        visit(child);
      }
    };
    for (const child of visibleRoot.children.values()) {
      visit(child);
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      idsToExpand.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleRoot, search]);

  const handleToggle = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleAction = (node: TreeNode, action: string) => {
    if (node.type === "pose" && action === "play") {
      const poseData = node.data as PoseDefinition;
      applyPose(poseData.id);
    }
  };

  const handleSelect = (node: TreeNode) => {
    if (node.type === "pose") {
      const poseData = node.data as PoseDefinition;
      if (onSelectPose) {
        onSelectPose(poseData.id);
      } else {
        selectPose(poseData.id);
      }
      applyPose(poseData.id); // Auto-play on selection
      // When selecting logic, we might also want to clear rig selection?
      onSelectRig?.(null);
    } else if (node.type === "rig") {
      const rigData = node.data as RigNodeData;
      onSelectRig?.(rigData.input.id);
    }
  };

  const handleCreate = () => {
    const newInput = handleCreateCustomStandardInput(search);
    if (newInput) {
      onSelectRig?.(newInput.id);
      setSearch(""); // clear search on create? or keep it? VariableSelector kept it but here maybe clear is better or select it.
      // If we keep search, we see it.
    }
  };

  const showCreateOption =
    search.trim().length > 0 &&
    !managedStandardInputs.some(
      (m) => m.input.id.toLowerCase() === search.trim().toLowerCase(),
    );

  // Calculate total count
  const totalCount =
    poses.length + mainFaceRigEntries.length + referenceRigEntries.length;

  // Search input ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeSelection = useMemo(() => {
    if (selectedPoseId) return { type: "pose" as const, id: selectedPoseId };
    if (selectedRigId) return { type: "rig" as const, id: selectedRigId };
    return null;
  }, [selectedPoseId, selectedRigId]);

  const actions = (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-text-secondary hover:text-text-primary"
      onClick={() => {
        searchInputRef.current?.focus();
      }}
    >
      <Plus className="h-4 w-4" />
    </Button>
  );

  return (
    <Panel
      title="Variables"
      description="Manage poses and rig variables."
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
      badge={`${totalCount}`}
    >
      <div className="flex flex-col h-full gap-1 p-2">
        {/* Search Input */}
        <div className="flex items-center gap-2 px-1 mb-1">
          <PanelSearch
            ref={searchInputRef}
            value={search}
            onChange={setSearch}
            placeholder={search ? "Filter..." : "Search or create variable..."}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 px-1 mb-2">
          {(
            [
              ["auto", "Auto"],
              ["preset", "Preset"],
              ["custom", "Custom"],
              ["reference", "Reference"],
            ] as Array<[RigNodeSource, string]>
          ).map(([source, label]) => {
            const isActive = enabledSources.has(source);
            const count = sourceCounts[source];
            return (
              <button
                key={source}
                type="button"
                className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                  isActive
                    ? "border-border-hover bg-bg-panel text-text-primary"
                    : "border-border-default text-text-muted hover:text-text-primary"
                }`}
                onClick={() => {
                  setEnabledSources((previous) => {
                    const next = new Set(previous);
                    if (next.has(source)) {
                      next.delete(source);
                    } else {
                      next.add(source);
                    }
                    return next;
                  });
                }}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Create Option */}
          {showCreateOption && (
            <div
              className="flex items-center gap-2 px-2 py-1.5 mb-2 mx-1 rounded cursor-pointer hover:bg-accent-subtle text-text-secondary hover:text-text-primary group border border-dashed border-border-default hover:border-accent/30 transition-all"
              onClick={handleCreate}
            >
              <div className="flex items-center justify-center w-5 h-5 rounded-full bg-accent-subtle text-accent group-hover:scale-110 transition-transform">
                <Plus size={12} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium truncate">
                  Create "<span className="text-accent">{search}</span>"
                </span>
                <span className="text-[10px] text-text-muted">
                  Create and select new variable
                </span>
              </div>
            </div>
          )}

          {visibleRoot.children.size === 0 && !showCreateOption ? (
            <EmptyState
              icon={Search}
              iconSize={18}
              title={
                search.trim().length > 0 ? "No results" : "No variables defined"
              }
              description={
                search.trim().length > 0
                  ? `No variables found matching "${search}"`
                  : "Create new variables or import a model with poses."
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
          ) : (
            Array.from(visibleRoot.children.values())
              .sort((a, b) => {
                if (a.type === "folder" && b.type !== "folder") return -1;
                if (a.type !== "folder" && b.type === "folder") return 1;
                return a.label.localeCompare(b.label);
              })
              .map((child) => (
                <TreeRowWrapper
                  key={child.id}
                  node={child}
                  depth={0}
                  expanded={expandedIds}
                  onToggle={handleToggle}
                  onAction={handleAction}
                  onSelect={handleSelect}
                  selection={activeSelection}
                  searchQuery={search}
                />
              ))
          )}
        </div>
      </div>
    </Panel>
  );
}
