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
  Trash2,
  Search,
  Sliders,
  Users,
} from "lucide-react";
import {
  SELF_BINDING_ID,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import type {
  AnimatableBinding,
  InputBindingMap,
} from "@vizij/node-graph-authoring";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { PanelSearch, TreeRow, Tabs } from "../ui";
import { Slider } from "../ui/Slider";
import {
  useReferenceFace,
  type ReferenceFacePose,
  type ReferenceFacePoseGroup,
} from "../../state/ReferenceFaceContext";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
import { useSharedVariableSyncContext } from "../../state/SharedVariableSyncContext";
import { isAutorigStandardInputPath } from "../../utils/rigElementInputs";
import { resolveRigMetadataInputId } from "../../utils/rigElementInputs";
import { cn } from "../../utils/cn";
import { resolveControllableInputId } from "../inspector/bindingSlotResolution";
import {
  humanizePoseGroupName,
  sanitizePoseGroupId,
} from "../../poseRig/groupMembership";
import { PoseConfigService } from "../../poseRig/services/poseConfigService";
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
  source: "configured" | "auto" | "reference";
  poseIds: string[];
  referenceGroup?: ReferenceFacePoseGroup;
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
  disabledReason?: string | null;
  linkedMainInputId?: string | null;
  referenceEntry?: RigNodeData;
}

interface PoseTreeNodeData {
  kind: "pose";
  source: "main" | "reference";
  pose: PoseDefinition | ReferenceFacePose;
  primaryGroupPath: string | null;
}

interface CopyConflictModalOption {
  id: string;
  label: string;
  description: string;
  variant?: "primary" | "ghost";
}

interface CopyConflictModalState {
  title: string;
  message: string;
  options: CopyConflictModalOption[];
  onResolve: (optionId: string) => void;
}

type VariableCopyMode = "variable-only" | "with-bindings";
type PoseCopyMode = "pose-only" | "with-targets";

interface CopyRetargetIssue {
  referenceInputId: string;
  path: string | null;
  reason: string;
}

interface CopyRetargetModalState {
  title: string;
  message: string;
  issues: CopyRetargetIssue[];
  options: CopyConflictModalOption[];
  onResolve: (optionId: string) => void;
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

function normalizePoseIdentityKey(
  name: string | null | undefined,
  groupPath: string | null | undefined,
): string {
  const normalizedName = (name ?? "").trim().toLowerCase();
  const normalizedGroup = normalizePoseGroupPath(groupPath) || "";
  return `${normalizedGroup}::${normalizedName}`;
}

function resolveReferencePoseGroupPaths(
  pose: ReferenceFacePose,
  groupPathById: Map<string, string>,
): string[] {
  const groupPaths = new Set<string>();

  const pushPath = (rawPath: string | null | undefined) => {
    const normalized = normalizePoseGroupPath(rawPath);
    if (!normalized) {
      return;
    }
    groupPaths.add(normalized);
  };

  const pushGroupId = (rawGroupId: string | null | undefined) => {
    const trimmed = rawGroupId?.trim();
    if (!trimmed) {
      return;
    }
    const mapped = groupPathById.get(trimmed);
    if (mapped) {
      groupPaths.add(mapped);
      return;
    }
    pushPath(trimmed);
  };

  pose.groupIds?.forEach((groupId) => {
    pushGroupId(groupId);
  });
  pushGroupId(pose.groupId);
  pushPath(pose.group);

  return Array.from(groupPaths);
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
  | PoseTreeNodeData
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
      const poseData = candidate.data as
        | PoseTreeNodeData
        | PoseDefinition
        | undefined;
      if (poseData && "kind" in poseData && poseData.kind === "pose") {
        if (poseData.pose.id) {
          ids.push(poseData.pose.id);
        }
        return;
      }
      if (poseData && "id" in poseData && typeof poseData.id === "string") {
        ids.push(poseData.id);
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
  const poseNodeData =
    node.type === "pose"
      ? ((node.data as PoseTreeNodeData | undefined) ?? undefined)
      : undefined;
  const fallbackPoseData =
    node.type === "pose"
      ? ((node.data as PoseDefinition | undefined) ?? undefined)
      : undefined;

  // Check selection
  const isSelected =
    selection &&
    ((node.type === "pose" &&
      selection.type === "pose" &&
      ((poseNodeData?.source === "main" &&
        poseNodeData.pose.id === selection.id) ||
        (!poseNodeData && fallbackPoseData?.id === selection.id))) ||
      (node.type === "rig" &&
        selection.type === "rig" &&
        (node.data as RigNodeData)?.input?.id === selection.id) ||
      (node.type === "input" &&
        selection.type === "input" &&
        (node.data as InputListRow)?.inputId === selection.id) ||
      (isPoseGroupFolder &&
        selection.type === "pose-group" &&
        node.id === selection.id));

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
    const hasDisabledReason = Boolean(inputData.disabledReason);
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
            {inputData.source === "reference" && inputData.referenceEntry ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[9px] gap-1 hover:text-accent"
                onClick={(event) => {
                  event.stopPropagation();
                  onAction?.(node, "copy-input-to-main");
                }}
                title="Copy input to main face"
              >
                <Copy size={10} />
                To Main
              </Button>
            ) : null}
            <span
              className={cn(
                "text-[9px] uppercase tracking-wide px-1 rounded",
                INPUT_CONTROL_KIND_BADGE_CLASS[inputData.controlKind],
              )}
            >
              {controlKindLabel}
            </span>
            {hasDisabledReason ? (
              <span
                className="text-[9px] uppercase tracking-wide px-1 rounded bg-amber-900/40 text-amber-200"
                title={inputData.disabledReason ?? undefined}
              >
                locked
              </span>
            ) : null}
          </div>
        }
      >
        <div
          className={cn(
            "px-2 pb-2 flex flex-col gap-1",
            hasDisabledReason && "opacity-75",
          )}
          title={inputData.disabledReason ?? undefined}
        >
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
          ) : hasDisabledReason ? (
            <>
              <Slider
                value={value}
                min={inputData.min}
                max={inputData.max}
                step={0.01}
                disabled
              />
              <p
                className="text-[10px] text-amber-300/90 truncate"
                title={inputData.disabledReason ?? undefined}
              >
                {inputData.disabledReason}
              </p>
            </>
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
          {node.type === "pose" && poseNodeData?.source !== "reference" && (
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
          {node.type === "pose" && poseNodeData?.source === "reference" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[9px] gap-1 hover:text-accent"
              onClick={(e) => {
                e.stopPropagation();
                onAction?.(node, "copy-pose-to-main");
              }}
              title="Copy pose to main face"
            >
              <Copy size={10} />
              To Main
            </Button>
          )}

          {node.type === "rig" &&
            (node.data as RigNodeData | undefined)?.source === "reference" && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[9px] gap-1 hover:text-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "copy-to-main");
                }}
                title="Copy variable to main face"
              >
                <Copy size={10} />
                To Main
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
                title="Delete variable"
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

          {node.type === "rig" && node.data && (
            <span
              className={`text-[9px] font-mono px-1 rounded ${
                SOURCE_BADGE_CLASS[(node.data as RigNodeData).source]
              }`}
            >
              {(node.data as RigNodeData).source}
            </span>
          )}
          {node.type === "pose" && poseNodeData && (
            <span
              className={`text-[9px] font-mono px-1 rounded ${
                poseNodeData.source === "main"
                  ? "bg-violet-900/40 text-violet-200"
                  : "bg-cyan-900/40 text-cyan-200"
              }`}
            >
              {poseNodeData.source}
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
  includeAutorigInputs?: boolean;
  onSelectRig?: (id: string | null) => void;
  onSelectPose?: (id: string) => void;
  onSelectScene?: (id: string) => void;
  onInputValueChange?: (inputId: string, value: number) => void;
  selectedPoseGroup?: PoseGroupInspectorSelection | null;
  onSelectPoseGroup?: (selection: PoseGroupInspectorSelection | null) => void;
  activeSurfaceOverride?: SurfaceTab;
  availableSurfaces?: SurfaceTab[];
}

export function VariablesPanel({
  selectedRigId,
  selectedPoseId: selectedPoseIdFromParent,
  selectedSceneId: _selectedSceneId,
  includeAutorigInputs = true,
  onSelectRig,
  onSelectPose,
  onSelectScene: _onSelectScene,
  onInputValueChange,
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
    addPoseDefinition,
    replacePoseDefinition,
    duplicatePose,
    createPoseGroup,
    renamePoseGroup,
    deletePoseGroup,
    setPoseGroupBlendMode,
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
  const [copyConflictModal, setCopyConflictModal] =
    useState<CopyConflictModalState | null>(null);
  const [copyRetargetModal, setCopyRetargetModal] =
    useState<CopyRetargetModalState | null>(null);
  const [variableCopyMode, setVariableCopyMode] =
    useState<VariableCopyMode>("variable-only");
  const [poseCopyMode, setPoseCopyMode] =
    useState<PoseCopyMode>("with-targets");
  const poseGroupBlendModeFallback =
    poseConfigDraft?.poseGroups?.find((group) => group.blendMode)?.blendMode ??
    blendMode ??
    "average";
  const poseGroupsFromConfig = poseConfigDraft?.poseGroups ?? [];

  const poseNameById = useMemo(
    () => new Map(poses.map((pose) => [pose.id, pose.name])),
    [poses],
  );
  const mainPoseIds = useMemo(
    () => new Set(poses.map((pose) => pose.id)),
    [poses],
  );

  const mainPoseGroups = useMemo(() => {
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
    mainPoseGroups.forEach((group) => {
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
  }, [mainPoseGroups]);

  const selectedPoseGroupPaths = selectedPoseId
    ? (poseGroupsByPoseId.get(selectedPoseId) ?? [])
    : [];

  const mainPosePrimaryGroupPathById = useMemo(() => {
    const map = new Map<string, string | null>();
    poses.forEach((pose) => {
      const groupedPaths = poseGroupsByPoseId.get(pose.id);
      if (groupedPaths && groupedPaths.length > 0) {
        map.set(pose.id, groupedPaths[0] ?? null);
        return;
      }
      map.set(pose.id, normalizePoseGroupPath(pose.group) || null);
    });
    return map;
  }, [poseGroupsByPoseId, poses]);

  const mainPoseByIdentityKey = useMemo(() => {
    const map = new Map<string, PoseDefinition>();
    poses.forEach((pose) => {
      const key = normalizePoseIdentityKey(
        pose.name,
        mainPosePrimaryGroupPathById.get(pose.id) ?? pose.group ?? null,
      );
      if (!map.has(key)) {
        map.set(key, pose);
      }
    });
    return map;
  }, [mainPosePrimaryGroupPathById, poses]);

  const visibleMainPoseGroups = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return mainPoseGroups;
    }
    return mainPoseGroups.filter((group) => {
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
  }, [mainPoseGroups, poseNameById, searchQuery]);

  useEffect(() => {
    if (!selectedPoseGroup || !onSelectPoseGroup) {
      return;
    }

    const selectedPath =
      normalizePoseGroupPath(selectedPoseGroup.groupPath) ??
      UNASSIGNED_POSE_GROUP_PATH;
    const matchingGroup = selectedPoseGroup.groupId
      ? mainPoseGroups.find(
          (group) =>
            group.source === "configured" &&
            group.id === selectedPoseGroup.groupId,
        )
      : mainPoseGroups.find((group) => group.path === selectedPath);

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
  }, [onSelectPoseGroup, mainPoseGroups, selectedPoseGroup]);

  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const standardInputsByPath = useBindingAuthoring(
    (state) => state.standardInputsByPath,
  );
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const applyInputBindingPatch = useBindingAuthoring(
    (state) => state.applyInputBindingPatch,
  );
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
  const referencePoseGroupPathById = useMemo(() => {
    const map = new Map<string, string>();
    referenceFace.referencePoseGroups.forEach((group) => {
      map.set(group.id, group.path);
    });
    return map;
  }, [referenceFace.referencePoseGroups]);

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
    new Set(["root", "main_face", "ref_face", "main_poses", "reference_poses"]),
  );

  const mainFaceRigEntries = useMemo(() => {
    return managedStandardInputs
      .filter((entry) => Boolean(entry.input.path?.trim()))
      .filter((entry) => !isAutorigStandardInputPath(entry.input.path))
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
      .filter((entry) => !isAutorigStandardInputPath(entry.path))
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

  const referenceInputPathById = useMemo(() => {
    const map = new Map<string, string>();
    referenceFace.standardInputs.forEach((input) => {
      if (!input.id || !input.path) {
        return;
      }
      map.set(input.id, normalizeStandardRigInputPath(input.path));
    });
    Object.entries(referenceFace.referenceInputPathById ?? {}).forEach(
      ([inputId, path]) => {
        if (!inputId || typeof path !== "string" || !path.trim()) {
          return;
        }
        if (!map.has(inputId)) {
          map.set(inputId, normalizeStandardRigInputPath(path));
        }
      },
    );
    return map;
  }, [referenceFace.referenceInputPathById, referenceFace.standardInputs]);

  const referenceRigEntryByPath = useMemo(() => {
    const map = new Map<string, RigNodeData>();
    referenceRigEntries.forEach((entry) => {
      const normalizedPath = entry.normalizedPath
        ? normalizeStandardRigInputPath(entry.normalizedPath)
        : normalizeStandardRigInputPath(entry.input.path);
      if (!map.has(normalizedPath)) {
        map.set(normalizedPath, entry);
      }
    });
    return map;
  }, [referenceRigEntries]);

  const mainInputByNormalizedPath = useMemo(() => {
    const map = new Map<string, StandardRigInput>();
    standardInputsById.forEach((input) => {
      if (!input.path) {
        return;
      }
      map.set(normalizeStandardRigInputPath(input.path), input);
    });
    return map;
  }, [standardInputsById]);

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

  const referencePoseGroupSummaries = useMemo(() => {
    if (!referenceFace.file || !referenceFace.isLoaded) {
      return [] as PoseGroupSummary[];
    }

    const byPath = new Map<string, PoseGroupSummary>();
    referenceFace.referencePoseGroups.forEach((group) => {
      const normalizedPath = normalizePoseGroupPath(group.path);
      if (!normalizedPath || byPath.has(normalizedPath)) {
        return;
      }
      byPath.set(normalizedPath, {
        id: `reference:${group.id}`,
        path: normalizedPath,
        label: poseGroupDisplayLabel(normalizedPath),
        blendMode:
          group.blendMode === "average" || group.blendMode === "additive"
            ? group.blendMode
            : poseGroupBlendModeFallback,
        source: "reference",
        poseIds: [],
        referenceGroup: group,
      });
    });

    referenceFace.referencePoses.forEach((pose) => {
      const groupPaths = resolveReferencePoseGroupPaths(
        pose,
        referencePoseGroupPathById,
      );
      const normalizedPaths =
        groupPaths.length > 0 ? groupPaths : [UNASSIGNED_POSE_GROUP_PATH];
      normalizedPaths.forEach((path) => {
        let group = byPath.get(path);
        if (!group) {
          group = {
            id: `reference:auto:${path}`,
            path,
            label: poseGroupDisplayLabel(path),
            blendMode: poseGroupBlendModeFallback,
            source: "reference",
            poseIds: [],
          };
          byPath.set(path, group);
        }
        if (!group.poseIds.includes(pose.id)) {
          group.poseIds.push(pose.id);
        }
      });
    });

    return Array.from(byPath.values());
  }, [
    poseGroupBlendModeFallback,
    referenceFace.file,
    referenceFace.isLoaded,
    referenceFace.referencePoseGroups,
    referenceFace.referencePoses,
    referencePoseGroupPathById,
  ]);

  const resolvedSelectedRigId = useMemo(() => {
    if (!selectedRigId) {
      return null;
    }
    return resolveRigMetadataInputId(selectedRigId, standardInputsById);
  }, [selectedRigId, standardInputsById]);
  const effectiveSelectedRigId = resolvedSelectedRigId || selectedRigId || null;

  const inputRows = useMemo(() => {
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

    const managedRows = managedStandardInputs
      .filter((entry) => !isPoseControlInputPath(entry.input.path))
      .filter((entry) =>
        includeAutorigInputs
          ? true
          : !isAutorigStandardInputPath(entry.input.path),
      )
      .map((entry) => {
        const normalizedPath = normalizeStandardRigInputPath(entry.input.path);
        const min = entry.input.range?.min ?? 0;
        const max = entry.input.range?.max ?? 1;
        const value = inputValues[entry.input.id];
        const poseWeightPoseId = parsePoseWeightInputSourceId(
          entry.input.sourceId,
        );
        const controlKind: InputListRow["controlKind"] = poseWeightPoseId
          ? "pose-weight"
          : "rig-input";
        const controllableResolution =
          controlKind === "rig-input"
            ? resolveControllableInputId(entry.input.id, inputBindings)
            : { inputId: entry.input.id, blockedReason: null };
        const disabledReason = controllableResolution.blockedReason
          ? controllableResolution.blockedReason
          : controllableResolution.inputId &&
              controllableResolution.inputId !== entry.input.id
            ? `This variable is derived from "${controllableResolution.inputId}" and currently acts as an autorig passthrough. Edit the upstream variable or add local self control in My Drivers.`
            : null;
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
          editable: disabledReason === null,
          selectable: true,
          disabledReason,
        } as const;
      });

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
        label: `Group Output · ${groupLabelById.get(groupId) ?? groupId}`,
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
                return `group:${groupLabelById.get(source.id) ?? source.id}`;
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

    const referenceRows = referenceRigEntries.map((entry) => {
      const normalizedPath = entry.normalizedPath
        ? normalizeStandardRigInputPath(entry.normalizedPath)
        : normalizeStandardRigInputPath(entry.input.path);
      const value = referenceFace.inputValues[entry.input.id];
      return {
        id: `reference_input:${entry.input.id}`,
        label: `Ref · ${entry.input.label || entry.input.id}`,
        inputId: `__reference_input__:${entry.input.id}`,
        source: "reference" as const,
        path: normalizedPath,
        value: Number.isFinite(value) ? value : (entry.input.defaultValue ?? 0),
        min: entry.input.range.min,
        max: entry.input.range.max,
        controlKind: "rig-input" as const,
        provenance: entry.linkedMainInputId
          ? "linked-to-main"
          : "reference-only",
        editable: false,
        selectable: true,
        disabledReason: entry.linkedMainInputId
          ? "Reference input: selecting this row will focus the linked main variable."
          : "Reference input: copy to main to create an editable main-face variable.",
        linkedMainInputId: entry.linkedMainInputId ?? null,
        referenceEntry: entry,
      };
    });

    return [
      ...managedRows,
      ...groupOutputRows,
      ...stageOutputRows,
      ...referenceRows,
    ];
  }, [
    includeAutorigInputs,
    inputValues,
    managedStandardInputs,
    poseConfigDraft?.blendStages,
    poseConfigDraft?.poseGroups,
    poseGroupBlendModeFallback,
    poseNameById,
    poses,
    inputBindings,
    referenceFace.inputValues,
    referenceRigEntries,
  ]);

  const inputRootNode = useMemo(() => {
    const root: TreeNode = {
      id: "root",
      label: "Inputs",
      type: "folder",
      children: new Map(),
      showChildren: true,
    };

    inputRows.forEach((row) => {
      const pathParts = normalizeStandardRigInputPath(row.path)
        .split("/")
        .filter(Boolean);
      let current = root;
      for (const part of pathParts) {
        current = getOrCreateChild(current, part, part);
      }
      const key = `input_${row.inputId}`;
      current.children.set(key, {
        id: `${current.id}/${key}`,
        label: row.label,
        type: "input",
        children: new Map(),
        showChildren: false,
        data: row,
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

  const buildReferenceRigEntryForInputId = (
    referenceInputId: string,
  ): RigNodeData | null => {
    const mappedPath = referenceInputPathById.get(referenceInputId);
    const directReferenceInput =
      referenceFace.standardInputsById.get(referenceInputId);
    const resolvedPath = mappedPath
      ? normalizeStandardRigInputPath(mappedPath)
      : directReferenceInput?.path
        ? normalizeStandardRigInputPath(directReferenceInput.path)
        : null;
    if (!resolvedPath) {
      return null;
    }
    const existing = referenceRigEntryByPath.get(resolvedPath);
    if (existing) {
      return existing;
    }
    if (!directReferenceInput) {
      return null;
    }
    return {
      input: directReferenceInput,
      source: "reference",
      normalizedPath: resolvedPath,
      linkedMainInputId:
        mainInputByNormalizedPath.get(resolvedPath)?.id ?? null,
    };
  };

  const copyReferenceVariableToMain = (
    referenceEntry: RigNodeData,
    options?: {
      select?: boolean;
      allowOverwrite?: boolean;
      copyMode?: VariableCopyMode;
    },
  ): string | null => {
    const select = options?.select ?? true;
    const allowOverwrite = options?.allowOverwrite ?? false;
    const copyMode = options?.copyMode ?? variableCopyMode;
    if (referenceEntry.source !== "reference") {
      return null;
    }
    const normalizedPath = referenceEntry.normalizedPath
      ? normalizeStandardRigInputPath(referenceEntry.normalizedPath)
      : normalizeStandardRigInputPath(referenceEntry.input.path);
    const linkedMain = referenceEntry.linkedMainInputId
      ? (standardInputsById.get(referenceEntry.linkedMainInputId) ?? null)
      : null;
    const existing = linkedMain ?? standardInputsByPath.get(normalizedPath);
    if (existing) {
      const hasMetadataConflict =
        normalizeStandardRigInputPath(existing.path) !== normalizedPath ||
        existing.label !== referenceEntry.input.label ||
        Math.abs(existing.defaultValue - referenceEntry.input.defaultValue) >
          1e-6 ||
        Math.abs(existing.range.min - referenceEntry.input.range.min) > 1e-6 ||
        Math.abs(existing.range.max - referenceEntry.input.range.max) > 1e-6 ||
        (existing.sourceId ?? null) !== (referenceEntry.input.sourceId ?? null);

      if (hasMetadataConflict && !allowOverwrite) {
        setCopyConflictModal({
          title: "Variable Copy Conflict",
          message: `Main face already has "${existing.label || existing.id}" on ${normalizedPath}. Choose how to resolve this copy.`,
          options: [
            {
              id: "keep-main",
              label: "Keep Main",
              description: "Use the existing main-face variable and skip copy.",
              variant: "ghost",
            },
            {
              id: "overwrite-main",
              label: "Overwrite Main",
              description:
                "Apply reference metadata (label/default/range/source) to the main variable.",
              variant: "primary",
            },
            {
              id: "cancel",
              label: "Cancel",
              description: "Close without applying any variable copy action.",
              variant: "ghost",
            },
          ],
          onResolve: (choice) => {
            if (choice === "overwrite-main") {
              copyReferenceVariableToMainWithMode(referenceEntry, {
                select,
                allowOverwrite: true,
                copyMode,
              });
              return;
            }
            if (choice === "keep-main" && select) {
              onSelectRig?.(existing.id);
              onSelectPoseGroup?.(null);
            }
          },
        });
        return null;
      }

      if (hasMetadataConflict && allowOverwrite) {
        handleUpdateStandardInput(existing.id, {
          path: normalizedPath,
          label: referenceEntry.input.label,
          defaultValue: referenceEntry.input.defaultValue,
          range: {
            min: referenceEntry.input.range.min,
            max: referenceEntry.input.range.max,
          },
          sourceId: referenceEntry.input.sourceId ?? null,
        });
      }
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

  const buildVariableBindingCopyPlan = (
    referenceTargetInputId: string,
    targetMainInputId: string,
    options?: { createMissingUpstreams?: boolean },
  ): { bindingsToApply: InputBindingMap; unresolved: CopyRetargetIssue[] } => {
    const createMissingUpstreams = options?.createMissingUpstreams ?? true;
    const bindingsToApply: InputBindingMap = {};
    const unresolved: CopyRetargetIssue[] = [];
    const unresolvedKeys = new Set<string>();
    const referenceToMainId = new Map<string, string>();
    const mainIdByPath = new Map<string, string>();
    mainInputByNormalizedPath.forEach((input, path) => {
      mainIdByPath.set(path, input.id);
    });
    referenceToMainId.set(referenceTargetInputId, targetMainInputId);
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const pushIssue = (
      referenceInputId: string,
      path: string | null,
      reason: string,
    ) => {
      const key = `${referenceInputId}|${path ?? ""}|${reason}`;
      if (unresolvedKeys.has(key)) {
        return;
      }
      unresolvedKeys.add(key);
      unresolved.push({ referenceInputId, path, reason });
    };

    const resolveMainInputIdForReference = (
      referenceInputId: string,
    ): string | null => {
      if (!referenceInputId) {
        return null;
      }
      if (referenceInputId === SELF_BINDING_ID) {
        return SELF_BINDING_ID;
      }
      const mapped = referenceToMainId.get(referenceInputId);
      if (mapped) {
        return mapped;
      }
      const existingMainById = standardInputsById.get(referenceInputId);
      if (existingMainById) {
        referenceToMainId.set(referenceInputId, existingMainById.id);
        return existingMainById.id;
      }
      const mappedPath = referenceInputPathById.get(referenceInputId);
      const directReferenceInput =
        referenceFace.standardInputsById.get(referenceInputId);
      const resolvedPath = mappedPath
        ? normalizeStandardRigInputPath(mappedPath)
        : directReferenceInput?.path
          ? normalizeStandardRigInputPath(directReferenceInput.path)
          : null;
      if (!resolvedPath) {
        pushIssue(
          referenceInputId,
          null,
          "Reference binding points to an input with no resolved path.",
        );
        return null;
      }

      const cachedMainId = mainIdByPath.get(resolvedPath);
      if (cachedMainId) {
        referenceToMainId.set(referenceInputId, cachedMainId);
        return cachedMainId;
      }

      const existingMainByPath = mainInputByNormalizedPath.get(resolvedPath);
      if (existingMainByPath) {
        referenceToMainId.set(referenceInputId, existingMainByPath.id);
        mainIdByPath.set(resolvedPath, existingMainByPath.id);
        return existingMainByPath.id;
      }

      if (!createMissingUpstreams) {
        pushIssue(
          referenceInputId,
          resolvedPath,
          `Main face has no variable on ${resolvedPath}.`,
        );
        return null;
      }

      const referenceEntry = buildReferenceRigEntryForInputId(referenceInputId);
      if (!referenceEntry) {
        pushIssue(
          referenceInputId,
          resolvedPath,
          "Reference metadata was not available for this binding source.",
        );
        return null;
      }
      const createdMainId = copyReferenceVariableToMain(referenceEntry, {
        select: false,
        allowOverwrite: false,
        copyMode: "variable-only",
      });
      if (!createdMainId) {
        pushIssue(
          referenceInputId,
          resolvedPath,
          "Creating the required upstream variable failed.",
        );
        return null;
      }
      referenceToMainId.set(referenceInputId, createdMainId);
      mainIdByPath.set(resolvedPath, createdMainId);
      return createdMainId;
    };

    const remapBindingInputId = (
      rawInputId: string | null | undefined,
      ownerReferenceInputId: string,
      reasonPrefix: string,
    ): string | null => {
      if (!rawInputId) {
        return null;
      }
      if (rawInputId === SELF_BINDING_ID) {
        return SELF_BINDING_ID;
      }
      const resolved = resolveMainInputIdForReference(rawInputId);
      if (resolved && resolved !== SELF_BINDING_ID) {
        return resolved;
      }
      const sourcePath = referenceInputPathById.get(rawInputId) ?? null;
      pushIssue(
        rawInputId,
        sourcePath,
        `${reasonPrefix} for "${ownerReferenceInputId}" could not be remapped.`,
      );
      return null;
    };

    const copyBindingForReferenceInput = (referenceInputId: string): void => {
      if (!referenceInputId || visited.has(referenceInputId)) {
        return;
      }
      if (visiting.has(referenceInputId)) {
        return;
      }
      visiting.add(referenceInputId);

      const targetMainInputIdResolved =
        resolveMainInputIdForReference(referenceInputId);
      if (
        !targetMainInputIdResolved ||
        targetMainInputIdResolved === SELF_BINDING_ID
      ) {
        visiting.delete(referenceInputId);
        visited.add(referenceInputId);
        return;
      }
      const binding = referenceFace.referenceInputBindings[
        referenceInputId
      ] as AnimatableBinding | null;
      if (!binding) {
        visiting.delete(referenceInputId);
        visited.add(referenceInputId);
        return;
      }

      const upstreamReferenceInputIds = new Set<string>();
      if (binding.inputId && binding.inputId !== SELF_BINDING_ID) {
        upstreamReferenceInputIds.add(binding.inputId);
      }
      (binding.slots ?? []).forEach((slot) => {
        if (!slot?.inputId || slot.inputId === SELF_BINDING_ID) {
          return;
        }
        upstreamReferenceInputIds.add(slot.inputId);
      });
      upstreamReferenceInputIds.forEach((upstreamReferenceInputId) => {
        const upstreamMainInputId = resolveMainInputIdForReference(
          upstreamReferenceInputId,
        );
        if (
          !upstreamMainInputId ||
          upstreamMainInputId === SELF_BINDING_ID ||
          visited.has(upstreamReferenceInputId)
        ) {
          return;
        }
        copyBindingForReferenceInput(upstreamReferenceInputId);
      });

      const remappedBinding: AnimatableBinding = {
        ...binding,
        targetId: targetMainInputIdResolved,
        inputId: remapBindingInputId(
          binding.inputId,
          referenceInputId,
          "Primary binding input",
        ),
        slots: (binding.slots ?? []).map((slot) => ({
          ...slot,
          inputId: remapBindingInputId(
            slot.inputId,
            referenceInputId,
            `Binding slot "${slot.alias || slot.id}"`,
          ),
        })),
      };
      bindingsToApply[targetMainInputIdResolved] = remappedBinding;

      visiting.delete(referenceInputId);
      visited.add(referenceInputId);
    };

    copyBindingForReferenceInput(referenceTargetInputId);

    return {
      bindingsToApply,
      unresolved,
    };
  };

  const applyVariableBindingCopyPlan = (bindingsToApply: InputBindingMap) => {
    const entries = Object.entries(bindingsToApply);
    if (entries.length === 0) {
      return;
    }
    applyInputBindingPatch((previous) => {
      const next: InputBindingMap = { ...previous };
      let changed = false;
      entries.forEach(([targetInputId, binding]) => {
        if (!binding) {
          return;
        }
        if (next[targetInputId] === binding) {
          return;
        }
        next[targetInputId] = binding;
        changed = true;
      });
      return changed ? next : previous;
    });
  };

  function copyReferenceVariableToMainWithMode(
    referenceEntry: RigNodeData,
    options?: {
      select?: boolean;
      allowOverwrite?: boolean;
      copyMode?: VariableCopyMode;
    },
  ): string | null {
    const select = options?.select ?? true;
    const copyMode = options?.copyMode ?? variableCopyMode;
    const copiedId = copyReferenceVariableToMain(referenceEntry, {
      select: false,
      allowOverwrite: options?.allowOverwrite,
      copyMode,
    });
    if (!copiedId) {
      return null;
    }

    if (copyMode === "with-bindings") {
      const plan = buildVariableBindingCopyPlan(
        referenceEntry.input.id,
        copiedId,
        {
          createMissingUpstreams: true,
        },
      );
      if (plan.unresolved.length > 0) {
        setCopyRetargetModal({
          title: "Variable Binding Retargeting Needed",
          message: `Copied "${referenceEntry.input.label || referenceEntry.input.id}" to main, but ${plan.unresolved.length} binding route(s) could not be mapped exactly.`,
          issues: plan.unresolved,
          options: [
            {
              id: "apply-mapped-bindings",
              label: "Apply Mapped Bindings",
              description:
                "Apply the binding logic that could be resolved and leave unresolved routes disconnected.",
              variant: "primary",
            },
            {
              id: "copy-variable-only",
              label: "Variable Only",
              description:
                "Keep only variable metadata on main and skip binding logic.",
              variant: "ghost",
            },
            {
              id: "cancel",
              label: "Cancel",
              description:
                "Close this dialog and keep the copied metadata only.",
              variant: "ghost",
            },
          ],
          onResolve: (choice) => {
            if (choice === "apply-mapped-bindings") {
              applyVariableBindingCopyPlan(plan.bindingsToApply);
            }
            if (
              select &&
              (choice === "apply-mapped-bindings" ||
                choice === "copy-variable-only")
            ) {
              onSelectRig?.(copiedId);
              onSelectPoseGroup?.(null);
            }
          },
        });
        return null;
      } else {
        applyVariableBindingCopyPlan(plan.bindingsToApply);
        if (select) {
          onSelectRig?.(copiedId);
          onSelectPoseGroup?.(null);
        }
      }
      return copiedId;
    }

    if (select) {
      onSelectRig?.(copiedId);
      onSelectPoseGroup?.(null);
    }
    return copiedId;
  }

  const mapReferencePoseValuesToMain = (
    referencePose: ReferenceFacePose,
    copyMode: PoseCopyMode,
  ): { values: Record<string, number>; unresolved: CopyRetargetIssue[] } => {
    if (copyMode === "pose-only") {
      return { values: {}, unresolved: [] };
    }
    const values: Record<string, number> = {};
    const unresolved: CopyRetargetIssue[] = [];
    const unresolvedKeys = new Set<string>();
    const pushIssue = (
      referenceInputId: string,
      path: string | null,
      reason: string,
    ) => {
      const key = `${referenceInputId}|${path ?? ""}|${reason}`;
      if (unresolvedKeys.has(key)) {
        return;
      }
      unresolvedKeys.add(key);
      unresolved.push({
        referenceInputId,
        path,
        reason,
      });
    };

    Object.entries(referencePose.values ?? {}).forEach(
      ([referenceInputId, value]) => {
        if (!Number.isFinite(value)) {
          return;
        }
        const directMainInput = standardInputsById.get(referenceInputId);
        if (directMainInput) {
          values[directMainInput.id] = value;
          return;
        }
        const mappedPath = referenceInputPathById.get(referenceInputId);
        const referenceInput =
          referenceFace.standardInputsById.get(referenceInputId);
        const resolvedPath = mappedPath
          ? normalizeStandardRigInputPath(mappedPath)
          : referenceInput?.path
            ? normalizeStandardRigInputPath(referenceInput.path)
            : null;
        if (resolvedPath) {
          const mappedMainInput = mainInputByNormalizedPath.get(resolvedPath);
          if (mappedMainInput) {
            values[mappedMainInput.id] = value;
          } else {
            pushIssue(
              referenceInputId,
              resolvedPath,
              `Main face has no variable on ${resolvedPath}.`,
            );
          }
          return;
        }
        const pathCandidate = normalizeStandardRigInputPath(referenceInputId);
        const byPathCandidate = mainInputByNormalizedPath.get(pathCandidate);
        if (byPathCandidate) {
          values[byPathCandidate.id] = value;
          return;
        }
        pushIssue(
          referenceInputId,
          null,
          `No main-face variable mapping was found for "${referenceInputId}".`,
        );
      },
    );

    return {
      values,
      unresolved,
    };
  };

  const normalizeReferencePoseForMain = (
    referencePose: ReferenceFacePose,
    options?: {
      copyMode?: PoseCopyMode;
    },
  ): {
    pose: PoseDefinition | null;
    poseGroups: NonNullable<PoseRigConfigFile["poseGroups"]>;
    unresolved: CopyRetargetIssue[];
  } => {
    const copyMode = options?.copyMode ?? poseCopyMode;
    const referenceGroupPaths = resolveReferencePoseGroupPaths(
      referencePose,
      referencePoseGroupPathById,
    );
    const explicitGroups = referenceGroupPaths.map((path) => ({
      id: sanitizePoseGroupId(path, path),
      path,
      name: humanizePoseGroupName(path),
    }));
    const remappedPoseValues = mapReferencePoseValuesToMain(
      referencePose,
      copyMode,
    );
    const now = new Date().toISOString();
    const referenceDraftPose: PoseDefinition = {
      id: referencePose.id,
      name: referencePose.name || referencePose.id,
      description: referencePose.description,
      group: referenceGroupPaths[0] ?? null,
      groupId: referenceGroupPaths[0]
        ? sanitizePoseGroupId(referenceGroupPaths[0], referenceGroupPaths[0])
        : null,
      groupIds:
        referenceGroupPaths.length > 0
          ? referenceGroupPaths.map((path) => sanitizePoseGroupId(path, path))
          : undefined,
      values: remappedPoseValues.values,
      createdAt: now,
      updatedAt: now,
    };
    const normalized = PoseConfigService.normalize(
      {
        version: 1,
        faceId: null,
        neutralInputs: {},
        poses: [referenceDraftPose],
        poseGroups: explicitGroups,
      },
      Array.from(standardInputsById.values()),
      null,
    ).config;
    const normalizedPose = normalized.poses[0] ?? null;
    return {
      pose: normalizedPose,
      poseGroups: normalized.poseGroups ?? [],
      unresolved: remappedPoseValues.unresolved,
    };
  };

  const resolveNextPoseGroupIdForPath = useCallback(
    (groupPath: string) => {
      const normalizedPath = normalizePoseGroupPath(groupPath);
      const baseId = sanitizePoseGroupId(normalizedPath, normalizedPath);
      const existingIds = new Set(
        poseGroupsFromConfig.map((group) => group.id).filter(Boolean),
      );
      if (!existingIds.has(baseId)) {
        return baseId;
      }
      let counter = 1;
      while (existingIds.has(`${baseId}_${counter}`)) {
        counter += 1;
      }
      return `${baseId}_${counter}`;
    },
    [poseGroupsFromConfig],
  );

  const copyReferencePoseGroupToMain = (
    group: PoseGroupSummary,
    options?: { allowOverwrite?: boolean; select?: boolean },
  ): boolean => {
    if (group.source !== "reference") {
      return false;
    }
    if (group.path === UNASSIGNED_POSE_GROUP_PATH) {
      return false;
    }
    const allowOverwrite = options?.allowOverwrite ?? false;
    const select = options?.select ?? true;
    const existingGroup = poseGroupsFromConfig.find((entry) => {
      const normalizedExistingPath = normalizePoseGroupPath(entry.path);
      return normalizedExistingPath === group.path;
    });

    if (!existingGroup) {
      const createdGroupId = resolveNextPoseGroupIdForPath(group.path);
      createPoseGroup(group.path);
      if (group.blendMode === "average" || group.blendMode === "additive") {
        setPoseGroupBlendMode(createdGroupId, group.blendMode);
      }
      if (select) {
        onSelectPoseGroup?.({
          groupPath: group.path,
          label: group.label,
          groupId: createdGroupId,
          poseIds: [],
          nodeId: createdGroupId,
        });
      }
      return true;
    }

    const existingBlendMode =
      existingGroup.blendMode === "average" ||
      existingGroup.blendMode === "additive"
        ? existingGroup.blendMode
        : poseGroupBlendModeFallback;
    if (
      (group.blendMode === "average" || group.blendMode === "additive") &&
      existingBlendMode !== group.blendMode &&
      !allowOverwrite
    ) {
      setCopyConflictModal({
        title: "Pose Group Copy Conflict",
        message: `Main face already has pose group "${group.label}" with blend mode "${existingBlendMode}".`,
        options: [
          {
            id: "keep-main",
            label: "Keep Main",
            description: "Preserve the existing main-face group settings.",
            variant: "ghost",
          },
          {
            id: "overwrite-main",
            label: "Overwrite Mode",
            description: `Use reference blend mode "${group.blendMode}".`,
            variant: "primary",
          },
          {
            id: "cancel",
            label: "Cancel",
            description: "Close without applying a group update.",
            variant: "ghost",
          },
        ],
        onResolve: (choice) => {
          if (choice === "overwrite-main") {
            copyReferencePoseGroupToMain(group, {
              allowOverwrite: true,
              select,
            });
            return;
          }
          if (choice === "keep-main" && select) {
            onSelectPoseGroup?.({
              groupPath: group.path,
              label: group.label,
              groupId: existingGroup.id,
              poseIds: [],
              nodeId: existingGroup.id,
            });
          }
        },
      });
      return false;
    }

    if (
      allowOverwrite &&
      (group.blendMode === "average" || group.blendMode === "additive")
    ) {
      setPoseGroupBlendMode(existingGroup.id, group.blendMode);
    }
    if (select) {
      onSelectPoseGroup?.({
        groupPath: group.path,
        label: group.label,
        groupId: existingGroup.id,
        poseIds: [],
        nodeId: existingGroup.id,
      });
    }
    return true;
  };

  const copyReferencePoseToMain = (
    referencePose: ReferenceFacePose,
    options?: {
      select?: boolean;
      allowOverwrite?: boolean;
      duplicate?: boolean;
      copyMode?: PoseCopyMode;
      allowPartialTargets?: boolean;
    },
  ): boolean => {
    const select = options?.select ?? true;
    const allowOverwrite = options?.allowOverwrite ?? false;
    const duplicate = options?.duplicate ?? false;
    const copyMode = options?.copyMode ?? poseCopyMode;
    const allowPartialTargets = options?.allowPartialTargets ?? false;
    const normalized = normalizeReferencePoseForMain(referencePose, {
      copyMode,
    });
    const normalizedPose = normalized.pose;
    if (!normalizedPose) {
      return false;
    }
    if (
      copyMode === "with-targets" &&
      normalized.unresolved.length > 0 &&
      !allowPartialTargets
    ) {
      setCopyRetargetModal({
        title: "Pose Target Retargeting Needed",
        message: `Pose "${referencePose.name || referencePose.id}" references ${normalized.unresolved.length} target channel(s) that are not available on the main face.`,
        issues: normalized.unresolved,
        options: [
          {
            id: "copy-mapped-targets",
            label: "Copy Mapped Targets",
            description:
              "Copy this pose with target values that could be mapped; unresolved targets are omitted.",
            variant: "primary",
          },
          {
            id: "copy-pose-only",
            label: "Copy Pose Only",
            description:
              "Copy only pose metadata/groups so you can author target values manually.",
            variant: "ghost",
          },
          {
            id: "cancel",
            label: "Cancel",
            description: "Close this dialog without copying this pose.",
            variant: "ghost",
          },
        ],
        onResolve: (choice) => {
          if (choice === "copy-mapped-targets") {
            copyReferencePoseToMain(referencePose, {
              ...options,
              copyMode: "with-targets",
              allowPartialTargets: true,
            });
            return;
          }
          if (choice === "copy-pose-only") {
            copyReferencePoseToMain(referencePose, {
              ...options,
              copyMode: "pose-only",
              allowPartialTargets: true,
            });
          }
        },
      });
      return false;
    }

    const referenceGroupPath = normalizePoseGroupPath(normalizedPose.group);
    const identityKey = normalizePoseIdentityKey(
      normalizedPose.name,
      referenceGroupPath,
    );
    const existingMainPose = mainPoseByIdentityKey.get(identityKey);
    if (existingMainPose && !allowOverwrite && !duplicate) {
      setCopyConflictModal({
        title: "Pose Copy Conflict",
        message: `Main face already has pose "${existingMainPose.name}" in this group.`,
        options: [
          {
            id: "keep-main",
            label: "Keep Main",
            description: "Skip copy and keep the existing main pose.",
            variant: "ghost",
          },
          {
            id: "overwrite-main",
            label: "Overwrite Main",
            description:
              "Replace the existing main pose definition with the reference pose.",
            variant: "primary",
          },
          {
            id: "duplicate",
            label: "Copy as Duplicate",
            description: "Create a second main pose with a unique name.",
            variant: "ghost",
          },
          {
            id: "cancel",
            label: "Cancel",
            description: "Close without copying this pose.",
            variant: "ghost",
          },
        ],
        onResolve: (choice) => {
          if (choice === "overwrite-main") {
            copyReferencePoseToMain(referencePose, {
              select,
              allowOverwrite: true,
              copyMode,
              allowPartialTargets,
            });
            return;
          }
          if (choice === "duplicate") {
            copyReferencePoseToMain(referencePose, {
              select,
              duplicate: true,
              copyMode,
              allowPartialTargets,
            });
            return;
          }
          if (choice === "keep-main" && select) {
            onSelectPose?.(existingMainPose.id);
            onSelectRig?.(null);
            onSelectPoseGroup?.(null);
          }
        },
      });
      return false;
    }

    normalized.poseGroups.forEach((group) => {
      const normalizedPath = normalizePoseGroupPath(group.path);
      if (!normalizedPath || normalizedPath === UNASSIGNED_POSE_GROUP_PATH) {
        return;
      }
      const summary: PoseGroupSummary = {
        id: `reference:normalized:${group.id}`,
        path: normalizedPath,
        label: poseGroupDisplayLabel(normalizedPath),
        blendMode:
          group.blendMode === "average" || group.blendMode === "additive"
            ? group.blendMode
            : poseGroupBlendModeFallback,
        source: "reference",
        poseIds: [referencePose.id],
      };
      copyReferencePoseGroupToMain(summary, {
        allowOverwrite: true,
        select: false,
      });
    });

    if (existingMainPose && allowOverwrite) {
      replacePoseDefinition(existingMainPose.id, {
        ...normalizedPose,
        id: existingMainPose.id,
        createdAt: existingMainPose.createdAt,
        updatedAt: new Date().toISOString(),
      });
      if (select) {
        onSelectPose?.(existingMainPose.id);
        onSelectRig?.(null);
        onSelectPoseGroup?.(null);
      }
      return true;
    }

    const poseToAdd: PoseDefinition = duplicate
      ? {
          ...normalizedPose,
          name: `${normalizedPose.name} (Ref)`,
          id: `${normalizedPose.id}_reference_copy`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : normalizedPose;
    if (select) {
      pendingPoseSelectionRef.current = true;
    }
    addPoseDefinition(poseToAdd);
    if (select) {
      onSelectRig?.(null);
      onSelectPoseGroup?.(null);
    }
    return true;
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

    const hasReferenceFace = Boolean(referenceFace.file);
    const mainRoot: TreeNode = hasReferenceFace
      ? {
          id: "main_poses",
          label: "Main Face",
          type: "folder",
          children: new Map(),
          showChildren: true,
        }
      : root;

    if (hasReferenceFace) {
      root.children.set(mainRoot.id, mainRoot);
    }

    poses.forEach((pose) => {
      const primaryGroupPath =
        mainPosePrimaryGroupPathById.get(pose.id) ??
        normalizePoseGroupPath(pose.group) ??
        null;
      const groupParts = primaryGroupPath
        ? primaryGroupPath.split("/").filter(Boolean)
        : [];
      let current = mainRoot;
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

      const poseKey = `main_pose_${pose.id}`;
      current.children.set(poseKey, {
        id: `${current.id}/${poseKey}`,
        label: pose.name,
        type: "pose",
        children: new Map(),
        showChildren: false,
        data: {
          kind: "pose",
          source: "main",
          pose,
          primaryGroupPath,
        },
      });
    });

    if (hasReferenceFace) {
      const referenceRoot: TreeNode = {
        id: "reference_poses",
        label: "Reference Face",
        type: "folder",
        children: new Map(),
        showChildren: true,
      };

      if (referenceFace.isLoaded) {
        referenceFace.referencePoses.forEach((pose) => {
          const groupPaths = resolveReferencePoseGroupPaths(
            pose,
            referencePoseGroupPathById,
          );
          const primaryGroupPath = groupPaths[0] ?? null;
          const groupParts = primaryGroupPath
            ? primaryGroupPath.split("/").filter(Boolean)
            : [];
          let current = referenceRoot;
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
          const poseKey = `reference_pose_${pose.id}`;
          current.children.set(poseKey, {
            id: `${current.id}/${poseKey}`,
            label: pose.name || pose.id,
            type: "pose",
            children: new Map(),
            showChildren: false,
            data: {
              kind: "pose",
              source: "reference",
              pose,
              primaryGroupPath,
            },
          });
        });
      } else {
        referenceRoot.children.set("placeholder", {
          id: "reference_pose_placeholder",
          label: referenceFace.isLoading ? "Loading..." : "Waiting for file...",
          type: "folder",
          children: new Map(),
          showChildren: false,
        });
      }

      root.children.set(referenceRoot.id, referenceRoot);
    }

    const simplifiedChildren = new Map<string, TreeNode>();
    for (const [key, child] of root.children) {
      simplifiedChildren.set(key, simplifyNode(child));
    }
    root.children = simplifiedChildren;

    return root;
  }, [
    mainPosePrimaryGroupPathById,
    poses,
    referenceFace.file,
    referenceFace.isLoaded,
    referenceFace.isLoading,
    referenceFace.referencePoses,
    referencePoseGroupPathById,
  ]);

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
    const allMain = poseIds.every((poseId) => mainPoseIds.has(poseId));
    if (!allMain) {
      onSelectPoseGroup?.(null);
      return;
    }
    const matchingGroup = mainPoseGroups.find(
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
    if (group.source === "reference") {
      onSelectPoseGroup?.(null);
      onSelectRig?.(null);
      return;
    }
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
    if (group.source === "reference") {
      return;
    }
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

  const handleAction = (node: TreeNode, action: string) => {
    const poseNodeData =
      node.type === "pose"
        ? ((node.data as PoseTreeNodeData | undefined) ?? undefined)
        : undefined;
    const fallbackPoseData =
      node.type === "pose"
        ? ((node.data as PoseDefinition | undefined) ?? undefined)
        : undefined;
    const isReferencePoseNode = poseNodeData?.source === "reference";
    const mainPoseData =
      !isReferencePoseNode && poseNodeData
        ? (poseNodeData.pose as PoseDefinition)
        : !isReferencePoseNode
          ? fallbackPoseData
          : undefined;

    if (node.type === "pose" && action === "play") {
      if (!mainPoseData) {
        return;
      }
      const poseData = mainPoseData;
      if (!setPoseWeightSolo(poseData.id)) {
        applyPose(poseData.id);
      }
      return;
    }
    if (node.type === "pose" && action === "duplicate-pose") {
      if (!mainPoseData) {
        return;
      }
      const poseData = mainPoseData;
      if (poseData.id === "__pose_rig_neutral__") {
        return;
      }
      pendingPoseSelectionRef.current = true;
      duplicatePose(poseData.id);
      onSelectPoseGroup?.(null);
      return;
    }
    if (node.type === "pose" && action === "delete-pose") {
      if (!mainPoseData) {
        return;
      }
      const poseData = mainPoseData;
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
    if (node.type === "pose" && action === "copy-pose-to-main") {
      if (!poseNodeData || poseNodeData.source !== "reference") {
        return;
      }
      copyReferencePoseToMain(poseNodeData.pose as ReferenceFacePose, {
        select: true,
        copyMode: poseCopyMode,
      });
      return;
    }
    if (node.type === "rig" && action === "copy-to-main") {
      const rigData = node.data as RigNodeData;
      if (rigData.source === "reference") {
        copyReferenceVariableToMainWithMode(rigData, {
          select: true,
          copyMode: variableCopyMode,
        });
      }
      return;
    }
    if (node.type === "input" && action === "copy-input-to-main") {
      const inputData = node.data as InputListRow;
      if (inputData.source === "reference" && inputData.referenceEntry) {
        copyReferenceVariableToMainWithMode(inputData.referenceEntry, {
          select: true,
          copyMode: variableCopyMode,
        });
      }
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
        `Delete custom variable "${label}"?\n\nThis removes the variable plus linked pose targets and binding routes.`,
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
    }
  };

  const handleSelect = (node: TreeNode) => {
    if (node.type === "pose") {
      const poseData = node.data as
        | PoseTreeNodeData
        | PoseDefinition
        | undefined;
      const isReferencePose =
        typeof poseData === "object" &&
        poseData !== null &&
        "kind" in poseData &&
        poseData.kind === "pose" &&
        poseData.source === "reference";
      if (isReferencePose) {
        onSelectPoseGroup?.(null);
        onSelectRig?.(null);
        return;
      }
      const poseId =
        poseData && "kind" in poseData && poseData.kind === "pose"
          ? poseData.pose.id
          : poseData && "id" in poseData && typeof poseData.id === "string"
            ? poseData.id
            : null;
      if (!poseId) {
        return;
      }
      onSelectPoseGroup?.(null);
      if (onSelectPose) {
        onSelectPose(poseId);
      } else {
        selectPose(poseId);
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
      if (inputData.source === "reference") {
        onSelectRig?.(inputData.linkedMainInputId ?? null);
      } else {
        onSelectRig?.(inputData.inputId);
      }
      onSelectPoseGroup?.(null);
    }
  };

  const handleCreate = () => {
    const newInput = handleCreateCustomStandardInput(searchQuery);
    if (newInput) {
      onSelectRig?.(newInput.id);
      setSearchQuery(""); // clear search on create? or keep it? VariableSelector kept it but here maybe clear is better or select it.
      // If we keep search, we see it.
    }
  };

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
    const copiedPaths = new Set<string>();
    for (const entry of referenceRigEntries) {
      const normalizedPath = entry.normalizedPath
        ? normalizeStandardRigInputPath(entry.normalizedPath)
        : normalizeStandardRigInputPath(entry.input.path);
      if (copiedPaths.has(normalizedPath)) {
        continue;
      }
      copiedPaths.add(normalizedPath);
      if (entry.linkedMainInputId) {
        continue;
      }
      const copied = copyReferenceVariableToMainWithMode(entry, {
        select: false,
        copyMode: variableCopyMode,
      });
      if (!copied) {
        break;
      }
      if (!firstCopied && copied) {
        firstCopied = copied;
      }
    }
    if (firstCopied) {
      onSelectRig?.(firstCopied);
      onSelectPoseGroup?.(null);
    }
  };

  const handleCopyReferencePosesToMain = () => {
    for (const pose of referenceFace.referencePoses) {
      const completed = copyReferencePoseToMain(pose, {
        select: false,
        copyMode: poseCopyMode,
      });
      if (!completed) {
        break;
      }
    }
  };

  const handleCopyReferencePoseGroupsToMain = () => {
    for (const group of referencePoseGroupSummaries) {
      if (group.path === UNASSIGNED_POSE_GROUP_PATH) {
        continue;
      }
      const completed = copyReferencePoseGroupToMain(group, { select: false });
      if (!completed) {
        break;
      }
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

  const showCreateOption =
    activeSurface === "variables" &&
    searchQuery.trim().length > 0 &&
    !managedStandardInputs.some(
      (m) => m.input.id.toLowerCase() === searchQuery.trim().toLowerCase(),
    );

  const variableItemCount =
    mainFaceRigEntries.length +
    referenceRigEntries.length +
    sharedRigEntries.length;
  const poseItemCount =
    poses.length +
    (referenceFace.isLoaded ? referenceFace.referencePoses.length : 0);
  const poseGroupItemCount =
    mainPoseGroups.length + referencePoseGroupSummaries.length;
  const inputItemCount = inputRows.length;
  const visibleReferencePoseGroups = useMemo(() => {
    const trimmed = searchQuery.trim().toLowerCase();
    if (!trimmed) {
      return referencePoseGroupSummaries;
    }
    return referencePoseGroupSummaries.filter((group) => {
      if (
        poseGroupDisplayLabel(group.path).toLowerCase().includes(trimmed) ||
        group.path.toLowerCase().includes(trimmed) ||
        group.poseIds.some((poseId) => poseId.toLowerCase().includes(trimmed))
      ) {
        return true;
      }
      return false;
    });
  }, [referencePoseGroupSummaries, searchQuery]);
  const poseGroupsForSurface = useMemo(() => {
    const list = [...visibleMainPoseGroups, ...visibleReferencePoseGroups];
    list.sort((a, b) => {
      if (a.source !== b.source) {
        if (a.source === "configured") return -1;
        if (b.source === "configured") return 1;
        if (a.source === "auto") return -1;
        if (b.source === "auto") return 1;
      }
      return poseGroupDisplayLabel(a.path).localeCompare(
        poseGroupDisplayLabel(b.path),
      );
    });
    return list;
  }, [visibleMainPoseGroups, visibleReferencePoseGroups]);
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
  const uncopiedReferencePoseCount = referenceFace.referencePoses.filter(
    (pose) => {
      const groupPaths = resolveReferencePoseGroupPaths(
        pose,
        referencePoseGroupPathById,
      );
      const key = normalizePoseIdentityKey(pose.name, groupPaths[0] ?? null);
      return !mainPoseByIdentityKey.has(key);
    },
  ).length;
  const uncopiedReferencePoseGroupCount = referencePoseGroupSummaries.filter(
    (group) =>
      group.path !== UNASSIGNED_POSE_GROUP_PATH &&
      !mainPoseGroups.some((mainGroup) => mainGroup.path === group.path),
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
        label: formatSurfaceLabelWithCount("Variables", variableItemCount),
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
      title="Control Elements"
      description={
        "Author and organize variables, poses, pose groups, and inputs."
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
          if (surfaceForTab(id) !== activeSurface) {
            return null;
          }
          const isVariables = id === "variables";
          const isPoseGroups = id === "pose-groups";
          const isPoses = id === "poses";
          const isInputs = id === "inputs";
          const filteredSearch = searchQuery.trim().toLowerCase();
          const hasReferenceFace = Boolean(referenceFace.file);
          const surfaceCopyScope = isVariables
            ? "variables"
            : isPoses
              ? "poses"
              : isPoseGroups
                ? "pose groups"
                : "inputs";

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
                        ? "Search or create variable..."
                        : isPoses
                          ? "Search poses..."
                          : isPoseGroups
                            ? "Search pose groups..."
                            : "Search inputs..."
                  }
                />
              </div>
              {hasReferenceFace && (
                <div className="mx-1 mb-2 rounded border border-border-default/50 bg-bg-panel/40 px-2 py-1.5 flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-text-muted">
                    Copy Flow
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-900/40 text-cyan-200">
                    Reference Face
                  </span>
                  <span className="text-[10px] text-text-muted">→</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-200">
                    Main Face
                  </span>
                  <span className="text-[10px] text-text-muted">
                    {`Copy ${surfaceCopyScope} from reference to main.`}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-1 px-1 mb-1">
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
                {isVariables && hasReferenceFace && (
                  <div className="flex items-center gap-1 rounded border border-border-default/40 px-1.5 py-0.5">
                    <span className="text-[10px] text-text-muted">Mode</span>
                    <button
                      type="button"
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        variableCopyMode === "variable-only"
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-border-default text-text-muted hover:text-text-primary"
                      }`}
                      onClick={() => setVariableCopyMode("variable-only")}
                      title="Copy variable metadata only"
                    >
                      Vars Only
                    </button>
                    <button
                      type="button"
                      className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                        variableCopyMode === "with-bindings"
                          ? "border-accent/50 bg-accent/10 text-accent"
                          : "border-border-default text-text-muted hover:text-text-primary"
                      }`}
                      onClick={() => setVariableCopyMode("with-bindings")}
                      title="Copy variable metadata and parent/input binding logic"
                    >
                      With Bindings
                    </button>
                  </div>
                )}
                {isVariables && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
                    onClick={handleCopyReferenceToMain}
                    disabled={uncopiedReferenceCount === 0}
                    title="Copy reference-only variables to main face (one-way)"
                  >
                    <Copy size={11} />
                    Copy Ref Vars → Main ({uncopiedReferenceCount})
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
                    {hasReferenceFace && (
                      <div className="flex items-center gap-1 rounded border border-border-default/40 px-1.5 py-0.5">
                        <span className="text-[10px] text-text-muted">
                          Mode
                        </span>
                        <button
                          type="button"
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            poseCopyMode === "pose-only"
                              ? "border-accent/50 bg-accent/10 text-accent"
                              : "border-border-default text-text-muted hover:text-text-primary"
                          }`}
                          onClick={() => setPoseCopyMode("pose-only")}
                          title="Copy pose metadata/groups only"
                        >
                          Pose Only
                        </button>
                        <button
                          type="button"
                          className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                            poseCopyMode === "with-targets"
                              ? "border-accent/50 bg-accent/10 text-accent"
                              : "border-border-default text-text-muted hover:text-text-primary"
                          }`}
                          onClick={() => setPoseCopyMode("with-targets")}
                          title="Copy pose targets mapped to main-face variables"
                        >
                          With Targets
                        </button>
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
                      onClick={handleCopyReferencePosesToMain}
                      disabled={uncopiedReferencePoseCount === 0}
                      title="Copy reference poses to main face (one-way)"
                    >
                      <Copy size={11} />
                      Copy Ref Poses → Main ({uncopiedReferencePoseCount})
                    </Button>
                  </>
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
                      onClick={handleCopyReferencePoseGroupsToMain}
                      disabled={uncopiedReferencePoseGroupCount === 0}
                      title="Copy reference pose groups to main face (one-way)"
                    >
                      <Copy size={11} />
                      Copy Ref Groups → Main ({uncopiedReferencePoseGroupCount})
                    </Button>
                    <span className="text-[10px] uppercase tracking-wider text-text-muted">
                      Compatibility blend
                    </span>
                  </>
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
                        Create "
                        <span className="text-accent">{searchQuery}</span>"
                      </span>
                      <span className="text-[10px] text-text-muted">
                        Create and select new variable
                      </span>
                    </div>
                  </div>
                )}

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
                        const isReferenceGroup = group.source === "reference";
                        const isMember =
                          !isReferenceGroup &&
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
                                {isReferenceGroup ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 px-2 text-[10px]"
                                    disabled={isUnassigned}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      copyReferencePoseGroupToMain(group, {
                                        select: true,
                                      });
                                    }}
                                    title={
                                      isUnassigned
                                        ? "Unassigned is derived and cannot be copied"
                                        : "Copy pose group to main face"
                                    }
                                  >
                                    Copy → Main
                                  </Button>
                                ) : (
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
                                )}
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
                      filteredSearch.length > 0
                        ? "No results"
                        : isVariables
                          ? "No variables defined"
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
                          ? "Create new variables or import a model with poses."
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
      <Modal
        open={Boolean(copyConflictModal)}
        onClose={() => setCopyConflictModal(null)}
        title={copyConflictModal?.title ?? "Copy Conflict"}
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            {copyConflictModal?.message ?? ""}
          </p>
          <div className="grid gap-2">
            {(copyConflictModal?.options ?? []).map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "w-full rounded border px-3 py-2 text-left transition-colors",
                  option.variant === "primary"
                    ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
                    : "border-border-default text-text-primary hover:bg-bg-panel/40",
                )}
                onClick={() => {
                  copyConflictModal?.onResolve(option.id);
                  setCopyConflictModal(null);
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">
                  {option.label}
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(copyRetargetModal)}
        onClose={() => setCopyRetargetModal(null)}
        title={copyRetargetModal?.title ?? "Retargeting Needed"}
        maxWidth="lg"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">
            {copyRetargetModal?.message ?? ""}
          </p>
          {copyRetargetModal && copyRetargetModal.issues.length > 0 && (
            <div className="rounded border border-border-default/50 bg-bg-panel/40 p-2 max-h-56 overflow-y-auto">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
                Unresolved Routes ({copyRetargetModal.issues.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {copyRetargetModal.issues.slice(0, 20).map((issue, index) => (
                  <div
                    key={`${issue.referenceInputId}:${issue.path ?? "none"}:${index}`}
                    className="rounded border border-border-default/40 bg-bg-panel/30 px-2 py-1"
                  >
                    <div className="text-[10px] font-mono text-text-primary">
                      {issue.referenceInputId}
                    </div>
                    {issue.path && (
                      <div className="text-[10px] text-text-muted font-mono">
                        {issue.path}
                      </div>
                    )}
                    <div className="text-[10px] text-text-muted">
                      {issue.reason}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-2">
            {(copyRetargetModal?.options ?? []).map((option) => (
              <button
                key={option.id}
                type="button"
                className={cn(
                  "w-full rounded border px-3 py-2 text-left transition-colors",
                  option.variant === "primary"
                    ? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
                    : "border-border-default text-text-primary hover:bg-bg-panel/40",
                )}
                onClick={() => {
                  copyRetargetModal?.onResolve(option.id);
                  setCopyRetargetModal(null);
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide">
                  {option.label}
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  {option.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
