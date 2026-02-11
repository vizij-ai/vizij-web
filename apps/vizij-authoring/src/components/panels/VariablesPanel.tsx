import { useMemo, useState, useEffect, useRef } from "react";
import {
  Plus,
  Folder,
  Zap,
  Activity,
  Play,
  Search,
  Sliders,
  RotateCcw,
} from "lucide-react";
import type { StandardRigInput } from "@vizij/utils";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { PanelSearch, TreeRow } from "../ui";
import { Modal } from "../ui/Modal";
import { Slider } from "../ui/Slider";
import { NumberField } from "../ui/NumberField";
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

interface PoseGroupNodeData {
  kind: "pose-group";
  groupPath: string;
}

type TreeNodeData = PoseDefinition | RigNodeData | PoseGroupNodeData;

interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  children: Map<string, TreeNode>;
  showChildren: boolean; // Default expansion state
  data?: TreeNodeData;
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

function collectPoseIds(node: TreeNode): string[] {
  const ids: string[] = [];
  const visit = (candidate: TreeNode) => {
    if (candidate.type === "pose") {
      const pose = candidate.data as PoseDefinition | undefined;
      if (pose?.id) {
        ids.push(pose.id);
      }
      return;
    }
    candidate.children.forEach((child) => visit(child));
  };
  visit(node);
  return ids;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
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
        (node.data as RigNodeData)?.input?.id === selection.id));

  // Determine Icon
  let Icon = Folder;
  if (node.type === "pose") Icon = Activity;
  else if (node.type === "rig") Icon = Zap;

  // Determine Icon Color
  let iconClass = "text-text-muted";
  if (node.type === "pose") iconClass = "text-purple-400";
  else if (node.type === "rig") iconClass = "text-yellow-400";
  else if (
    node.type === "folder" &&
    (node.data as PoseGroupNodeData | undefined)?.kind === "pose-group"
  )
    iconClass = "text-purple-300";

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

          {node.type === "folder" &&
            (node.data as PoseGroupNodeData | undefined)?.kind ===
              "pose-group" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "inspect-pose-group");
                }}
                title="Inspect Pose Group"
              >
                <Sliders size={10} />
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
  const {
    poses,
    applyPose,
    selectPose,
    selectedPoseId,
    createPose,
    neutralInputs,
    blendMode,
  } = usePoseRig();
  const {
    managedStandardInputs,
    handleCreateCustomStandardInput,
    applyStandardInputBatch,
    standardInputsById,
  } = useBindingAuthoring((state) => state);
  const referenceFace = useReferenceFace();
  const pendingPoseSelectionRef = useRef(false);
  const [poseGroupInspector, setPoseGroupInspector] = useState<{
    groupPath: string;
    label: string;
    poseIds: string[];
  } | null>(null);
  const [poseGroupWeights, setPoseGroupWeights] = useState<
    Record<string, number>
  >({});

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

  const poseLookup = useMemo(() => {
    const lookup = new Map<string, PoseDefinition>();
    poses.forEach((pose) => lookup.set(pose.id, pose));
    return lookup;
  }, [poses]);

  const activePoseGroupPoses = useMemo(() => {
    if (!poseGroupInspector) {
      return [] as PoseDefinition[];
    }
    return poseGroupInspector.poseIds
      .map((poseId) => poseLookup.get(poseId))
      .filter((pose): pose is PoseDefinition => Boolean(pose));
  }, [poseGroupInspector, poseLookup]);

  const resolveNeutralValue = (inputId: string) => {
    const neutral = neutralInputs[inputId];
    if (typeof neutral === "number" && Number.isFinite(neutral)) {
      return neutral;
    }
    const fallback = standardInputsById.get(inputId)?.defaultValue;
    if (typeof fallback === "number" && Number.isFinite(fallback)) {
      return fallback;
    }
    return 0;
  };

  const clampInputValue = (inputId: string, value: number) => {
    const input = standardInputsById.get(inputId);
    if (!input?.range) {
      return value;
    }
    const min = Number.isFinite(input.range.min) ? input.range.min : value;
    const max = Number.isFinite(input.range.max) ? input.range.max : value;
    return Math.max(min, Math.min(max, value));
  };

  const applyPoseGroupPreview = (
    groupPoses: PoseDefinition[],
    weights: Record<string, number>,
  ) => {
    const updates: Record<string, number> = {};
    managedStandardInputs.forEach((entry) => {
      updates[entry.input.id] = resolveNeutralValue(entry.input.id);
    });

    const affectedInputs = new Set<string>();
    groupPoses.forEach((pose) => {
      Object.keys(pose.values).forEach((inputId) =>
        affectedInputs.add(inputId),
      );
    });

    affectedInputs.forEach((inputId) => {
      const neutral = resolveNeutralValue(inputId);
      let totalWeight = 0;
      let totalWeightedDelta = 0;
      groupPoses.forEach((pose) => {
        const weight = clamp01(weights[pose.id] ?? 0);
        if (weight <= 0) {
          return;
        }
        const target = pose.values[inputId];
        const poseValue =
          typeof target === "number" && Number.isFinite(target)
            ? target
            : neutral;
        const delta = poseValue - neutral;
        if (Math.abs(delta) < 1e-6) {
          return;
        }
        totalWeight += weight;
        totalWeightedDelta += delta * weight;
      });

      let nextValue = neutral;
      if (blendMode === "additive") {
        nextValue = neutral + totalWeightedDelta;
      } else if (totalWeight > 0) {
        nextValue = neutral + totalWeightedDelta / Math.max(totalWeight, 1);
      }
      updates[inputId] = clampInputValue(inputId, nextValue);
    });

    applyStandardInputBatch(updates, { replace: true });
  };

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
      const groupPathParts: string[] = [];
      for (const part of groupParts) {
        groupPathParts.push(part);
        const groupPath = groupPathParts.join("/");
        current = getOrCreateChild(current, part, part);
        if (
          current.type === "folder" &&
          (!(current.data as PoseGroupNodeData | undefined) ||
            (current.data as PoseGroupNodeData | undefined)?.kind !==
              "pose-group")
        ) {
          current.data = {
            kind: "pose-group",
            groupPath,
          };
        }
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

  useEffect(() => {
    if (!pendingPoseSelectionRef.current || !selectedPoseId) {
      return;
    }
    if (selectedPoseId === "__pose_rig_neutral__") {
      return;
    }
    pendingPoseSelectionRef.current = false;
    if (onSelectPose) {
      onSelectPose(selectedPoseId);
    } else {
      selectPose(selectedPoseId);
    }
    onSelectRig?.(null);
  }, [onSelectPose, onSelectRig, selectPose, selectedPoseId]);

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
      return;
    }
    if (node.type === "folder" && action === "inspect-pose-group") {
      const folderData = node.data as PoseGroupNodeData | undefined;
      if (!folderData || folderData.kind !== "pose-group") {
        return;
      }
      const poseIds = collectPoseIds(node);
      if (poseIds.length === 0) {
        return;
      }
      setPoseGroupInspector({
        groupPath: folderData.groupPath,
        label: node.label,
        poseIds,
      });
      setPoseGroupWeights((previous) => {
        const next: Record<string, number> = {};
        poseIds.forEach((poseId) => {
          next[poseId] =
            selectedPoseId === poseId ? 1 : (previous[poseId] ?? 0);
        });
        return next;
      });
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

  const handleCreatePose = () => {
    pendingPoseSelectionRef.current = true;
    createPose();
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

  const groupTotalWeight = useMemo(
    () =>
      activePoseGroupPoses.reduce(
        (sum, pose) => sum + clamp01(poseGroupWeights[pose.id] ?? 0),
        0,
      ),
    [activePoseGroupPoses, poseGroupWeights],
  );

  const handlePoseGroupWeightChange = (poseId: string, nextWeight: number) => {
    const clamped = clamp01(nextWeight);
    setPoseGroupWeights((previous) => {
      const next = {
        ...previous,
        [poseId]: clamped,
      };
      applyPoseGroupPreview(activePoseGroupPoses, next);
      return next;
    });
  };

  const handlePoseGroupReset = () => {
    const next: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      next[pose.id] = 0;
    });
    setPoseGroupWeights(next);
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

  const handlePoseGroupSolo = (poseId: string) => {
    const next: Record<string, number> = {};
    activePoseGroupPoses.forEach((pose) => {
      next[pose.id] = pose.id === poseId ? 1 : 0;
    });
    setPoseGroupWeights(next);
    applyPoseGroupPreview(activePoseGroupPoses, next);
  };

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
    <>
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
              placeholder={
                search ? "Filter..." : "Search or create variable..."
              }
            />
          </div>
          <div className="flex items-center gap-1 px-1 mb-1">
            <Button
              variant="secondary"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1"
              onClick={handleCreatePose}
              title="Create a new pose and inspect it"
            >
              <Activity size={11} className="text-purple-400" />
              New Pose
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
              onClick={() => searchInputRef.current?.focus()}
              title="Create a new variable"
            >
              <Plus size={11} />
              New Variable
            </Button>
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
                  search.trim().length > 0
                    ? "No results"
                    : "No variables defined"
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
      <Modal
        open={poseGroupInspector !== null}
        onClose={() => setPoseGroupInspector(null)}
        title={
          poseGroupInspector
            ? `Pose Group Inspector · ${poseGroupInspector.label}`
            : "Pose Group Inspector"
        }
        maxWidth="xl"
      >
        {poseGroupInspector && activePoseGroupPoses.length > 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-text-muted">
              Preview combinations within this pose group using the current
              group blend mode (<span className="font-mono">{blendMode}</span>
              ). This stages a neutral baseline first, then applies the group
              vector.
            </p>
            <div className="flex items-center justify-between gap-2 rounded border border-border-default/60 bg-bg-panel/40 px-3 py-2">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Group Path
                </span>
                <span className="text-xs font-mono text-text-primary">
                  /{poseGroupInspector.groupPath}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-muted font-mono">
                  Total Weight: {groupTotalWeight.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1"
                  onClick={handlePoseGroupReset}
                  title="Reset all pose weights in this group"
                >
                  <RotateCcw size={11} />
                  Reset
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {activePoseGroupPoses.map((pose) => {
                const weight = clamp01(poseGroupWeights[pose.id] ?? 0);
                return (
                  <div
                    key={pose.id}
                    className="rounded border border-border-default/60 bg-bg-panel/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="text-xs text-text-primary truncate">
                          {pose.name}
                        </div>
                        <div className="text-[10px] text-text-muted font-mono truncate">
                          {pose.id}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handlePoseGroupSolo(pose.id)}
                          title="Solo this pose at 100%"
                        >
                          Solo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            if (onSelectPose) {
                              onSelectPose(pose.id);
                            } else {
                              selectPose(pose.id);
                            }
                            applyPose(pose.id);
                          }}
                          title="Select and play this pose"
                        >
                          Play
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Slider
                        min={0}
                        max={1}
                        step={0.01}
                        value={weight}
                        className="flex-1"
                        onChange={(value) =>
                          handlePoseGroupWeightChange(pose.id, value as number)
                        }
                      />
                      <div className="w-20 flex-shrink-0">
                        <NumberField
                          size="sm"
                          value={weight}
                          className="w-full bg-bg-input/80 border-border-default/80 text-right font-mono text-xs"
                          onChange={(value) =>
                            handlePoseGroupWeightChange(pose.id, value)
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Activity}
            iconSize={18}
            title="No Poses In Group"
            description="This folder does not currently contain pose entries."
            className="py-8"
          />
        )}
      </Modal>
    </>
  );
}
