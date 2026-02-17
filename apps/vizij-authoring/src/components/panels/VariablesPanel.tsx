import { useMemo, useState, useEffect, useRef } from "react";
import {
  Plus,
  Copy,
  Folder,
  Zap,
  Activity,
  Play,
  Search,
  Sliders,
  Users,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
  SELF_BINDING_ID,
} from "@vizij/utils";
import type { AnimatableBinding } from "@vizij/node-graph-authoring";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { PanelSearch, TreeRow, Tabs } from "../ui";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSceneComposer } from "../../scene/useSceneComposer";
import { useSharedVariableSyncContext } from "../../state/SharedVariableSyncContext";
import { isRigElementStandardInputPath } from "../../utils/rigElementInputs";
import type { PoseBlendMode, PoseDefinition } from "../../poseRig/types";
import type { ManagedStandardInput } from "../../types/standardInputs";
import type { PoseGroupInspectorSelection } from "../../types/poseGroupInspector";
import type {
  SharedVariableConflict,
  SharedVariableSyncPolicy,
} from "../../hooks/useSharedVariableSync";
import {
  collectDirectDownstreamRigInputs,
  collectRigDependents,
} from "../inspector/rigConnections";

// ----------------------------------------------------------------------------
// Types & Helper Functions
// ----------------------------------------------------------------------------

type NodeType = "folder" | "pose" | "rig";
type RigNodeSource = "auto" | "preset" | "custom" | "reference" | "shared";
type SurfaceTab = "variables" | "poses" | "pose-groups" | "drivers";

const UNASSIGNED_POSE_GROUP_PATH = "__unassigned__";
const UNASSIGNED_POSE_GROUP_LABEL = "Unassigned";

interface PoseGroupSummary {
  id: string;
  path: string;
  label: string;
  blendMode: PoseBlendMode;
  source: "configured" | "auto";
  poseIds: string[];
}

interface DriverNavigationTarget {
  kind: "rig" | "pose" | "pose-group" | "scene-object";
  id: string;
}

interface DriverListRow {
  id: string;
  label: string;
  direction: "incoming" | "outgoing";
  detail?: string;
  route: DriverNavigationTarget;
}

function normalizePoseGroupPath(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^\/+|\/+$/g, "");
}

function collectBindingInputIds(binding: AnimatableBinding): string[] {
  const ids = new Set<string>();
  if (
    binding.inputId &&
    binding.inputId !== SELF_BINDING_ID &&
    binding.inputId.trim().length > 0
  ) {
    ids.add(binding.inputId);
  }
  (binding.slots ?? []).forEach((slot) => {
    if (
      slot.inputId &&
      slot.inputId !== SELF_BINDING_ID &&
      slot.inputId.trim().length > 0
    ) {
      ids.add(slot.inputId);
    }
  });
  return Array.from(ids);
}

function poseGroupDisplayLabel(path: string): string {
  return path === UNASSIGNED_POSE_GROUP_PATH
    ? UNASSIGNED_POSE_GROUP_LABEL
    : path;
}

interface RigNodeData {
  input: StandardRigInput;
  source: RigNodeSource;
  disabled?: boolean;
  normalizedPath?: string;
  linkedMainInputId?: string | null;
  linkedReferenceInputId?: string | null;
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
  shared: "bg-teal-900/40 text-teal-200",
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

function filterTreeBySearch(rootNode: TreeNode, search: string): TreeNode {
  const trimmed = search.trim().toLowerCase();
  if (!trimmed) {
    return rootNode;
  }

  const visit = (node: TreeNode): TreeNode | null => {
    const label = node.label.toLowerCase();
    const matches = label.includes(trimmed);

    const filteredChildren = new Map<string, TreeNode>();
    let hasMatchingChild = false;

    for (const [key, child] of node.children) {
      const filteredChild = visit(child);
      if (filteredChild) {
        filteredChildren.set(key, filteredChild);
        hasMatchingChild = true;
      }
    }

    if (!matches && !hasMatchingChild) {
      return null;
    }

    return {
      ...node,
      children: filteredChildren,
    };
  };

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
  selection?: { type: "pose" | "rig" | "pose-group"; id: string } | null;
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
  const isPoseGroupFolder =
    node.type === "folder" &&
    (node.data as PoseGroupNodeData | undefined)?.kind === "pose-group";

  // Check selection
  const isSelected =
    selection &&
    ((node.type === "pose" &&
      selection.type === "pose" &&
      (node.data as PoseDefinition)?.id === selection.id) ||
      (node.type === "rig" &&
        selection.type === "rig" &&
        (node.data as RigNodeData)?.input?.id === selection.id) ||
      (isPoseGroupFolder &&
        selection.type === "pose-group" &&
        node.id === selection.id));

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
      onSelect={
        !hasChildren || isPoseGroupFolder ? () => onSelect?.(node) : undefined
      }
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

          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source === "reference" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "copy-to-main");
                }}
                title="Copy variable to main face"
              >
                <Copy size={10} />
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
  selectedPoseId?: string | null;
  selectedSceneId?: string | null;
  onSelectRig?: (id: string | null) => void;
  onSelectPose?: (id: string) => void;
  onSelectScene?: (id: string) => void;
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
  onSelectPoseGroup?: (selection: PoseGroupInspectorSelection | null) => void;
  activeSurfaceOverride?: SurfaceTab;
  availableSurfaces?: SurfaceTab[];
}

export function VariablesPanel({
  selectedRigId,
  selectedPoseId: selectedPoseIdFromParent,
  selectedSceneId,
  onSelectRig,
  onSelectPose,
  onSelectScene,
  selectedPoseGroup,
  onSelectPoseGroup,
  activeSurfaceOverride,
  availableSurfaces,
}: VariablesPanelProps) {
  const {
    poses,
    applyPose,
    selectPose,
    selectedPoseId: selectedPoseIdFromAuthoring,
    createPose,
    createPoseGroup,
    renamePoseGroup,
    deletePoseGroup,
    crossGroupBlendMode,
    blendMode,
    setCrossGroupBlendMode,
    updatePoseGroup,
    poseConfigDraft,
  } = usePoseRig();
  const selectedPoseId =
    selectedPoseIdFromParent ?? selectedPoseIdFromAuthoring;
  const { objects, getNode } = useSceneComposer();
  const [search, setSearch] = useState("");
  const poseGroupBlendModeFallback =
    poseConfigDraft?.poseGroups?.find((group) => group.blendMode)?.blendMode ??
    blendMode ??
    "average";
  const poseGroupsFromConfig = poseConfigDraft?.poseGroups ?? [];

  const poseNameById = useMemo(
    () => new Map(poses.map((pose) => [pose.id, pose.name])),
    [poses],
  );

  const poseGroups = useMemo(() => {
    const byId = new Map<string, string>();
    const groupsByPath = new Map<string, PoseGroupSummary>();

    const declareGroup = (
      path: string,
      label: string,
      source: "configured" | "auto",
      id: string,
    ) => {
      if (groupsByPath.has(path)) {
        return;
      }
      groupsByPath.set(path, {
        id,
        path,
        label,
        blendMode: poseGroupBlendModeFallback,
        source,
        poseIds: [],
      });
      if (path !== UNASSIGNED_POSE_GROUP_PATH) {
        byId.set(id, path);
      }
    };

    poseGroupsFromConfig.forEach((group) => {
      const candidatePath =
        normalizePoseGroupPath(group.path) ||
        normalizePoseGroupPath(group.name) ||
        normalizePoseGroupPath(group.id);
      const path = candidatePath || UNASSIGNED_POSE_GROUP_PATH;
      declareGroup(
        path,
        poseGroupDisplayLabel(path),
        "configured",
        group.id || `configured:${path}`,
      );
      const entry = groupsByPath.get(path);
      if (entry) {
        entry.blendMode =
          group.blendMode === "additive" || group.blendMode === "average"
            ? group.blendMode
            : poseGroupBlendModeFallback;
      }
      if (group.id) {
        byId.set(group.id, path);
      }
    });

    const resolvePoseGroupPath = (pose: PoseDefinition): string => {
      if (pose.groupId && byId.has(pose.groupId)) {
        return byId.get(pose.groupId)!;
      }
      const normalized = normalizePoseGroupPath(pose.group);
      return normalized || UNASSIGNED_POSE_GROUP_PATH;
    };

    poses.forEach((pose) => {
      const path = resolvePoseGroupPath(pose);
      let group = groupsByPath.get(path);
      if (!group) {
        group = {
          id: `auto:${path}`,
          path,
          label: poseGroupDisplayLabel(path),
          blendMode: poseGroupBlendModeFallback,
          source: "auto",
          poseIds: [],
        };
        groupsByPath.set(path, group);
      }
      group.poseIds.push(pose.id);
    });

    return Array.from(groupsByPath.values()).filter(
      (group) => group.poseIds.length > 0,
    );
  }, [blendMode, poseGroupBlendModeFallback, poseGroupsFromConfig, poses]);

  const poseGroupByPoseId = useMemo(() => {
    const next = new Map<string, string>();
    poseGroups.forEach((group) => {
      group.poseIds.forEach((poseId) => {
        next.set(poseId, group.path);
      });
    });
    return next;
  }, [poseGroups]);

  const selectedPoseGroupPath = selectedPoseId
    ? (poseGroupByPoseId.get(selectedPoseId) ?? null)
    : null;

  const visiblePoseGroups = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) {
      return poseGroups;
    }
    return poseGroups.filter((group) => {
      if (
        poseGroupDisplayLabel(group.path).toLowerCase().includes(trimmed) ||
        group.path.toLowerCase().includes(trimmed) ||
        group.poseIds.some(
          (poseId) =>
            poseId.toLowerCase().includes(trimmed) ||
            (poseNameById.get(poseId)?.toLowerCase().includes(trimmed) ??
              false),
        )
      ) {
        return true;
      }
      return false;
    });
  }, [poseGroups, poseNameById, search]);

  const {
    managedStandardInputs,
    standardInputsByPath,
    standardInputsById,
    bindings,
    inputBindings,
    handleCreateCustomStandardInput,
    handleUpdateStandardInput,
  } = useBindingAuthoring((state) => state);
  const referenceFace = useReferenceFace();
  const {
    policy: sharedSyncPolicy,
    setPolicy: setSharedSyncPolicy,
    conflicts: sharedSyncConflicts,
    resolveConflict: resolveSharedSyncConflict,
    dismissConflict: dismissSharedSyncConflict,
    outOfSyncCount: sharedOutOfSyncCount,
  } = useSharedVariableSyncContext();
  const pendingPoseSelectionRef = useRef(false);
  const allSurfaces = useMemo(
    () => availableSurfaces ?? ["variables", "poses", "pose-groups"],
    [availableSurfaces],
  );
  const [activeSurfaceState, setActiveSurfaceState] = useState<SurfaceTab>(
    () => allSurfaces[0] ?? "variables",
  );
  const activeSurface = activeSurfaceOverride ?? activeSurfaceState;

  useEffect(() => {
    if (activeSurfaceOverride) {
      return;
    }
    if (!allSurfaces.includes(activeSurfaceState)) {
      setActiveSurfaceState(allSurfaces[0] ?? "variables");
    }
  }, [activeSurfaceOverride, allSurfaces, activeSurfaceState]);

  useEffect(() => {
    if (activeSurfaceOverride) {
      setActiveSurfaceState(activeSurfaceOverride);
    }
  }, [activeSurfaceOverride]);

  const [enabledSources, setEnabledSources] = useState<Set<RigNodeSource>>(
    () => new Set(["auto", "preset", "custom", "shared", "reference"]),
  );

  // State for tree expansion
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["root"]),
  );

  const mainFaceRigEntries = useMemo(() => {
    return managedStandardInputs
      .filter((entry) => Boolean(entry.input.path?.trim()))
      .filter((entry) => !isRigElementStandardInputPath(entry.input.path))
      .map((entry) => ({
        input: entry.input,
        source: resolveManagedSource(entry),
        disabled: entry.disabled,
      }));
  }, [managedStandardInputs]);

  const referenceRigEntries = useMemo(() => {
    const mainByPath = new Map<string, StandardRigInput>();
    mainFaceRigEntries.forEach((entry) => {
      const normalized = normalizeStandardRigInputPath(entry.input.path);
      mainByPath.set(normalized, entry.input);
    });
    return referenceFace.standardInputs
      .filter((entry) => Boolean(entry.path?.trim()))
      .filter((entry) => !isRigElementStandardInputPath(entry.path))
      .map((entry) => {
        const normalizedPath = normalizeStandardRigInputPath(entry.path);
        const linkedMain = mainByPath.get(normalizedPath);
        return {
          input: entry,
          source: "reference" as const,
          normalizedPath,
          linkedMainInputId: linkedMain?.id ?? null,
        };
      });
  }, [mainFaceRigEntries, referenceFace.standardInputs]);

  const sharedRigEntries = useMemo(() => {
    if (!referenceFace.file || !referenceFace.isLoaded) {
      return [] as RigNodeData[];
    }
    const referenceByPath = new Map<string, StandardRigInput>();
    referenceRigEntries.forEach((entry) => {
      const normalized = entry.normalizedPath
        ? normalizeStandardRigInputPath(entry.normalizedPath)
        : normalizeStandardRigInputPath(entry.input.path);
      referenceByPath.set(normalized, entry.input);
    });
    const entries: RigNodeData[] = [];
    mainFaceRigEntries.forEach((entry) => {
      const normalizedPath = normalizeStandardRigInputPath(entry.input.path);
      const referenceInput = referenceByPath.get(normalizedPath);
      if (!referenceInput) {
        return;
      }
      entries.push({
        input: entry.input,
        source: "shared",
        disabled: entry.disabled,
        normalizedPath,
        linkedMainInputId: entry.input.id,
        linkedReferenceInputId: referenceInput.id,
      });
    });
    return entries;
  }, [
    mainFaceRigEntries,
    referenceFace.file,
    referenceFace.isLoaded,
    referenceRigEntries,
  ]);

  const sceneTargetObjectLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    const owners = new Map<string, string>();
    objects.forEach((node) => {
      node.features.forEach((feature) => {
        feature.components.forEach((component) => {
          if (!component.targetId) return;
          const componentLabel =
            component.label?.trim() ||
            component.componentKey ||
            component.componentKey?.toString() ||
            "Value";
          labels.set(
            component.targetId,
            `${node.name} · ${feature.label} ${componentLabel}`,
          );
          owners.set(component.targetId, node.id);
        });
      });
    });
    return { labels, owners };
  }, [objects]);

  const selectedSceneNode = selectedSceneId ? getNode(selectedSceneId) : null;

  const selectedPoseEntry = useMemo(() => {
    if (!selectedPoseId) {
      return null;
    }
    return poses.find((pose) => pose.id === selectedPoseId) ?? null;
  }, [poses, selectedPoseId]);

  const driverIncomingRows = useMemo(() => {
    if (activeSurface !== "drivers") {
      return [];
    }

    const rows: DriverListRow[] = [];

    if (selectedRigId) {
      if (isRigElementStandardInputPath(selectedRigId)) {
        return [];
      }
      Object.entries(inputBindings).forEach(([targetInputId, binding]) => {
        if (targetInputId === selectedRigId) {
          return;
        }
        const inputIds = collectBindingInputIds(binding);
        if (!inputIds.includes(selectedRigId)) {
          return;
        }
        const input = standardInputsById.get(targetInputId);
        if (isRigElementStandardInputPath(input?.path)) {
          return;
        }
        rows.push({
          id: targetInputId,
          label: input?.label || input?.path || targetInputId,
          direction: "incoming",
          detail: input?.path || targetInputId,
          route: { kind: "rig", id: targetInputId },
        });
      });
      return rows;
    }

    if (selectedPoseId && selectedPoseEntry) {
      const groupPath = selectedPoseGroupPath;
      if (groupPath) {
        const matchingGroup = poseGroups.find(
          (group) => group.path === groupPath,
        );
        if (matchingGroup) {
          rows.push({
            id: matchingGroup.id,
            label: matchingGroup.label,
            direction: "incoming",
            detail: `Pose Group (${groupPath})`,
            route: { kind: "pose-group", id: matchingGroup.id },
          });
        }
      }
      return rows;
    }

    if (selectedSceneNode) {
      const targetIds = selectedSceneNode.features.flatMap((feature) =>
        feature.components
          .map((component) => component.targetId)
          .filter((targetId): targetId is string => Boolean(targetId)),
      );
      const incomingMap = new Map<
        string,
        { detail: string; source: string; row: DriverListRow }
      >();
      targetIds.forEach((targetId) => {
        const binding = bindings[targetId];
        if (!binding) {
          return;
        }
        const inputIds = collectBindingInputIds(binding);
        for (const sourceId of inputIds) {
          const sourceInput = standardInputsById.get(sourceId);
          if (!sourceInput) {
            continue;
          }
          if (isRigElementStandardInputPath(sourceInput.path)) {
            continue;
          }
          const existing = incomingMap.get(sourceId);
          const targetLabel =
            sceneTargetObjectLabelById.labels.get(targetId) ?? targetId;
          if (existing) {
            existing.detail = `${existing.detail} + ${targetLabel}`;
            continue;
          }
          incomingMap.set(sourceId, {
            detail: targetLabel,
            source: sourceId,
            row: {
              id: sourceId,
              label: sourceInput.label || sourceInput.path || sourceId,
              direction: "incoming",
              detail: targetLabel,
              route: { kind: "rig", id: sourceId },
            },
          });
        }
      });
      return Array.from(incomingMap.values()).map((entry) => entry.row);
    }

    return rows;
  }, [
    activeSurface,
    bindings,
    inputBindings,
    poseGroups,
    selectedPoseEntry,
    selectedPoseGroupPath,
    selectedPoseId,
    selectedRigId,
    selectedSceneNode,
    standardInputsById,
    selectedSceneId,
    sceneTargetObjectLabelById.labels,
  ]);

  const driverOutgoingRows = useMemo(() => {
    if (activeSurface !== "drivers") {
      return [];
    }

    const rows: DriverListRow[] = [];

    if (selectedRigId) {
      const directChildren = collectDirectDownstreamRigInputs({
        selectedRigId,
        inputBindings,
        standardInputsById,
      });
      directChildren.forEach((entry) => {
        if (isRigElementStandardInputPath(entry.id)) {
          return;
        }
        const source = standardInputsById.get(entry.id);
        rows.push({
          id: entry.id,
          label: entry.label,
          direction: "outgoing",
          detail: source?.path || entry.id,
          route: { kind: "rig", id: entry.id },
        });
      });

      const dependents = collectRigDependents({
        selectedRigId,
        bindings,
        inputBindings,
        objects,
      });
      dependents.forEach((entry) => {
        const ownerId = sceneTargetObjectLabelById.owners.get(entry.targetId);
        if (!ownerId) {
          return;
        }
        rows.push({
          id: entry.targetId,
          label: entry.name,
          direction: "outgoing",
          detail: `Scene property`,
          route: {
            kind: "scene-object",
            id: ownerId,
          },
        });
      });
      return rows;
    }

    if (selectedPoseId && selectedPoseEntry) {
      Object.entries(selectedPoseEntry.values).forEach(([inputId]) => {
        const input = standardInputsById.get(inputId);
        if (isRigElementStandardInputPath(input?.path)) {
          return;
        }
        rows.push({
          id: inputId,
          label: input?.label || input?.path || inputId,
          direction: "outgoing",
          detail: input?.path || inputId,
          route: { kind: "rig", id: inputId },
        });
      });
      return rows;
    }

    return rows;
  }, [
    activeSurface,
    bindings,
    selectedPoseEntry,
    selectedPoseId,
    selectedRigId,
    inputBindings,
    standardInputsById,
    objects,
    sceneTargetObjectLabelById.owners,
  ]);

  const sourceCounts = useMemo(() => {
    const counts: Record<RigNodeSource, number> = {
      auto: 0,
      preset: 0,
      custom: 0,
      reference: 0,
      shared: 0,
    };
    mainFaceRigEntries.forEach((entry) => {
      counts[entry.source] += 1;
    });
    counts.reference = referenceRigEntries.length;
    counts.shared = sharedRigEntries.length;
    return counts;
  }, [mainFaceRigEntries, referenceRigEntries.length, sharedRigEntries.length]);

  const applySharedSyncPolicy = (nextPolicy: SharedVariableSyncPolicy) => {
    setSharedSyncPolicy(nextPolicy);
  };

  const resolveConflict = (
    conflict: SharedVariableConflict,
    winner: "main" | "reference",
  ) => {
    resolveSharedSyncConflict(conflict.path, winner);
  };

  const copyReferenceVariableToMain = (
    referenceEntry: RigNodeData,
    options?: { select?: boolean },
  ): string | null => {
    const select = options?.select ?? true;
    if (referenceEntry.source !== "reference") {
      return null;
    }
    if (referenceEntry.linkedMainInputId) {
      if (select) {
        onSelectRig?.(referenceEntry.linkedMainInputId);
        onSelectPoseGroup?.(null);
      }
      return referenceEntry.linkedMainInputId;
    }
    const normalizedPath = referenceEntry.normalizedPath
      ? normalizeStandardRigInputPath(referenceEntry.normalizedPath)
      : normalizeStandardRigInputPath(referenceEntry.input.path);
    const existing = standardInputsByPath.get(normalizedPath);
    if (existing) {
      if (select) {
        onSelectRig?.(existing.id);
        onSelectPoseGroup?.(null);
      }
      return existing.id;
    }
    const created = handleCreateCustomStandardInput(normalizedPath);
    if (!created) {
      return null;
    }
    handleUpdateStandardInput(created.id, {
      label: referenceEntry.input.label,
      defaultValue: referenceEntry.input.defaultValue,
      range: {
        min: referenceEntry.input.range.min,
        max: referenceEntry.input.range.max,
      },
      sourceId: referenceEntry.input.sourceId ?? null,
    });
    if (select) {
      onSelectRig?.(created.id);
      onSelectPoseGroup?.(null);
    }
    return created.id;
  };

  // Build Variables tree
  const variablesRootNode = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      label: "Variables",
      type: "folder",
      children: new Map(),
      showChildren: true,
    };

    const hasReferenceFace = !!referenceFace.file;

    // Shared variables root (when both faces expose the same path-backed input)
    if (
      hasReferenceFace &&
      enabledSources.has("shared") &&
      referenceFace.isLoaded
    ) {
      const sharedRoot: TreeNode = {
        id: "shared",
        label: "Shared",
        type: "folder",
        children: new Map(),
        showChildren: true,
      };
      sharedRigEntries.forEach((entry) => {
        const normalized = entry.normalizedPath
          ? normalizeStandardRigInputPath(entry.normalizedPath)
          : normalizeStandardRigInputPath(entry.input.path);
        const pathParts = normalized.split("/").filter(Boolean);
        let current = sharedRoot;
        for (const part of pathParts) {
          current = getOrCreateChild(current, part, part);
        }
        const key = `shared_${entry.input.id}`;
        current.children.set(key, {
          id: `${current.id}/${key}`,
          label: entry.input.label || entry.input.id,
          type: "rig",
          children: new Map(),
          showChildren: false,
          data: entry,
        });
      });
      if (sharedRoot.children.size > 0) {
        root.children.set("shared", sharedRoot);
      }
    }

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
    // 1. Process path-backed Rigs (Main Face)
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
    enabledSources,
    mainFaceRigEntries,
    sharedRigEntries,
    referenceRigEntries,
    referenceFace.isLoaded,
    referenceFace.isLoading,
    referenceFace.file,
  ]);

  // Build Poses tree
  const posesRootNode = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      label: "Poses",
      type: "folder",
      children: new Map(),
      showChildren: true,
    };

    const targetRoot: TreeNode = root;

    poses.forEach((pose) => {
      const groupParts = pose.group
        ? pose.group.split("/").filter(Boolean)
        : [];
      let current = targetRoot;

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

    const simplifiedChildren = new Map<string, TreeNode>();
    for (const [key, child] of root.children) {
      simplifiedChildren.set(key, simplifyNode(child));
    }
    root.children = simplifiedChildren;

    return root;
  }, [poses]);

  const visibleVariablesRoot = useMemo(
    () => filterTreeBySearch(variablesRootNode, search),
    [variablesRootNode, search],
  );
  const visiblePosesRoot = useMemo(
    () => filterTreeBySearch(posesRootNode, search),
    [posesRootNode, search],
  );
  const visibleRoot =
    activeSurface === "poses" ? visiblePosesRoot : visibleVariablesRoot;

  // Auto-expand folders when searching
  useEffect(() => {
    if (
      (activeSurface !== "variables" && activeSurface !== "poses") ||
      !search.trim()
    ) {
      return;
    }

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
  }, [activeSurface, visibleRoot, search]);

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

  const openPoseGroupInspector = (node: TreeNode) => {
    const folderData = node.data as PoseGroupNodeData | undefined;
    if (!folderData || folderData.kind !== "pose-group") {
      return;
    }
    const poseIds = collectPoseIds(node);
    if (poseIds.length === 0) {
      return;
    }
    const matchingGroup = poseGroups.find(
      (group) => group.path === folderData.groupPath,
    );
    const nodeId = matchingGroup?.id ?? node.id;
    onSelectPoseGroup?.({
      groupPath: folderData.groupPath,
      label: node.label,
      groupId: matchingGroup?.source === "configured" ? matchingGroup.id : null,
      poseIds,
      nodeId,
    });
  };

  const selectPoseGroup = (group: PoseGroupSummary) => {
    onSelectPoseGroup?.({
      groupPath: group.path,
      label: group.label,
      groupId: group.source === "configured" ? group.id : null,
      poseIds: group.poseIds,
      nodeId: group.id,
    });
    onSelectRig?.(null);
  };

  const handlePoseGroupMembershipToggle = (group: PoseGroupSummary) => {
    if (!selectedPoseId || selectedPoseId === "__pose_rig_neutral__") {
      return;
    }
    const isMember = selectedPoseGroupPath === group.path;
    if (isMember) {
      updatePoseGroup(selectedPoseId, null);
      return;
    }
    updatePoseGroup(
      selectedPoseId,
      group.path === UNASSIGNED_POSE_GROUP_PATH ? null : group.path,
    );
  };

  const handleAction = (node: TreeNode, action: string) => {
    if (node.type === "pose" && action === "play") {
      const poseData = node.data as PoseDefinition;
      applyPose(poseData.id);
      return;
    }
    if (node.type === "rig" && action === "copy-to-main") {
      const rigData = node.data as RigNodeData;
      if (rigData.source === "reference") {
        copyReferenceVariableToMain(rigData, { select: true });
      }
      return;
    }
    if (node.type === "folder" && action === "inspect-pose-group") {
      openPoseGroupInspector(node);
    }
  };

  const handleSelect = (node: TreeNode) => {
    if (node.type === "pose") {
      const poseData = node.data as PoseDefinition;
      onSelectPoseGroup?.(null);
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
      if (rigData.source === "reference") {
        if (rigData.linkedMainInputId) {
          onSelectRig?.(rigData.linkedMainInputId);
        } else {
          onSelectRig?.(null);
        }
      } else {
        onSelectRig?.(rigData.input.id);
      }
      onSelectPoseGroup?.(null);
    } else if (
      node.type === "folder" &&
      (node.data as PoseGroupNodeData | undefined)?.kind === "pose-group"
    ) {
      openPoseGroupInspector(node);
      onSelectRig?.(null);
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

  const handleCopyReferenceToMain = () => {
    let firstCopied: string | null = null;
    referenceRigEntries.forEach((entry) => {
      if (entry.linkedMainInputId) {
        return;
      }
      const copied = copyReferenceVariableToMain(entry, { select: false });
      if (!firstCopied && copied) {
        firstCopied = copied;
      }
    });
    if (firstCopied) {
      onSelectRig?.(firstCopied);
      onSelectPoseGroup?.(null);
    }
  };

  const handleCreatePoseGroup = () => {
    const value = window.prompt("Create pose group", "");
    if (!value) {
      return;
    }
    const normalized = normalizePoseGroupPath(value);
    if (!normalized) {
      return;
    }
    createPoseGroup(normalized);
  };

  const handleRenameSelectedPoseGroup = () => {
    const current = selectedPoseGroup;
    if (!current?.groupId) {
      return;
    }
    const normalizedCurrent = normalizePoseGroupPath(current.groupPath);
    const value = window.prompt("Rename pose group", normalizedCurrent || "");
    if (!value) {
      return;
    }
    const nextPath = normalizePoseGroupPath(value);
    if (!nextPath) {
      return;
    }
    renamePoseGroup(current.groupId, nextPath);
    onSelectPoseGroup?.({
      ...current,
      groupPath: nextPath,
      label: poseGroupDisplayLabel(nextPath),
    });
  };

  const handleDeleteSelectedPoseGroup = () => {
    const current = selectedPoseGroup;
    if (!current?.groupId) {
      return;
    }
    const ok = window.confirm(
      `Delete pose group "${current.label}" and unassign its poses?`,
    );
    if (!ok) {
      return;
    }
    deletePoseGroup(current.groupId);
    onSelectPoseGroup?.(null);
  };

  const showCreateOption =
    activeSurface === "variables" &&
    search.trim().length > 0 &&
    !managedStandardInputs.some(
      (m) => m.input.id.toLowerCase() === search.trim().toLowerCase(),
    );

  const variableItemCount =
    mainFaceRigEntries.length +
    referenceRigEntries.length +
    sharedRigEntries.length;
  const poseItemCount = poses.length;
  const poseGroupItemCount = poseGroups.length;
  const driverItemCount = driverIncomingRows.length + driverOutgoingRows.length;
  const poseGroupsForSurface = useMemo(() => {
    const list = [...visiblePoseGroups];
    list.sort((a, b) => {
      if (a.source !== b.source) {
        return a.source === "configured" ? -1 : 1;
      }
      return poseGroupDisplayLabel(a.path).localeCompare(
        poseGroupDisplayLabel(b.path),
      );
    });
    return list;
  }, [visiblePoseGroups]);
  const totalCount =
    activeSurface === "variables"
      ? variableItemCount
      : activeSurface === "poses"
        ? poseItemCount
        : activeSurface === "pose-groups"
          ? poseGroupItemCount
          : driverItemCount;

  const uncopiedReferenceCount = referenceRigEntries.filter(
    (entry) => !entry.linkedMainInputId,
  ).length;

  // Search input ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeSelection = useMemo(() => {
    if (activeSurface === "pose-groups" && selectedPoseGroup?.nodeId) {
      return {
        type: "pose-group" as const,
        id: selectedPoseGroup.nodeId,
      };
    }
    if (activeSurface === "poses") {
      if (selectedPoseGroup?.nodeId) {
        return {
          type: "pose-group" as const,
          id: selectedPoseGroup.nodeId,
        };
      }
      if (selectedPoseId) return { type: "pose" as const, id: selectedPoseId };
      return null;
    }
    if (selectedPoseGroup?.nodeId) {
      return {
        type: "pose-group" as const,
        id: selectedPoseGroup.nodeId,
      };
    }
    if (selectedPoseId) return { type: "pose" as const, id: selectedPoseId };
    if (selectedRigId) return { type: "rig" as const, id: selectedRigId };
    return null;
  }, [activeSurface, selectedPoseGroup?.nodeId, selectedPoseId, selectedRigId]);

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

  const surfaceTabs = allSurfaces.map((id) => {
    if (id === "variables") {
      return { id, label: "Variables", badge: variableItemCount };
    }
    if (id === "poses") {
      return { id, label: "Poses", badge: poseItemCount };
    }
    if (id === "pose-groups") {
      return { id, label: "Pose Groups", badge: poseGroupItemCount };
    }
    return { id, label: "Drivers", badge: driverItemCount };
  });

  const surfaceForTab = (id: string): SurfaceTab =>
    id === "poses"
      ? "poses"
      : id === "pose-groups"
        ? "pose-groups"
        : id === "drivers"
          ? "drivers"
          : "variables";

  const selectedPoseName = selectedPoseId
    ? (poseNameById.get(selectedPoseId) ?? selectedPoseId)
    : null;

  return (
    <Panel
      title={
        activeSurface === "variables"
          ? "Variables"
          : activeSurface === "poses"
            ? "Poses"
            : activeSurface === "pose-groups"
              ? "Pose Groups"
              : "Drivers"
      }
      description={
        activeSurface === "variables"
          ? "Manage rig variables and references."
          : activeSurface === "poses"
            ? "Manage pose entries."
            : activeSurface === "pose-groups"
              ? "Review pose groups and move selected poses."
              : "Inspect what is driving the current item and what it drives."
      }
      className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
      actions={actions}
      badge={`${totalCount}`}
    >
      <Tabs
        items={surfaceTabs}
        value={activeSurface}
        onValueChange={(id) => {
          if (activeSurfaceOverride) {
            return;
          }
          setActiveSurfaceState(surfaceForTab(id));
        }}
        renderPanel={(id) => {
          const isVariables = id === "variables";
          const isPoseGroups = id === "pose-groups";
          const isPoses = id === "poses";
          const isDrivers = id === "drivers";
          const searchQuery = search.trim().toLowerCase();

          const driverQuery = (row: DriverListRow) => {
            if (!searchQuery) {
              return true;
            }
            const matchesLabel = row.label.toLowerCase().includes(searchQuery);
            const matchesDetail = row.detail
              ?.toLowerCase()
              .includes(searchQuery);
            return matchesLabel || !!matchesDetail;
          };

          const visibleIncomingDrivers = driverIncomingRows.filter(driverQuery);
          const visibleOutgoingDrivers = driverOutgoingRows.filter(driverQuery);

          const handleOpenDriverTarget = (row: DriverListRow) => {
            if (row.route.kind === "rig") {
              onSelectRig?.(row.route.id);
              return;
            }
            if (row.route.kind === "pose") {
              onSelectPose?.(row.route.id);
              return;
            }
            if (row.route.kind === "pose-group") {
              const matchingGroup = poseGroups.find(
                (group) => group.id === row.route.id,
              );
              if (matchingGroup) {
                onSelectPoseGroup?.({
                  groupPath: matchingGroup.path,
                  label: matchingGroup.label,
                  groupId:
                    matchingGroup.source === "configured"
                      ? matchingGroup.id
                      : null,
                  poseIds: matchingGroup.poseIds,
                  nodeId: matchingGroup.id,
                });
              }
              return;
            }
            if (row.route.kind === "scene-object") {
              onSelectScene?.(row.route.id);
            }
          };

          return (
            <div className="flex flex-col h-full min-h-0 gap-1 p-2">
              <div className="flex items-center gap-2 px-1 mb-1">
                <PanelSearch
                  ref={searchInputRef}
                  value={search}
                  onChange={setSearch}
                  placeholder={
                    search
                      ? "Filter..."
                      : isVariables
                        ? "Search or create variable..."
                        : isPoses
                          ? "Search poses..."
                          : isPoseGroups
                            ? "Search pose groups..."
                            : "Search drivers..."
                  }
                />
              </div>
              <div className="flex items-center gap-1 px-1 mb-1">
                {isVariables && (
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
                )}
                {!isVariables && !isPoseGroups && !isDrivers && (
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
                )}
                {isVariables && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
                    onClick={handleCopyReferenceToMain}
                    disabled={uncopiedReferenceCount === 0}
                    title="Copy reference-only variables to main face"
                  >
                    <Copy size={11} />
                    Copy Ref ({uncopiedReferenceCount})
                  </Button>
                )}
                {isPoseGroups && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={handleCreatePoseGroup}
                    >
                      <Plus size={11} />
                      New Group
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      disabled={!selectedPoseGroup?.groupId}
                      onClick={handleRenameSelectedPoseGroup}
                      title={
                        selectedPoseGroup?.groupId
                          ? "Rename selected pose group"
                          : "Select a configured pose group first"
                      }
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 text-amber-300 hover:text-amber-200"
                      disabled={!selectedPoseGroup?.groupId}
                      onClick={handleDeleteSelectedPoseGroup}
                      title={
                        selectedPoseGroup?.groupId
                          ? "Delete selected pose group"
                          : "Select a configured pose group first"
                      }
                    >
                      Delete
                    </Button>
                  </>
                )}
                {isPoseGroups && (
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    Cross-group blend
                  </span>
                )}
              </div>
              {isPoseGroups && (
                <div className="flex flex-wrap items-center gap-1 px-1">
                  <span className="text-[10px] text-text-muted">
                    {selectedPoseName
                      ? `Selected pose: ${selectedPoseName}`
                      : "Select a pose to edit membership"}
                  </span>
                  {selectedPoseName && (
                    <span className="text-[10px] text-text-muted font-mono">
                      ({selectedPoseGroupPath || "unassigned"})
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant={
                        crossGroupBlendMode === "average" ? "primary" : "subtle"
                      }
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setCrossGroupBlendMode("average")}
                    >
                      Average
                    </Button>
                    <Button
                      variant={
                        crossGroupBlendMode === "additive"
                          ? "primary"
                          : "subtle"
                      }
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => setCrossGroupBlendMode("additive")}
                    >
                      Additive
                    </Button>
                  </div>
                </div>
              )}
              {isDrivers && (
                <div className="px-1 flex items-center gap-2 text-[10px] text-text-muted">
                  <span>
                    Selection:
                    {selectedRigId
                      ? " Rig"
                      : selectedPoseId
                        ? " Pose"
                        : selectedSceneId
                          ? " Scene object"
                          : " none"}
                  </span>
                </div>
              )}
              {isVariables && (
                <>
                  <div className="flex flex-wrap items-center gap-1 px-1 mb-2">
                    {referenceFace.file && (
                      <div className="w-full flex flex-wrap items-center gap-1 pb-1 border-b border-border-default/40 mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-text-muted mr-1">
                          Shared Sync
                        </span>
                        {(
                          [
                            ["off", "Off"],
                            ["bidirectional", "Both"],
                            ["main-to-reference", "Main→Ref"],
                            ["reference-to-main", "Ref→Main"],
                          ] as Array<[SharedVariableSyncPolicy, string]>
                        ).map(([mode, label]) => {
                          const isActive = sharedSyncPolicy === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                                isActive
                                  ? "border-accent/50 bg-accent/10 text-accent"
                                  : "border-border-default text-text-muted hover:text-text-primary"
                              }`}
                              onClick={() => applySharedSyncPolicy(mode)}
                            >
                              {label}
                            </button>
                          );
                        })}
                        <span className="text-[10px] text-text-muted font-mono ml-1">
                          Drift {sharedOutOfSyncCount}
                        </span>
                      </div>
                    )}
                    {(
                      [
                        ["auto", "Auto"],
                        ["preset", "Preset"],
                        ["custom", "Custom"],
                        ...(referenceFace.file
                          ? ([["shared", "Shared"]] as const)
                          : []),
                        ["reference", "Reference"],
                      ] as Array<[RigNodeSource, string]>
                    )
                      .filter(([source]) =>
                        source === "reference"
                          ? Boolean(referenceFace.file)
                          : true,
                      )
                      .map(([source, label]) => {
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

                  {referenceFace.file && sharedSyncConflicts.length > 0 && (
                    <div className="mx-1 mb-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-2 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-amber-200">
                          Shared Sync Conflicts ({sharedSyncConflicts.length})
                        </span>
                        <span className="text-[10px] text-amber-100/80">
                          Different edits detected across faces
                        </span>
                      </div>
                      {sharedSyncConflicts.slice(0, 4).map((conflict) => (
                        <div
                          key={`${conflict.path}:${conflict.detectedAt}`}
                          className="rounded border border-amber-500/30 bg-bg-panel/40 p-2 flex flex-col gap-1"
                        >
                          <div className="text-[10px] font-mono text-amber-100 truncate">
                            {conflict.path}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            {conflict.firstSource}{" "}
                            {conflict.firstValue.toFixed(3)} →{" "}
                            {conflict.secondSource}{" "}
                            {conflict.secondValue.toFixed(3)}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => resolveConflict(conflict, "main")}
                            >
                              Keep Main
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px]"
                              onClick={() =>
                                resolveConflict(conflict, "reference")
                              }
                            >
                              Keep Ref
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[10px] ml-auto"
                              onClick={() =>
                                dismissSharedSyncConflict(conflict.path)
                              }
                            >
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {showCreateOption && !isPoseGroups && (
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

                {isDrivers ? (
                  <>
                    {visibleIncomingDrivers.length === 0 &&
                    visibleOutgoingDrivers.length === 0 ? (
                      <EmptyState
                        icon={Search}
                        iconSize={18}
                        title={
                          !selectedRigId && !selectedPoseId && !selectedSceneId
                            ? "No selection"
                            : searchQuery
                              ? `No driver rows matching "${search}"`
                              : "No driver relationships"
                        }
                        description={
                          !selectedRigId && !selectedPoseId && !selectedSceneId
                            ? "Select a rig, pose, or scene object in another panel to inspect its driver graph."
                            : searchQuery
                              ? "Adjust the filter to a matching source or target."
                              : "Use the variables, poses, and scene inspectors to populate this view."
                        }
                      />
                    ) : (
                      <div className="flex flex-col gap-2">
                        {visibleIncomingDrivers.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] uppercase tracking-wider text-text-muted px-1">
                              Incoming
                            </div>
                            {visibleIncomingDrivers.map((row) => (
                              <button
                                key={`incoming-${row.id}`}
                                type="button"
                                className="p-1.5 rounded border border-border-default/50 bg-bg-panel/40 hover:bg-bg-hover/60 text-left flex items-center gap-2 text-xs"
                                onClick={() => handleOpenDriverTarget(row)}
                              >
                                <ArrowRight
                                  size={12}
                                  className="text-text-muted rotate-180"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {row.label}
                                  </div>
                                  {row.detail && (
                                    <div className="text-[10px] text-text-muted truncate">
                                      {row.detail}
                                    </div>
                                  )}
                                </div>
                                <ChevronRight size={10} />
                              </button>
                            ))}
                          </div>
                        )}

                        {visibleOutgoingDrivers.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <div className="text-[10px] uppercase tracking-wider text-text-muted px-1">
                              Outgoing
                            </div>
                            {visibleOutgoingDrivers.map((row) => (
                              <button
                                key={`outgoing-${row.id}`}
                                type="button"
                                className="p-1.5 rounded border border-border-default/50 bg-bg-panel/40 hover:bg-bg-hover/60 text-left flex items-center gap-2 text-xs"
                                onClick={() => handleOpenDriverTarget(row)}
                              >
                                <ArrowRight
                                  size={12}
                                  className="text-text-muted"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {row.label}
                                  </div>
                                  {row.detail && (
                                    <div className="text-[10px] text-text-muted truncate">
                                      {row.detail}
                                    </div>
                                  )}
                                </div>
                                <ChevronRight size={10} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : isPoseGroups ? (
                  poseGroupsForSurface.length === 0 ? (
                    <EmptyState
                      icon={Search}
                      iconSize={18}
                      title={
                        search.trim().length > 0
                          ? "No pose groups found"
                          : "No pose groups yet"
                      }
                      description={
                        search.trim().length > 0
                          ? `No items found matching "${search}"`
                          : "Assign a pose to a group to populate this list."
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
                    <div className="flex flex-col">
                      {poseGroupsForSurface.map((group) => {
                        const isMember = selectedPoseId
                          ? selectedPoseGroupPath === group.path
                          : false;
                        return (
                          <TreeRow
                            key={group.id}
                            depth={0}
                            label={group.label}
                            hasChildren={false}
                            isExpanded={false}
                            isSelected={
                              activeSelection?.type === "pose-group" &&
                              activeSelection.id === group.id
                            }
                            onToggle={() => {}}
                            onSelect={() => selectPoseGroup(group)}
                            highlightQuery={search}
                            icon={
                              <Users size={12} className="text-purple-300" />
                            }
                            actions={
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-text-muted font-mono">
                                  {group.source}
                                </span>
                                <span className="text-[10px] text-text-muted font-mono">
                                  {group.poseIds.length}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  disabled={!selectedPoseId}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handlePoseGroupMembershipToggle(group);
                                  }}
                                  title={
                                    !selectedPoseId
                                      ? "Select a pose first"
                                      : isMember
                                        ? "Unassign selected pose"
                                        : "Assign selected pose"
                                  }
                                >
                                  {isMember ? "Unassign" : "Assign"}
                                </Button>
                              </div>
                            }
                          />
                        );
                      })}
                    </div>
                  )
                ) : visibleRoot.children.size === 0 && !showCreateOption ? (
                  <EmptyState
                    icon={Search}
                    iconSize={18}
                    title={
                      search.trim().length > 0
                        ? "No results"
                        : isVariables
                          ? "No variables defined"
                          : "No poses defined"
                    }
                    description={
                      search.trim().length > 0
                        ? `No items found matching "${search}"`
                        : isVariables
                          ? "Create new variables or import a model with poses."
                          : "Create a pose to get started."
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
          );
        }}
      />
    </Panel>
  );
}
