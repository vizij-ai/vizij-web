import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  Plus,
  Copy,
  Folder,
  Zap,
  ArrowDown,
  ArrowUp,
  Activity,
  Play,
  RotateCcw,
  Trash2,
  Search,
  Sliders,
  Users,
} from "lucide-react";
import {
  normalizeStandardRigInputPath,
  SELF_BINDING_ID,
  type StandardRigInput,
} from "@vizij/utils";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { PanelSearch, TreeRow, Tabs } from "../ui";
import { Slider } from "../ui/Slider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSharedVariableSyncContext } from "../../state/SharedVariableSyncContext";
import { isPropsRigStandardInputPath } from "../../utils/rigElementInputs";
import { resolveRigMetadataInputId } from "../../utils/rigElementInputs";
import { cn } from "../../utils/cn";
import type {
  PoseBlendMode,
  PoseDefinition,
  PoseIrStageSource,
  PoseRigConfigFile,
} from "../../poseRig/types";
import {
  isPoseControlInputPath,
  parsePoseWeightInputSourceId,
} from "../../poseRig/utils";
import type { ManagedStandardInput } from "../../types/standardInputs";
import type { PoseGroupInspectorSelection } from "../../types/poseGroupInspector";
import type {
  SharedVariableConflict,
  SharedVariableSyncPolicy,
} from "../../hooks/useSharedVariableSync";

// ----------------------------------------------------------------------------
// Types & Helper Functions
// ----------------------------------------------------------------------------

type NodeType = "folder" | "pose" | "rig" | "input";
type RigNodeSource = "auto" | "preset" | "custom" | "reference" | "shared";
type SurfaceTab = "variables" | "poses" | "pose-groups" | "inputs";
type FilterableSurfaceTab = Exclude<SurfaceTab, "pose-groups">;
const DEFAULT_SURFACES: SurfaceTab[] = [
  "variables",
  "poses",
  "inputs",
  "pose-groups",
];

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

interface InputListRow {
  id: string;
  label: string;
  inputId: string;
  source: RigNodeSource;
  path: string;
  value: number;
  min: number;
  max: number;
  controlKind: "rig-input" | "pose-weight" | "group-output" | "stage-output";
  provenance?: string;
  editable: boolean;
  selectable: boolean;
}

const INPUT_CONTROL_KIND_LABEL: Record<InputListRow["controlKind"], string> = {
  "rig-input": "rig",
  "pose-weight": "pose-weight",
  "group-output": "group-output",
  "stage-output": "stage-output",
};

const INPUT_CONTROL_KIND_BADGE_CLASS: Record<
  InputListRow["controlKind"],
  string
> = {
  "rig-input": "bg-slate-900/40 text-slate-200",
  "pose-weight": "bg-violet-900/40 text-violet-200",
  "group-output": "bg-teal-900/40 text-teal-200",
  "stage-output": "bg-cyan-900/40 text-cyan-200",
};

function normalizePoseGroupPath(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/^\/+|\/+$/g, "");
}

function poseGroupDisplayLabel(path: string): string {
  return path === UNASSIGNED_POSE_GROUP_PATH
    ? UNASSIGNED_POSE_GROUP_LABEL
    : path;
}

type BlendStageDefinition = NonNullable<
  PoseRigConfigFile["blendStages"]
>[number];

function blendStageDisplayName(
  stage: BlendStageDefinition,
  index: number,
): string {
  const trimmed = stage.name?.trim();
  if (trimmed) {
    return trimmed;
  }
  return `Stage ${index + 1}`;
}

function evaluateBlendStageTopology(
  blendStages: BlendStageDefinition[],
  knownGroupIds: Iterable<string>,
): string | null {
  if (blendStages.length === 0) {
    return null;
  }

  const groupIdSet = new Set(knownGroupIds);
  const allStageIds = new Set<string>();
  const firstIndexById = new Map<string, number>();

  blendStages.forEach((stage, index) => {
    const stageId = stage.id.trim();
    if (!stageId) {
      return;
    }
    allStageIds.add(stageId);
    if (!firstIndexById.has(stageId)) {
      firstIndexById.set(stageId, index);
    }
  });

  const priorStageIds = new Set<string>();
  for (let stageIndex = 0; stageIndex < blendStages.length; stageIndex += 1) {
    const stage = blendStages[stageIndex]!;
    const stageId = stage.id.trim();
    if (!stageId) {
      return `Stage #${stageIndex + 1} is missing an id.`;
    }
    if (firstIndexById.get(stageId) !== stageIndex) {
      return `Stage "${stageId}" is duplicated.`;
    }

    const stageSources = Array.isArray(stage.sources) ? stage.sources : [];
    if (stageSources.length === 0) {
      return `Stage "${blendStageDisplayName(stage, stageIndex)}" needs at least one source.`;
    }

    const sourceKeys = new Set<string>();
    for (
      let sourceIndex = 0;
      sourceIndex < stageSources.length;
      sourceIndex += 1
    ) {
      const source = stageSources[sourceIndex]!;
      const sourceKind = source.kind;
      const sourceId = source.id.trim();
      if (!sourceId) {
        return `Stage "${blendStageDisplayName(stage, stageIndex)}" has a source with no id.`;
      }
      const sourceKey = `${sourceKind}:${sourceId}`;
      if (sourceKeys.has(sourceKey)) {
        return `Stage "${blendStageDisplayName(stage, stageIndex)}" includes duplicate source "${sourceKey}".`;
      }
      sourceKeys.add(sourceKey);

      if (sourceKind === "group") {
        if (!groupIdSet.has(sourceId)) {
          return `Stage "${blendStageDisplayName(stage, stageIndex)}" references unknown group "${sourceId}".`;
        }
        continue;
      }
      if (sourceKind !== "stage") {
        return `Stage "${blendStageDisplayName(stage, stageIndex)}" has unsupported source kind "${String(sourceKind)}".`;
      }
      if (sourceId === stageId) {
        return `Stage "${blendStageDisplayName(stage, stageIndex)}" cannot source itself.`;
      }
      if (!allStageIds.has(sourceId)) {
        return `Stage "${blendStageDisplayName(stage, stageIndex)}" references unknown stage "${sourceId}".`;
      }
      if (!priorStageIds.has(sourceId)) {
        return `Stage "${blendStageDisplayName(stage, stageIndex)}" must reference earlier stages only (invalid source "${sourceId}").`;
      }
    }

    priorStageIds.add(stageId);
  }

  return null;
}

export function formatSurfaceLabelWithCount(
  label: string,
  count: number,
): string {
  return `${label} (${count})`;
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

type TreeNodeData =
  | PoseDefinition
  | RigNodeData
  | PoseGroupNodeData
  | InputListRow;

interface TreeNode {
  id: string;
  label: string;
  type: NodeType;
  children: Map<string, TreeNode>;
  showChildren: boolean; // Default expansion state
  data?: TreeNodeData;
}

interface BindingInputLike {
  inputId?: string | null;
  slots?: Array<{
    inputId?: string | null;
  }>;
}

function resolveManagedSource(entry: ManagedStandardInput): RigNodeSource {
  const isPreset = entry.metadata?.elementType === "standard";
  if (isPreset) {
    return "preset";
  }
  return entry.source;
}

function collectFullyLockedFaceElementIds(
  managedInputs: readonly ManagedStandardInput[],
  lockedTargetIds: ReadonlySet<string>,
): Set<string> {
  if (lockedTargetIds.size === 0) {
    return new Set<string>();
  }

  const componentIdsByElementId = new Map<string, Set<string>>();
  managedInputs.forEach((entry) => {
    if (!isPropsRigStandardInputPath(entry.input.path)) {
      return;
    }
    const elementId = entry.metadata?.elementId?.trim();
    const componentId = entry.metadata?.componentId?.trim();
    if (!elementId || !componentId) {
      return;
    }
    const bucket = componentIdsByElementId.get(elementId);
    if (bucket) {
      bucket.add(componentId);
      return;
    }
    componentIdsByElementId.set(elementId, new Set([componentId]));
  });

  const lockedElementIds = new Set<string>();
  componentIdsByElementId.forEach((componentIds, elementId) => {
    if (componentIds.size === 0) {
      return;
    }
    const fullyLocked = Array.from(componentIds).every((componentId) =>
      lockedTargetIds.has(componentId),
    );
    if (fullyLocked) {
      lockedElementIds.add(elementId);
    }
  });
  return lockedElementIds;
}

function collectLockedPropsRigComponentIds(
  managedInputs: readonly ManagedStandardInput[],
  lockedTargetIds: ReadonlySet<string>,
): Set<string> {
  if (lockedTargetIds.size === 0) {
    return new Set<string>();
  }
  const lockedComponentIds = new Set<string>();
  managedInputs.forEach((entry) => {
    if (!isPropsRigStandardInputPath(entry.input.path)) {
      return;
    }
    const componentId = entry.metadata?.componentId?.trim();
    if (!componentId) {
      return;
    }
    if (lockedTargetIds.has(componentId)) {
      lockedComponentIds.add(componentId);
    }
  });
  return lockedComponentIds;
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

function getPathParts(path: string | null | undefined): string[] {
  if (!path) {
    return [];
  }
  return normalizeStandardRigInputPath(path).split("/").filter(Boolean);
}

function insertRigNodeAtPath(params: {
  root: TreeNode;
  key: string;
  input: StandardRigInput;
  data: RigNodeData;
}): void {
  const { root, key, input, data } = params;
  const pathParts = getPathParts(input.path);
  const folderParts = pathParts.slice(0, Math.max(pathParts.length - 1, 0));
  let current = root;
  folderParts.forEach((part) => {
    current = getOrCreateChild(current, part, part);
  });
  const leafLabel =
    pathParts.length > 0
      ? pathParts.join("/")
      : input.label || input.id || "driver";
  current.children.set(key, {
    id: `${current.id}/${key}`,
    label: leafLabel,
    type: "rig",
    children: new Map(),
    showChildren: false,
    data,
  });
}

function insertInputNodeAtPath(params: {
  root: TreeNode;
  key: string;
  row: InputListRow;
}): void {
  const { root, key, row } = params;
  const pathParts = getPathParts(row.path);
  const folderParts = pathParts.slice(0, Math.max(pathParts.length - 1, 0));
  let current = root;
  folderParts.forEach((part) => {
    current = getOrCreateChild(current, part, part);
  });
  current.children.set(key, {
    id: `${current.id}/${key}`,
    label: row.label,
    type: "input",
    children: new Map(),
    showChildren: false,
    data: row,
  });
}

function collectBindingInputIds(
  binding: BindingInputLike | null | undefined,
): Set<string> {
  const inputIds = new Set<string>();
  const push = (candidate: string | null | undefined) => {
    const trimmed = candidate?.trim();
    if (!trimmed || trimmed === SELF_BINDING_ID) {
      return;
    }
    inputIds.add(trimmed);
  };
  push(binding?.inputId);
  (binding?.slots ?? []).forEach((slot) => {
    push(slot.inputId);
  });
  return inputIds;
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

function collectFolderRigDeletionSummary(node: TreeNode): {
  totalRigCount: number;
  deletableRigInputIds: string[];
  undeletableRigCount: number;
} {
  const deletableRigInputIds = new Set<string>();
  let totalRigCount = 0;
  const visit = (candidate: TreeNode) => {
    if (candidate.type === "rig") {
      totalRigCount += 1;
      const rigData = candidate.data as RigNodeData | undefined;
      if (rigData?.source === "custom" && !rigData.disabled) {
        deletableRigInputIds.add(rigData.input.id);
      }
      return;
    }
    candidate.children.forEach((child) => visit(child));
  };
  visit(node);
  return {
    totalRigCount,
    deletableRigInputIds: Array.from(deletableRigInputIds),
    undeletableRigCount: totalRigCount - deletableRigInputIds.size,
  };
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

function arePoseIdListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
}

function filterTreeBySearch(rootNode: TreeNode, query: string): TreeNode {
  const trimmed = query.trim().toLowerCase();
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

export function filterTreeForActiveSurface<T>({
  activeSurface,
  targetSurface,
  rootNode,
  query,
  filterTree,
}: {
  activeSurface: SurfaceTab;
  targetSurface: FilterableSurfaceTab;
  rootNode: T;
  query: string;
  filterTree: (node: T, searchQuery: string) => T;
}): T {
  if (activeSurface !== targetSurface) {
    return rootNode;
  }
  return filterTree(rootNode, query);
}

export function resolveVisibleRootForActiveSurface<T>({
  activeSurface,
  query,
  variablesRootNode,
  posesRootNode,
  inputRootNode,
  filterTree,
}: {
  activeSurface: SurfaceTab;
  query: string;
  variablesRootNode: T;
  posesRootNode: T;
  inputRootNode: T;
  filterTree: (node: T, searchQuery: string) => T;
}): T {
  if (activeSurface === "poses") {
    return filterTreeForActiveSurface({
      activeSurface,
      targetSurface: "poses",
      rootNode: posesRootNode,
      query,
      filterTree,
    });
  }
  if (activeSurface === "inputs") {
    return filterTreeForActiveSurface({
      activeSurface,
      targetSurface: "inputs",
      rootNode: inputRootNode,
      query,
      filterTree,
    });
  }
  return filterTreeForActiveSurface({
    activeSurface,
    targetSurface: "variables",
    rootNode: variablesRootNode,
    query,
    filterTree,
  });
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
  onInputValueChange?: (inputId: string, value: number) => void;
  selection?: {
    type: "pose" | "rig" | "pose-group" | "input";
    id: string;
  } | null;
  searchQuery: string;
}

function TreeRowWrapper({
  node,
  depth,
  expanded,
  onToggle,
  onAction,
  onSelect,
  onInputValueChange,
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
      (node.type === "input" &&
        selection.type === "input" &&
        (node.data as InputListRow)?.inputId === selection.id) ||
      (isPoseGroupFolder &&
        selection.type === "pose-group" &&
        node.id === selection.id));
  const folderDeletionSummary =
    node.type === "folder" && !isPoseGroupFolder
      ? collectFolderRigDeletionSummary(node)
      : null;
  const folderDeleteCount = folderDeletionSummary?.deletableRigInputIds.length;
  const canDeleteFolderDrivers =
    node.type === "folder" &&
    node.id !== "root" &&
    Boolean(folderDeletionSummary) &&
    (folderDeleteCount ?? 0) > 0 &&
    (folderDeletionSummary?.undeletableRigCount ?? 0) === 0;

  // Determine Icon
  let Icon = Folder;
  if (node.type === "pose") Icon = Activity;
  else if (node.type === "rig") Icon = Zap;
  else if (node.type === "input") Icon = Sliders;

  // Determine Icon Color
  let iconClass = "text-text-muted";
  if (node.type === "pose") iconClass = "text-purple-400";
  else if (node.type === "rig") iconClass = "text-yellow-400";
  else if (node.type === "input") iconClass = "text-cyan-300";
  else if (
    node.type === "folder" &&
    (node.data as PoseGroupNodeData | undefined)?.kind === "pose-group"
  )
    iconClass = "text-purple-300";

  if (node.type === "input") {
    const inputData = node.data as InputListRow;
    const value =
      typeof inputData.value === "number" && Number.isFinite(inputData.value)
        ? inputData.value
        : 0;
    const controlKindLabel = INPUT_CONTROL_KIND_LABEL[inputData.controlKind];
    return (
      <TreeRow
        depth={depth}
        label={node.label}
        hasChildren={true}
        isExpanded={true}
        isSelected={!!isSelected}
        onToggle={() => {}}
        onSelect={inputData.selectable ? () => onSelect?.(node) : undefined}
        highlightQuery={searchQuery}
        icon={<Icon size={12} strokeWidth={2} className={iconClass} />}
        actions={
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono px-1 rounded text-text-muted bg-bg-panel/30">
              {inputData.source}
            </span>
            <span
              className={cn(
                "text-[9px] uppercase tracking-wide px-1 rounded",
                INPUT_CONTROL_KIND_BADGE_CLASS[inputData.controlKind],
              )}
            >
              {controlKindLabel}
            </span>
          </div>
        }
      >
        <div className="px-2 pb-2 flex flex-col gap-1">
          {inputData.editable ? (
            <Slider
              value={value}
              min={inputData.min}
              max={inputData.max}
              step={0.01}
              onChange={(nextValue) => {
                const normalizedValue = Array.isArray(nextValue)
                  ? nextValue[0]
                  : nextValue;
                if (!Number.isFinite(normalizedValue)) {
                  return;
                }
                onInputValueChange?.(inputData.inputId, normalizedValue);
              }}
            />
          ) : (
            <p className="text-[10px] text-text-muted">
              Derived control (read-only)
            </p>
          )}
          {inputData.provenance ? (
            <p className="text-[10px] text-text-muted font-mono truncate">
              {inputData.provenance}
            </p>
          ) : null}
        </div>
      </TreeRow>
    );
  }

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
            <>
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
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-sky-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "reset-pose");
                }}
                title="Reset this pose weight"
              >
                <RotateCcw size={10} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-purple-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "duplicate-pose");
                }}
                title="Duplicate this pose"
              >
                <Copy size={10} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-amber-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "delete-pose");
                }}
                title="Delete Pose"
              >
                <Trash2 size={10} />
              </Button>
            </>
          )}

          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source !== "reference" &&
            !(node.data as RigNodeData | undefined)?.disabled && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px] uppercase text-text-secondary hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "set-min");
                  }}
                  title="Set current value to min"
                >
                  Min
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px] uppercase text-text-secondary hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "set-default");
                  }}
                  title="Set current value to default"
                >
                  Def
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[9px] uppercase text-text-secondary hover:text-text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAction?.(node, "set-max");
                  }}
                  title="Set current value to max"
                >
                  Max
                </Button>
              </>
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
                title="Copy driver to main face"
              >
                <Copy size={10} />
              </Button>
            )}
          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source !== "reference" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-purple-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "duplicate-variable");
                }}
                title="Duplicate driver"
              >
                <Copy size={10} />
              </Button>
            )}
          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source === "custom" &&
            !(node.data as RigNodeData | undefined)?.disabled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-amber-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "delete-variable");
                }}
                title="Delete driver"
              >
                <Trash2 size={10} />
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
          {canDeleteFolderDrivers ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0 hover:text-accent text-amber-300"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(node, "delete-folder-drivers");
              }}
              title={`Delete folder drivers (${folderDeleteCount ?? 0})`}
            >
              <Trash2 size={10} />
            </Button>
          ) : null}

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
                onInputValueChange={onInputValueChange}
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
  onInputValueChange?: (inputId: string, value: number) => void;
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
  onSelectPoseGroup?: (selection: PoseGroupInspectorSelection | null) => void;
  activeSurfaceOverride?: SurfaceTab;
  availableSurfaces?: SurfaceTab[];
  panelTitle?: string;
  panelDescription?: string;
}

export function VariablesPanel({
  selectedRigId,
  selectedPoseId: selectedPoseIdFromParent,
  selectedSceneId: _selectedSceneId,
  onSelectRig,
  onSelectPose,
  onSelectScene: _onSelectScene,
  onInputValueChange,
  selectedPoseGroup,
  onSelectPoseGroup,
  activeSurfaceOverride,
  availableSurfaces,
  panelTitle = "Control Elements",
  panelDescription = "Author and organize drivers, poses, pose groups, and inputs.",
}: VariablesPanelProps) {
  const {
    poses,
    applyPose,
    selectPose,
    selectedPoseId: selectedPoseIdFromAuthoring,
    createPose,
    duplicatePose,
    createPoseGroup,
    renamePoseGroup,
    deletePoseGroup,
    deletePose,
    crossGroupBlendMode,
    blendMode,
    blendStages,
    setCrossGroupBlendMode,
    createBlendStage,
    renameBlendStage,
    setBlendStageMode,
    deleteBlendStage,
    reorderBlendStage,
    setBlendStageSources,
    addPoseToGroup,
    removePoseFromGroup,
    poseConfigDraft,
  } = usePoseRig();
  const selectedPoseId =
    selectedPoseIdFromParent ?? selectedPoseIdFromAuthoring;
  const [searchQuery, setSearchQuery] = useState("");
  const [stageEditMessage, setStageEditMessage] = useState<string | null>(null);
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
    const configuredPathOrder = new Map<string, number>();
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
      if (!configuredPathOrder.has(path)) {
        configuredPathOrder.set(path, configuredPathOrder.size);
      }
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

    const sortPaths = (left: string, right: string) => {
      if (left === UNASSIGNED_POSE_GROUP_PATH) {
        return 1;
      }
      if (right === UNASSIGNED_POSE_GROUP_PATH) {
        return -1;
      }
      const leftOrder = configuredPathOrder.get(left);
      const rightOrder = configuredPathOrder.get(right);
      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }
      if (leftOrder !== undefined) {
        return -1;
      }
      if (rightOrder !== undefined) {
        return 1;
      }
      return left.localeCompare(right);
    };

    const resolvePoseGroupPaths = (pose: PoseDefinition): string[] => {
      const paths = new Set<string>();
      const addPath = (path: string | null | undefined) => {
        const normalized = normalizePoseGroupPath(path);
        if (!normalized) {
          return;
        }
        paths.add(normalized);
      };
      const addById = (groupId: string | null | undefined) => {
        const trimmed = groupId?.trim();
        if (!trimmed) {
          return;
        }
        if (byId.has(trimmed)) {
          paths.add(byId.get(trimmed)!);
          return;
        }
        addPath(trimmed);
      };

      pose.groupIds?.forEach((groupId) => {
        addById(groupId);
      });
      addById(pose.groupId);
      addPath(pose.group);

      if (paths.size === 0) {
        return [UNASSIGNED_POSE_GROUP_PATH];
      }
      return Array.from(paths).sort(sortPaths);
    };

    poses.forEach((pose) => {
      resolvePoseGroupPaths(pose).forEach((path) => {
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
        if (!group.poseIds.includes(pose.id)) {
          group.poseIds.push(pose.id);
        }
      });
    });

    return Array.from(groupsByPath.values()).filter(
      (group) => group.source === "configured" || group.poseIds.length > 0,
    );
  }, [blendMode, poseGroupBlendModeFallback, poseGroupsFromConfig, poses]);

  const poseGroupsByPoseId = useMemo(() => {
    const next = new Map<string, string[]>();
    poseGroups.forEach((group) => {
      group.poseIds.forEach((poseId) => {
        const existing = next.get(poseId);
        if (!existing) {
          next.set(poseId, [group.path]);
          return;
        }
        if (!existing.includes(group.path)) {
          existing.push(group.path);
        }
      });
    });
    return next;
  }, [poseGroups]);

  const selectedPoseGroupPaths = selectedPoseId
    ? (poseGroupsByPoseId.get(selectedPoseId) ?? [])
    : [];

  const visiblePoseGroups = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
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
  }, [poseGroups, poseNameById, searchQuery]);

  useEffect(() => {
    if (!selectedPoseGroup || !onSelectPoseGroup) {
      return;
    }

    const selectedPath =
      normalizePoseGroupPath(selectedPoseGroup.groupPath) ??
      UNASSIGNED_POSE_GROUP_PATH;
    const matchingGroup = selectedPoseGroup.groupId
      ? poseGroups.find(
          (group) =>
            group.source === "configured" &&
            group.id === selectedPoseGroup.groupId,
        )
      : poseGroups.find((group) => group.path === selectedPath);

    if (!matchingGroup) {
      onSelectPoseGroup(null);
      return;
    }

    const nextSelection: PoseGroupInspectorSelection = {
      groupPath: matchingGroup.path,
      label: poseGroupDisplayLabel(matchingGroup.path),
      groupId: matchingGroup.source === "configured" ? matchingGroup.id : null,
      poseIds: matchingGroup.poseIds,
      nodeId: matchingGroup.id,
    };

    if (
      selectedPoseGroup.groupPath === nextSelection.groupPath &&
      selectedPoseGroup.label === nextSelection.label &&
      selectedPoseGroup.groupId === nextSelection.groupId &&
      selectedPoseGroup.nodeId === nextSelection.nodeId &&
      arePoseIdListsEqual(selectedPoseGroup.poseIds, nextSelection.poseIds)
    ) {
      return;
    }

    onSelectPoseGroup(nextSelection);
  }, [onSelectPoseGroup, poseGroups, selectedPoseGroup]);

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const handleCreateCustomStandardInput = useBindingAuthoring(
    (state) => state.handleCreateCustomStandardInput,
  );
  const handleUpdateStandardInput = useBindingAuthoring(
    (state) => state.handleUpdateStandardInput,
  );
  const handleDeleteCustomStandardInput = useBindingAuthoring(
    (state) => state.handleDeleteCustomStandardInput,
  );
  const handleCloneStandardInputs = useBindingAuthoring(
    (state) => state.handleCloneStandardInputs,
  );
  const handleLinkChildInput = useBindingAuthoring(
    (state) => state.handleLinkChildInput,
  );
  const activeInputValueChange = onInputValueChange ?? handleInputValueChange;
  const poseWeightInputIdByPoseId = useMemo(() => {
    const map = new Map<string, string>();
    managedStandardInputs.forEach((entry) => {
      const poseId = parsePoseWeightInputSourceId(entry.input.sourceId);
      if (!poseId || map.has(poseId)) {
        return;
      }
      map.set(poseId, entry.input.id);
    });
    return map;
  }, [managedStandardInputs]);

  const setPoseWeightSolo = useCallback(
    (poseId: string) => {
      const updates: Record<string, number> = {};
      let foundAny = false;
      poses.forEach((pose) => {
        const weightInputId = poseWeightInputIdByPoseId.get(pose.id);
        if (!weightInputId) {
          return;
        }
        updates[weightInputId] = pose.id === poseId ? 1 : 0;
        foundAny = true;
      });
      if (!foundAny) {
        return false;
      }
      applyStandardInputBatch(updates);
      return true;
    },
    [applyStandardInputBatch, poseWeightInputIdByPoseId, poses],
  );
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
    () => availableSurfaces ?? DEFAULT_SURFACES,
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
      .filter((entry) => !isPropsRigStandardInputPath(entry.input.path))
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
      .filter((entry) => !isPropsRigStandardInputPath(entry.path))
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
      const normalizedPath =
        entry.normalizedPath ?? normalizeStandardRigInputPath(entry.input.path);
      referenceByPath.set(normalizedPath, entry.input);
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

  const resolvedSelectedRigId = useMemo(() => {
    if (!selectedRigId) {
      return null;
    }
    return resolveRigMetadataInputId(selectedRigId, standardInputsById);
  }, [selectedRigId, standardInputsById]);
  const effectiveSelectedRigId = resolvedSelectedRigId || selectedRigId || null;

  const poseCountByGroupId = useMemo(() => {
    const poseCountByGroupId = new Map<string, number>();
    poses.forEach((pose) => {
      const memberships =
        pose.groupIds && pose.groupIds.length > 0
          ? pose.groupIds
          : pose.groupId
            ? [pose.groupId]
            : [];
      memberships.forEach((groupId) => {
        const trimmedGroupId = groupId?.trim();
        if (!trimmedGroupId) {
          return;
        }
        poseCountByGroupId.set(
          trimmedGroupId,
          (poseCountByGroupId.get(trimmedGroupId) ?? 0) + 1,
        );
      });
    });
    return poseCountByGroupId;
  }, [poses]);

  const poseGroupLabelById = useMemo(() => {
    const groupLabelById = new Map<string, string>();
    (poseConfigDraft?.poseGroups ?? []).forEach((group) => {
      const groupId = group.id?.trim();
      if (!groupId || groupLabelById.has(groupId)) {
        return;
      }
      const normalizedPath =
        normalizePoseGroupPath(group.path) ||
        normalizePoseGroupPath(group.name) ||
        normalizePoseGroupPath(group.id) ||
        groupId;
      groupLabelById.set(groupId, poseGroupDisplayLabel(normalizedPath));
    });
    return groupLabelById;
  }, [poseConfigDraft?.poseGroups]);

  const fullyLockedFaceElementIds = useMemo(
    () =>
      collectFullyLockedFaceElementIds(
        managedStandardInputs,
        lockedInspectorTargetIds,
      ),
    [lockedInspectorTargetIds, managedStandardInputs],
  );
  const lockedPropsRigComponentIds = useMemo(
    () =>
      collectLockedPropsRigComponentIds(
        managedStandardInputs,
        lockedInspectorTargetIds,
      ),
    [lockedInspectorTargetIds, managedStandardInputs],
  );

  const managedInputRows = useMemo(
    () =>
      managedStandardInputs
        .filter((entry) => !isPoseControlInputPath(entry.input.path))
        .filter((entry) => {
          if (!isPropsRigStandardInputPath(entry.input.path)) {
            return true;
          }
          const componentId = entry.metadata?.componentId?.trim();
          if (componentId && lockedPropsRigComponentIds.has(componentId)) {
            return false;
          }
          const elementId = entry.metadata?.elementId?.trim();
          if (!elementId) {
            return true;
          }
          return !fullyLockedFaceElementIds.has(elementId);
        })
        .map((entry) => {
          const normalizedPath = normalizeStandardRigInputPath(
            entry.input.path,
          );
          const min = entry.input.range?.min ?? 0;
          const max = entry.input.range?.max ?? 1;
          const value = inputValues[entry.input.id];
          const poseWeightPoseId = parsePoseWeightInputSourceId(
            entry.input.sourceId,
          );
          const controlKind: InputListRow["controlKind"] = poseWeightPoseId
            ? "pose-weight"
            : "rig-input";
          return {
            id: entry.input.id,
            label: entry.input.label || entry.input.id,
            inputId: entry.input.id,
            source: resolveManagedSource(entry),
            path: normalizedPath,
            value: Number.isFinite(value)
              ? value
              : (entry.input.defaultValue ?? 0),
            min,
            max,
            controlKind,
            provenance: poseWeightPoseId
              ? `pose:${poseNameById.get(poseWeightPoseId) ?? poseWeightPoseId}`
              : undefined,
            editable: true,
            selectable: true,
          } as const;
        }),
    [
      fullyLockedFaceElementIds,
      inputValues,
      lockedPropsRigComponentIds,
      managedStandardInputs,
      poseNameById,
    ],
  );

  const derivedPoseOutputRows = useMemo(() => {
    const groupOutputRows = (poseConfigDraft?.poseGroups ?? []).map((group) => {
      const groupId = group.id?.trim() || "group";
      const path = normalizeStandardRigInputPath(
        `/pose/groups/${groupId}.output`,
      );
      const blendMode =
        group.blendMode === "additive" || group.blendMode === "average"
          ? group.blendMode
          : poseGroupBlendModeFallback;
      const poseCount = poseCountByGroupId.get(groupId) ?? 0;
      return {
        id: `pose_group_output:${groupId}`,
        label: `Group Output · ${poseGroupLabelById.get(groupId) ?? groupId}`,
        inputId: `__pose_group_output__:${groupId}`,
        source: "auto" as const,
        path,
        value: 0,
        min: 0,
        max: 1,
        controlKind: "group-output" as const,
        provenance: `group:${groupId}; mode:${blendMode}; poses:${poseCount}`,
        editable: false,
        selectable: false,
      };
    });

    const stageOutputRows = (poseConfigDraft?.blendStages ?? []).map(
      (stage) => {
        const stageId = stage.id.trim();
        const stageName = stage.name?.trim() || stageId;
        const path = normalizeStandardRigInputPath(
          `/pose/stages/${stageId}.output`,
        );
        const sourceSummary =
          stage.sources
            .map((source) => {
              if (source.kind === "group") {
                return `group:${poseGroupLabelById.get(source.id) ?? source.id}`;
              }
              return `stage:${source.id}`;
            })
            .join(", ") || "none";
        return {
          id: `pose_stage_output:${stageId}`,
          label: `Stage Output · ${stageName}`,
          inputId: `__pose_stage_output__:${stageId}`,
          source: "auto" as const,
          path,
          value: 0,
          min: 0,
          max: 1,
          controlKind: "stage-output" as const,
          provenance: `stage:${stageId}; mode:${stage.mode}; sources:${sourceSummary}`,
          editable: false,
          selectable: false,
        };
      },
    );

    return [...groupOutputRows, ...stageOutputRows];
  }, [
    poseCountByGroupId,
    poseConfigDraft?.blendStages,
    poseConfigDraft?.poseGroups,
    poseGroupBlendModeFallback,
    poseGroupLabelById,
  ]);

  const inputRows = useMemo(
    () => [...managedInputRows, ...derivedPoseOutputRows],
    [derivedPoseOutputRows, managedInputRows],
  );

  const inputRootNode = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      label: "Inputs",
      type: "folder",
      children: new Map(),
      showChildren: true,
    };

    inputRows.forEach((row) => {
      insertInputNodeAtPath({
        root,
        key: `input_${row.inputId}`,
        row,
      });
    });

    const simplifiedChildren = new Map<string, TreeNode>();
    for (const [key, child] of root.children) {
      simplifiedChildren.set(key, simplifyNode(child));
    }
    root.children = simplifiedChildren;
    return root;
  }, [inputRows]);

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
    const normalizedPath =
      referenceEntry.normalizedPath ??
      normalizeStandardRigInputPath(referenceEntry.input.path);
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

  // Build Drivers tree
  const variablesRootNode = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      label: "Drivers",
      type: "folder",
      children: new Map(),
      showChildren: true,
    };

    const hasReferenceFace = !!referenceFace.file;

    // Shared drivers root (when both faces expose the same path-backed input)
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
        const key = `shared_${entry.input.id}`;
        insertRigNodeAtPath({
          root: sharedRoot,
          key,
          input: entry.input,
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
      insertRigNodeAtPath({
        root: targetRoot,
        key: `rig_${entry.input.id}`,
        input: entry.input,
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
          insertRigNodeAtPath({
            root: refFaceRoot,
            key: `ref_${entry.input.id}`,
            input: entry.input,
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

  const visibleRoot = useMemo(
    () =>
      resolveVisibleRootForActiveSurface({
        activeSurface,
        query: searchQuery,
        variablesRootNode,
        posesRootNode,
        inputRootNode,
        filterTree: filterTreeBySearch,
      }),
    [
      activeSurface,
      inputRootNode,
      posesRootNode,
      searchQuery,
      variablesRootNode,
    ],
  );

  // Auto-expand folders when searching
  useEffect(() => {
    if (
      (activeSurface !== "variables" &&
        activeSurface !== "poses" &&
        activeSurface !== "inputs") ||
      !searchQuery.trim()
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
  }, [activeSurface, visibleRoot, searchQuery]);

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
    if (group.path === UNASSIGNED_POSE_GROUP_PATH) {
      return;
    }
    const isMember = selectedPoseGroupPaths.includes(group.path);
    if (isMember) {
      removePoseFromGroup(selectedPoseId, group.path);
      return;
    }
    addPoseToGroup(selectedPoseId, group.path);
  };

  const createUniqueCustomVariablePath = useCallback(() => {
    const basePath = "/custom/new_driver";
    let attempt = 1;
    let candidatePath = normalizeStandardRigInputPath(basePath);
    while (standardInputsByPath.has(candidatePath)) {
      attempt += 1;
      candidatePath = normalizeStandardRigInputPath(
        `${basePath}_${attempt.toString(10)}`,
      );
    }
    return candidatePath;
  }, [standardInputsByPath]);

  const duplicateVariableById = useCallback(
    (sourceInputId: string): string | null => {
      const sourceInput = standardInputsById.get(sourceInputId);
      if (!sourceInput) {
        return null;
      }
      const clones = handleCloneStandardInputs([sourceInputId], {
        labelSuffix: " Copy",
        pathSuffix: "_copy",
      });
      const clonedInputId = clones.get(sourceInputId);
      if (!clonedInputId) {
        return null;
      }

      const inputBindingById = inputBindings as Record<
        string,
        BindingInputLike | undefined
      >;
      const sourceBinding = inputBindingById[sourceInputId];
      const parentIds = Array.from(collectBindingInputIds(sourceBinding));
      parentIds.forEach((parentInputId) => {
        if (parentInputId === clonedInputId) {
          return;
        }
        handleLinkChildInput(parentInputId, clonedInputId);
      });

      Object.entries(inputBindingById).forEach(
        ([candidateChildId, binding]) => {
          if (
            candidateChildId === sourceInputId ||
            candidateChildId === clonedInputId
          ) {
            return;
          }
          const parentIdsForChild = collectBindingInputIds(binding);
          if (!parentIdsForChild.has(sourceInputId)) {
            return;
          }
          handleLinkChildInput(clonedInputId, candidateChildId);
        },
      );

      onSelectRig?.(clonedInputId);
      onSelectPoseGroup?.(null);
      return clonedInputId;
    },
    [
      handleCloneStandardInputs,
      handleLinkChildInput,
      inputBindings,
      onSelectPoseGroup,
      onSelectRig,
      standardInputsById,
    ],
  );

  const handleAction = (node: TreeNode, action: string) => {
    if (node.type === "pose" && action === "play") {
      const poseData = node.data as PoseDefinition;
      if (!setPoseWeightSolo(poseData.id)) {
        applyPose(poseData.id);
      }
      return;
    }
    if (node.type === "pose" && action === "reset-pose") {
      const poseData = node.data as PoseDefinition;
      const poseWeightInputId = poseWeightInputIdByPoseId.get(poseData.id);
      if (!poseWeightInputId) {
        return;
      }
      const poseWeightInput = standardInputsById.get(poseWeightInputId);
      activeInputValueChange(
        poseWeightInputId,
        poseWeightInput?.defaultValue ?? 0,
      );
      return;
    }
    if (node.type === "pose" && action === "duplicate-pose") {
      const poseData = node.data as PoseDefinition;
      if (poseData.id === "__pose_rig_neutral__") {
        return;
      }
      pendingPoseSelectionRef.current = true;
      duplicatePose(poseData.id);
      onSelectPoseGroup?.(null);
      return;
    }
    if (node.type === "pose" && action === "delete-pose") {
      const poseData = node.data as PoseDefinition;
      if (poseData.id === "__pose_rig_neutral__") {
        return;
      }
      const ok = window.confirm(`Delete pose "${poseData.name}"?`);
      if (!ok) {
        return;
      }
      deletePose(poseData.id);
      return;
    }
    if (
      node.type === "rig" &&
      (action === "set-min" || action === "set-default" || action === "set-max")
    ) {
      const rigData = node.data as RigNodeData;
      if (rigData.source === "reference" || rigData.disabled) {
        return;
      }
      const min = rigData.input.range?.min ?? 0;
      const max = rigData.input.range?.max ?? 1;
      const defaultValue = rigData.input.defaultValue ?? 0;
      const nextValue =
        action === "set-min" ? min : action === "set-max" ? max : defaultValue;
      activeInputValueChange(rigData.input.id, nextValue);
      return;
    }
    if (node.type === "rig" && action === "copy-to-main") {
      const rigData = node.data as RigNodeData;
      if (rigData.source === "reference") {
        copyReferenceVariableToMain(rigData, { select: true });
      }
      return;
    }
    if (node.type === "rig" && action === "duplicate-variable") {
      const rigData = node.data as RigNodeData;
      if (rigData.source === "reference") {
        return;
      }
      duplicateVariableById(rigData.input.id);
      return;
    }
    if (node.type === "rig" && action === "delete-variable") {
      const rigData = node.data as RigNodeData;
      if (rigData.source !== "custom") {
        return;
      }
      const label =
        rigData.input.label || rigData.input.path || rigData.input.id;
      const ok = window.confirm(
        `Delete custom driver "${label}"?\n\nThis removes the driver and cleans linked parent/child bindings.`,
      );
      if (!ok) {
        return;
      }
      handleDeleteCustomStandardInput(rigData.input.id);
      onSelectRig?.(null);
      return;
    }
    if (node.type === "folder" && action === "inspect-pose-group") {
      openPoseGroupInspector(node);
      return;
    }
    if (node.type === "folder" && action === "delete-folder-drivers") {
      const summary = collectFolderRigDeletionSummary(node);
      if (summary.deletableRigInputIds.length === 0) {
        return;
      }
      if (summary.undeletableRigCount > 0) {
        return;
      }
      const driverCount = summary.deletableRigInputIds.length;
      const ok = window.confirm(
        `Delete folder "${node.label}"?\n\nThis deletes ${driverCount} custom driver${driverCount === 1 ? "" : "s"} in this folder and subfolders, and cleans linked parent/child bindings.`,
      );
      if (!ok) {
        return;
      }
      const deletedInputIds = new Set(summary.deletableRigInputIds);
      summary.deletableRigInputIds.forEach((inputId) => {
        handleDeleteCustomStandardInput(inputId);
      });
      if (
        effectiveSelectedRigId &&
        deletedInputIds.has(effectiveSelectedRigId)
      ) {
        onSelectRig?.(null);
      }
      onSelectPoseGroup?.(null);
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
    } else if (node.type === "input") {
      const inputData = node.data as InputListRow;
      onSelectRig?.(inputData.inputId);
      onSelectPoseGroup?.(null);
    }
  };

  const handleCreateVariable = () => {
    const path = createUniqueCustomVariablePath();
    const newInput = handleCreateCustomStandardInput(path);
    if (newInput) {
      onSelectRig?.(newInput.id);
      onSelectPoseGroup?.(null);
    }
  };

  const selectedMainVariableId = useMemo(() => {
    if (!effectiveSelectedRigId) {
      return null;
    }
    const selected = mainFaceRigEntries.find(
      (entry) => entry.input.id === effectiveSelectedRigId,
    );
    return selected?.input.id ?? null;
  }, [effectiveSelectedRigId, mainFaceRigEntries]);

  const handleDuplicateSelectedVariable = useCallback(() => {
    if (!selectedMainVariableId) {
      return;
    }
    duplicateVariableById(selectedMainVariableId);
  }, [duplicateVariableById, selectedMainVariableId]);

  const handleCreatePose = () => {
    pendingPoseSelectionRef.current = true;
    createPose();
  };

  const handleDuplicateSelectedPose = () => {
    if (!selectedPoseId || selectedPoseId === "__pose_rig_neutral__") {
      return;
    }
    pendingPoseSelectionRef.current = true;
    duplicatePose(selectedPoseId);
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

  const handleCreateBlendStage = () => {
    if (stageGroupOptions.length === 0 && stageDefinitions.length === 0) {
      setStageEditMessage(
        "Create at least one configured pose group before adding a blend stage.",
      );
      return;
    }
    createBlendStage();
    setStageEditMessage(null);
  };

  const handleRenameBlendStage = (
    stage: BlendStageDefinition,
    stageIndex: number,
  ) => {
    const currentName = blendStageDisplayName(stage, stageIndex);
    const value = window.prompt("Rename blend stage", currentName);
    if (value === null) {
      return;
    }
    renameBlendStage(stage.id, value);
    setStageEditMessage(null);
  };

  const handleDeleteBlendStage = (
    stage: BlendStageDefinition,
    stageIndex: number,
  ) => {
    const stageName = blendStageDisplayName(stage, stageIndex);
    const referencedBy = stageDefinitions
      .slice(stageIndex + 1)
      .find((candidate) =>
        candidate.sources.some(
          (source) => source.kind === "stage" && source.id === stage.id,
        ),
      );
    if (referencedBy) {
      setStageEditMessage(
        `Delete blocked: "${stageName}" is referenced by "${referencedBy.name?.trim() || referencedBy.id}".`,
      );
      return;
    }
    const ok = window.confirm(`Delete blend stage "${stageName}"?`);
    if (!ok) {
      return;
    }
    deleteBlendStage(stage.id);
    setStageEditMessage(null);
  };

  const handleReorderBlendStage = (
    stageIndex: number,
    direction: "up" | "down",
  ) => {
    const toIndex = direction === "up" ? stageIndex - 1 : stageIndex + 1;
    if (toIndex < 0 || toIndex >= stageDefinitions.length) {
      return;
    }
    const nextStages = [...stageDefinitions];
    const [moved] = nextStages.splice(stageIndex, 1);
    if (!moved) {
      return;
    }
    nextStages.splice(toIndex, 0, moved);
    const topologyIssue = evaluateBlendStageTopology(nextStages, stageGroupIds);
    if (topologyIssue) {
      setStageEditMessage(`Reorder blocked: ${topologyIssue}`);
      return;
    }
    reorderBlendStage(stageIndex, toIndex);
    setStageEditMessage(null);
  };

  const handleToggleBlendStageSource = (
    stage: BlendStageDefinition,
    source: PoseIrStageSource,
  ) => {
    const hasSource = stage.sources.some(
      (candidate) =>
        candidate.kind === source.kind && candidate.id === source.id,
    );
    const nextSources = hasSource
      ? stage.sources.filter(
          (candidate) =>
            !(candidate.kind === source.kind && candidate.id === source.id),
        )
      : [...stage.sources, source];
    if (nextSources.length === 0) {
      setStageEditMessage(
        `Stage "${stage.name?.trim() || stage.id}" requires at least one source.`,
      );
      return;
    }
    const dedupedSources = Array.from(
      new Map(
        nextSources.map((candidate) => [
          `${candidate.kind}:${candidate.id}`,
          candidate,
        ]),
      ).values(),
    );
    const candidateStages = stageDefinitions.map((candidate) =>
      candidate.id === stage.id
        ? { ...candidate, sources: dedupedSources }
        : candidate,
    );
    const topologyIssue = evaluateBlendStageTopology(
      candidateStages,
      stageGroupIds,
    );
    if (topologyIssue) {
      setStageEditMessage(`Source update blocked: ${topologyIssue}`);
      return;
    }
    setBlendStageSources(stage.id, dedupedSources);
    setStageEditMessage(null);
  };

  const variableItemCount =
    mainFaceRigEntries.length +
    referenceRigEntries.length +
    sharedRigEntries.length;
  const poseItemCount = poses.length;
  const poseGroupItemCount = poseGroups.length;
  const inputItemCount = inputRows.length;
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
  const stageGroupOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    poseGroupsFromConfig.forEach((group) => {
      const id = typeof group.id === "string" ? group.id.trim() : "";
      if (!id || byId.has(id)) {
        return;
      }
      const path =
        normalizePoseGroupPath(group.path) ||
        normalizePoseGroupPath(group.name) ||
        normalizePoseGroupPath(group.id) ||
        id;
      byId.set(id, {
        id,
        label: poseGroupDisplayLabel(path),
      });
    });
    return Array.from(byId.values());
  }, [poseGroupsFromConfig]);
  const stageGroupIds = useMemo(
    () => stageGroupOptions.map((group) => group.id),
    [stageGroupOptions],
  );
  const stageDefinitions = useMemo(
    () => (Array.isArray(blendStages) ? blendStages : []),
    [blendStages],
  );
  const totalCount =
    activeSurface === "variables"
      ? variableItemCount
      : activeSurface === "poses"
        ? poseItemCount
        : activeSurface === "pose-groups"
          ? poseGroupItemCount
          : inputItemCount;

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
    if (activeSurface === "inputs" && effectiveSelectedRigId) {
      return { type: "input" as const, id: effectiveSelectedRigId };
    }
    if (effectiveSelectedRigId) {
      return { type: "rig" as const, id: effectiveSelectedRigId };
    }
    return null;
  }, [
    activeSurface,
    selectedPoseGroup?.nodeId,
    selectedPoseId,
    effectiveSelectedRigId,
  ]);

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
      return {
        id,
        label: formatSurfaceLabelWithCount("Drivers", variableItemCount),
      };
    }
    if (id === "poses") {
      return { id, label: formatSurfaceLabelWithCount("Poses", poseItemCount) };
    }
    if (id === "pose-groups") {
      return {
        id,
        label: formatSurfaceLabelWithCount("Pose Groups", poseGroupItemCount),
      };
    }
    return { id, label: formatSurfaceLabelWithCount("Inputs", inputItemCount) };
  });

  const surfaceForTab = (id: string): SurfaceTab =>
    id === "poses"
      ? "poses"
      : id === "pose-groups"
        ? "pose-groups"
        : id === "inputs"
          ? "inputs"
          : "variables";

  const selectedPoseName = selectedPoseId
    ? (poseNameById.get(selectedPoseId) ?? selectedPoseId)
    : null;
  const selectedPoseMemberships =
    selectedPoseGroupPaths.length > 0
      ? selectedPoseGroupPaths.map((path) => ({
          path,
          label: poseGroupDisplayLabel(path),
        }))
      : [
          {
            path: UNASSIGNED_POSE_GROUP_PATH,
            label: UNASSIGNED_POSE_GROUP_LABEL,
          },
        ];

  return (
    <Panel
      title={panelTitle}
      description={panelDescription}
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
          if (surfaceForTab(id) !== activeSurface) {
            return null;
          }
          const isVariables = id === "variables";
          const isPoseGroups = id === "pose-groups";
          const isPoses = id === "poses";
          const isInputs = id === "inputs";
          const filteredSearch = searchQuery.trim().toLowerCase();

          return (
            <div className="flex flex-col h-full min-h-0 gap-1 p-2">
              <div className="flex items-center gap-2 px-1 mb-1">
                <PanelSearch
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder={
                    searchQuery
                      ? "Filter..."
                      : isVariables
                        ? "Search drivers..."
                        : isPoses
                          ? "Search poses..."
                          : isPoseGroups
                            ? "Search pose groups..."
                            : "Search inputs..."
                  }
                />
              </div>
              <div className="flex items-center gap-1 px-1 mb-1">
                {isVariables && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={handleCreateVariable}
                    title="Create a new driver and inspect it"
                  >
                    <Plus size={11} />
                    New Driver
                  </Button>
                )}
                {isVariables && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1"
                    onClick={handleDuplicateSelectedVariable}
                    disabled={!selectedMainVariableId}
                    title={
                      selectedMainVariableId
                        ? "Duplicate selected driver and inspect the copy"
                        : "Select a driver to duplicate"
                    }
                  >
                    <Copy size={11} />
                    Duplicate Driver
                  </Button>
                )}
                {isPoses && (
                  <>
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
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={handleDuplicateSelectedPose}
                      disabled={
                        !selectedPoseId ||
                        selectedPoseId === "__pose_rig_neutral__"
                      }
                      title={
                        selectedPoseId &&
                        selectedPoseId !== "__pose_rig_neutral__"
                          ? "Duplicate selected pose"
                          : "Select a pose to duplicate"
                      }
                    >
                      <Copy size={11} />
                      Duplicate Pose
                    </Button>
                  </>
                )}
                {isVariables && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
                    onClick={handleCopyReferenceToMain}
                    disabled={uncopiedReferenceCount === 0}
                    title="Copy reference-only drivers to main face"
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
                      variant="secondary"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={handleCreateBlendStage}
                      title="Create a new blend stage"
                    >
                      <Plus size={11} />
                      New Stage
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
                    Compatibility blend
                  </span>
                )}
              </div>
              {isPoseGroups && (
                <div className="flex flex-col gap-2 px-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] text-text-muted">
                      {selectedPoseName
                        ? `Selected pose: ${selectedPoseName}`
                        : "Select a pose to edit membership"}
                    </span>
                    {selectedPoseName && (
                      <div className="flex flex-wrap items-center gap-1">
                        {selectedPoseMemberships.map((membership) => (
                          <span
                            key={membership.path}
                            className="text-[10px] text-text-muted font-mono border border-border-default/50 rounded px-1 py-0.5"
                          >
                            {membership.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <span className="text-[10px] text-text-muted">
                        {stageDefinitions.length === 0
                          ? "Legacy cross-group mode"
                          : "Fallback mode"}
                      </span>
                      <Button
                        variant={
                          crossGroupBlendMode === "average"
                            ? "primary"
                            : "subtle"
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

                  <div className="rounded border border-border-default/50 bg-bg-panel/40 px-2 py-2 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-text-muted">
                        Blend Stages
                      </span>
                      <span className="text-[10px] text-text-muted">
                        {stageDefinitions.length === 0
                          ? "No stages (compatibility mode)"
                          : `${stageDefinitions.length} configured`}
                      </span>
                    </div>
                    {stageEditMessage && (
                      <div
                        role="alert"
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-100"
                      >
                        {stageEditMessage}
                      </div>
                    )}
                    {stageDefinitions.length === 0 ? (
                      <div className="text-[10px] text-text-muted">
                        Add stages to author explicit multi-stage blending.
                        Until then, cross-group blend mode above is used.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {stageDefinitions.map((stage, stageIndex) => {
                          const stageName = blendStageDisplayName(
                            stage,
                            stageIndex,
                          );
                          const stageGroupSources = stage.sources.filter(
                            (source) => source.kind === "group",
                          );
                          const stageStageSources = stage.sources.filter(
                            (source) => source.kind === "stage",
                          );
                          const priorStageOptions = stageDefinitions.slice(
                            0,
                            stageIndex,
                          );
                          const referencesThisStage = stageDefinitions
                            .slice(stageIndex + 1)
                            .some((candidate) =>
                              candidate.sources.some(
                                (source) =>
                                  source.kind === "stage" &&
                                  source.id === stage.id,
                              ),
                            );

                          const moveIssueFor = (
                            direction: "up" | "down",
                          ): string | null => {
                            const toIndex =
                              direction === "up"
                                ? stageIndex - 1
                                : stageIndex + 1;
                            if (
                              toIndex < 0 ||
                              toIndex >= stageDefinitions.length
                            ) {
                              return "Boundary";
                            }
                            const nextStages = [...stageDefinitions];
                            const [moved] = nextStages.splice(stageIndex, 1);
                            if (!moved) {
                              return "Missing stage";
                            }
                            nextStages.splice(toIndex, 0, moved);
                            return evaluateBlendStageTopology(
                              nextStages,
                              stageGroupIds,
                            );
                          };

                          const moveUpIssue = moveIssueFor("up");
                          const moveDownIssue = moveIssueFor("down");

                          return (
                            <div
                              key={stage.id}
                              className="rounded border border-border-default/50 bg-bg-panel/30 p-2 flex flex-col gap-2"
                            >
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-text-muted font-mono">
                                  {stage.id}
                                </span>
                                <span className="text-xs text-text-primary">
                                  {stageName}
                                </span>
                                <div className="ml-auto flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1"
                                    disabled={Boolean(moveUpIssue)}
                                    onClick={() =>
                                      handleReorderBlendStage(stageIndex, "up")
                                    }
                                    title={
                                      moveUpIssue && moveUpIssue !== "Boundary"
                                        ? moveUpIssue
                                        : "Move stage up"
                                    }
                                  >
                                    <ArrowUp size={11} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-1"
                                    disabled={Boolean(moveDownIssue)}
                                    onClick={() =>
                                      handleReorderBlendStage(
                                        stageIndex,
                                        "down",
                                      )
                                    }
                                    title={
                                      moveDownIssue &&
                                      moveDownIssue !== "Boundary"
                                        ? moveDownIssue
                                        : "Move stage down"
                                    }
                                  >
                                    <ArrowDown size={11} />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() =>
                                      handleRenameBlendStage(stage, stageIndex)
                                    }
                                    title="Rename blend stage"
                                  >
                                    Rename
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] text-amber-300 hover:text-amber-200"
                                    disabled={referencesThisStage}
                                    onClick={() =>
                                      handleDeleteBlendStage(stage, stageIndex)
                                    }
                                    title={
                                      referencesThisStage
                                        ? "Delete blocked while later stages reference this stage"
                                        : "Delete blend stage"
                                    }
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>

                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-text-muted">
                                  Mode
                                </span>
                                <Button
                                  variant={
                                    stage.mode === "average"
                                      ? "primary"
                                      : "subtle"
                                  }
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() =>
                                    setBlendStageMode(stage.id, "average")
                                  }
                                >
                                  Average
                                </Button>
                                <Button
                                  variant={
                                    stage.mode === "add" ? "primary" : "subtle"
                                  }
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() =>
                                    setBlendStageMode(stage.id, "add")
                                  }
                                >
                                  Add
                                </Button>
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-text-muted">
                                  Group sources
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {stageGroupOptions.length === 0 ? (
                                    <span className="text-[10px] text-text-muted">
                                      No configured groups
                                    </span>
                                  ) : (
                                    stageGroupOptions.map((group) => {
                                      const selected = stageGroupSources.some(
                                        (source) => source.id === group.id,
                                      );
                                      return (
                                        <button
                                          key={group.id}
                                          type="button"
                                          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                                            selected
                                              ? "border-accent/50 bg-accent/10 text-accent"
                                              : "border-border-default text-text-muted hover:text-text-primary"
                                          }`}
                                          aria-pressed={selected}
                                          onClick={() =>
                                            handleToggleBlendStageSource(
                                              stage,
                                              {
                                                kind: "group",
                                                id: group.id,
                                              },
                                            )
                                          }
                                          title={`Toggle group source ${group.label}`}
                                        >
                                          {group.label}
                                        </button>
                                      );
                                    })
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-1">
                                <span className="text-[10px] text-text-muted">
                                  Prior stage sources
                                </span>
                                <div className="flex flex-wrap gap-1">
                                  {priorStageOptions.length === 0 ? (
                                    <span className="text-[10px] text-text-muted">
                                      No prior stages
                                    </span>
                                  ) : (
                                    priorStageOptions.map(
                                      (sourceStage, sourceIndex) => {
                                        const label = blendStageDisplayName(
                                          sourceStage,
                                          sourceIndex,
                                        );
                                        const selected = stageStageSources.some(
                                          (source) =>
                                            source.id === sourceStage.id,
                                        );
                                        return (
                                          <button
                                            key={sourceStage.id}
                                            type="button"
                                            className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                                              selected
                                                ? "border-accent/50 bg-accent/10 text-accent"
                                                : "border-border-default text-text-muted hover:text-text-primary"
                                            }`}
                                            aria-pressed={selected}
                                            onClick={() =>
                                              handleToggleBlendStageSource(
                                                stage,
                                                {
                                                  kind: "stage",
                                                  id: sourceStage.id,
                                                },
                                              )
                                            }
                                            title={`Toggle stage source ${label}`}
                                          >
                                            {label}
                                          </button>
                                        );
                                      },
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
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
                {isPoseGroups ? (
                  poseGroupsForSurface.length === 0 ? (
                    <EmptyState
                      icon={Search}
                      iconSize={18}
                      title={
                        filteredSearch.length > 0
                          ? "No pose groups found"
                          : "No pose groups yet"
                      }
                      description={
                        filteredSearch.length > 0
                          ? `No items found matching "${searchQuery}"`
                          : "Create a group or assign poses to populate this list."
                      }
                      action={
                        filteredSearch.length > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSearchQuery("")}
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
                        const isMember =
                          selectedPoseId &&
                          selectedPoseGroupPaths.includes(group.path);
                        const isUnassigned =
                          group.path === UNASSIGNED_POSE_GROUP_PATH;
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
                            highlightQuery={searchQuery}
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
                                  disabled={!selectedPoseId || isUnassigned}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handlePoseGroupMembershipToggle(group);
                                  }}
                                  title={
                                    !selectedPoseId
                                      ? "Select a pose first"
                                      : isUnassigned
                                        ? "Unassigned membership is derived from poses with no groups"
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
                ) : visibleRoot.children.size === 0 ? (
                  <EmptyState
                    icon={Search}
                    iconSize={18}
                    title={
                      filteredSearch.length > 0
                        ? "No results"
                        : isVariables
                          ? "No drivers defined"
                          : isPoses
                            ? "No poses defined"
                            : isInputs
                              ? "No inputs defined"
                              : "No pose groups defined"
                    }
                    description={
                      filteredSearch.length > 0
                        ? `No items found matching "${searchQuery}"`
                        : isVariables
                          ? "Create new drivers or import a model with poses."
                          : isPoses
                            ? "Create a pose to get started."
                            : isInputs
                              ? "Inputs are populated from rig auto-generation and references."
                              : "No pose groups yet."
                    }
                    action={
                      filteredSearch.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchQuery("")}
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
                        onInputValueChange={activeInputValueChange}
                        selection={activeSelection}
                        searchQuery={searchQuery}
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
