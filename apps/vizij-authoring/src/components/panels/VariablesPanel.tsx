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
  X,
} from "lucide-react";
import {
  addBindingSlot,
  buildCanonicalBindingExpression,
  bindingTargetFromInput,
  bindingToDefinition,
  createDefaultParentBinding,
  ensureBindingStructure,
  updateBindingWithInput,
  type AnimatableBinding,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import {
  buildRigPipelineV1LinkId,
  normalizeStandardRigInputPath,
  SELF_BINDING_ID,
} from "@vizij/utils";
import type { StandardRigInput } from "@vizij/utils";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Combobox, PanelSearch, TreeRow, Tabs } from "../ui";
import { Slider } from "../ui/Slider";
import { useReferenceFace } from "../../state/ReferenceFaceContext";
import { usePoseRig } from "../../state/PoseRigProvider";
import { useBindingAuthoring } from "../../state/RigControllerProvider";
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
  buildPoseWeightRelativePath,
  isPoseControlInputPath,
  isPoseOutputInputPath,
  parsePoseWeightInputSourceId,
  resolveDeterministicPoseId,
} from "../../poseRig/utils";
import {
  buildPoseCopyProposal,
  buildVariableCopyProposal,
  validatePoseCopyProposalPreflight,
} from "../../referenceFace/mapping";
import type {
  MergeDecisionMode,
  PoseCopyProposal,
  PoseTargetMappingRow,
  ReferenceCatalog,
  ReferenceCatalogInput,
  ReferenceCatalogPipelineLink,
  ReferencePoseDefinition,
  VariableCopyProposal,
  VariableLinkMappingRow,
} from "../../referenceFace/types";
import type { ManagedStandardInput } from "../../types/standardInputs";
import type {
  BlendStageInspectorSelection,
  PoseGroupInspectorSelection,
} from "../../types/poseGroupInspector";

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

function blendStageSourceToken(source: PoseIrStageSource): string {
  return `${source.kind}:${source.id}`;
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

interface PoseNodeData {
  source: "main" | "reference";
  pose: PoseDefinition | ReferencePoseDefinition;
}

type TreeNodeData =
  | PoseNodeData
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
    id?: string;
    inputId?: string | null;
  }>;
  metadata?: unknown;
}

interface VariableCopyNumericDecisionDraft {
  mode: MergeDecisionMode;
  customValue: string;
}

interface VariableCopyLinkRowDraft {
  apply: boolean;
  destinationInputId: string;
  searchQuery: string;
  scale: VariableCopyNumericDecisionDraft;
  offset: VariableCopyNumericDecisionDraft;
}

interface VariableCopyModalState {
  sourceReferenceEntry: RigNodeData;
  proposal: VariableCopyProposal;
  destinationCatalog: ReferenceCatalog;
  launchSource: "row-action" | "toolbar";
  destinationMode: "existing" | "new";
  destinationInputId: string;
  newDestinationPath: string;
  newDestinationLabel: string;
  valueMerge: {
    min: VariableCopyNumericDecisionDraft;
    max: VariableCopyNumericDecisionDraft;
    defaultValue: VariableCopyNumericDecisionDraft;
  };
  parentRowDrafts: Record<string, VariableCopyLinkRowDraft>;
  childRowDrafts: Record<string, VariableCopyLinkRowDraft>;
}

interface PoseCopyTargetRowDraft {
  destinationInputId: string;
  searchQuery: string;
  value: VariableCopyNumericDecisionDraft;
}

interface PoseCopyModalState {
  sourcePose: ReferencePoseDefinition;
  proposal: PoseCopyProposal;
  destinationCatalog: ReferenceCatalog;
  launchSource: "row-action" | "toolbar";
  destinationPoseName: string;
  targetRowDrafts: Record<string, PoseCopyTargetRowDraft>;
}

interface VariableCopyCommitLinkPlan {
  rowId: string;
  relationship: "parent" | "child";
  parentInputId: string;
  childInputId: string;
  scale: number;
  offset: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeCatalogPath(path: string | null | undefined): string {
  if (!path) {
    return "";
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return "";
  }
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+/g, "/").replace(/\/$/, "").toLowerCase();
}

function normalizeLookupLabel(label: string | null | undefined): string {
  if (!label) {
    return "";
  }
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function stripReferenceInputTokenPrefix(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("input_")) {
    const stripped = trimmed.slice("input_".length).trim();
    return stripped.length > 0 ? stripped : null;
  }
  if (trimmed.startsWith("input/")) {
    const stripped = trimmed.slice("input/".length).trim();
    return stripped.length > 0 ? stripped : null;
  }
  return null;
}

function normalizeComboboxPathQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

function filterCatalogInputsByPathQuery<
  TInput extends Pick<ReferenceCatalogInput, "path">,
>(inputs: readonly TInput[], query: string): TInput[] {
  const normalizedQuery = normalizeComboboxPathQuery(query);
  if (normalizedQuery.length === 0) {
    return [...inputs];
  }
  return inputs.filter((input) =>
    normalizeComboboxPathQuery(input.path).includes(normalizedQuery),
  );
}

function resolveUniqueCatalogInputByPathQuery<
  TInput extends Pick<ReferenceCatalogInput, "path">,
>(inputs: readonly TInput[], query: string): TInput | null {
  const matches = filterCatalogInputsByPathQuery(inputs, query);
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sortCatalogInputs(
  left: Pick<ReferenceCatalogInput, "path" | "id">,
  right: Pick<ReferenceCatalogInput, "path" | "id">,
): number {
  const byPath = left.path.localeCompare(right.path);
  if (byPath !== 0) {
    return byPath;
  }
  return left.id.localeCompare(right.id);
}

function extractBindingPipelineLinks(
  binding: BindingInputLike | null | undefined,
): ReferenceCatalogPipelineLink[] {
  const metadata = asRecord(binding?.metadata);
  const vizij = asRecord(metadata?.vizij);
  const pipeline = asRecord(vizij?.pipelineV1);
  const links = asRecord(pipeline?.links);
  if (!links) {
    return [];
  }
  const entries: ReferenceCatalogPipelineLink[] = [];
  Object.entries(links).forEach(([rawLinkId, rawLinkConfig]) => {
    const linkConfig = asRecord(rawLinkConfig);
    if (!linkConfig) {
      return;
    }
    const parentInputId =
      typeof linkConfig.parentInputId === "string"
        ? linkConfig.parentInputId.trim()
        : "";
    const childInputId =
      typeof linkConfig.childInputId === "string"
        ? linkConfig.childInputId.trim()
        : "";
    if (!parentInputId || !childInputId) {
      return;
    }
    const candidateLinkId =
      typeof linkConfig.linkId === "string"
        ? linkConfig.linkId.trim()
        : rawLinkId.trim();
    const linkId =
      candidateLinkId || buildRigPipelineV1LinkId(parentInputId, childInputId);
    entries.push({
      linkId,
      parentInputId,
      childInputId,
      scale: isFiniteNumber(linkConfig.scale) ? linkConfig.scale : 1,
      offset: isFiniteNumber(linkConfig.offset) ? linkConfig.offset : 0,
      enabled:
        typeof linkConfig.enabled === "boolean" ? linkConfig.enabled : true,
      source: "pipeline-link",
    });
  });
  return entries.sort((left, right) => {
    const byChild = left.childInputId.localeCompare(right.childInputId);
    if (byChild !== 0) {
      return byChild;
    }
    const byParent = left.parentInputId.localeCompare(right.parentInputId);
    if (byParent !== 0) {
      return byParent;
    }
    return left.linkId.localeCompare(right.linkId);
  });
}

function extractPipelineParentLinksFromConfig(params: {
  childInputId: string;
  config: Record<string, unknown> | null;
}): ReferenceCatalogPipelineLink[] {
  if (!params.config) {
    return [];
  }
  const parentRecords = Array.isArray(params.config.parents)
    ? params.config.parents
    : null;
  if (!parentRecords) {
    return [];
  }
  const links: ReferenceCatalogPipelineLink[] = [];
  parentRecords.forEach((rawParent) => {
    const parentRecord = asRecord(rawParent);
    if (!parentRecord) {
      return;
    }
    const parentInputId =
      typeof parentRecord.inputId === "string"
        ? parentRecord.inputId.trim()
        : "";
    if (!parentInputId) {
      return;
    }
    const candidateLinkId =
      typeof parentRecord.linkId === "string" ? parentRecord.linkId.trim() : "";
    const linkId =
      candidateLinkId ||
      buildRigPipelineV1LinkId(parentInputId, params.childInputId);
    links.push({
      linkId,
      parentInputId,
      childInputId: params.childInputId,
      scale: isFiniteNumber(parentRecord.scale) ? parentRecord.scale : 1,
      offset: isFiniteNumber(parentRecord.offset) ? parentRecord.offset : 0,
      enabled:
        typeof parentRecord.enabled === "boolean" ? parentRecord.enabled : true,
      source: "by-input-parent",
    });
  });
  return links;
}

function buildMainFaceReferenceCatalog(params: {
  mainInputs: readonly StandardRigInput[];
  inputBindings: Record<string, BindingInputLike | undefined>;
  pipelineConfigByInputId?: Record<string, Record<string, unknown>>;
}): ReferenceCatalog {
  const baseInputs = params.mainInputs
    .filter((input) => Boolean(input.path?.trim()))
    .map((input) => ({
      id: input.id,
      path: input.path,
      label: input.label,
      defaultValue: input.defaultValue,
      range: {
        min: input.range.min,
        max: input.range.max,
      },
    }))
    .sort(sortCatalogInputs);
  const baseInputsById = new Map(baseInputs.map((input) => [input.id, input]));

  const linksByPair = new Map<string, ReferenceCatalogPipelineLink>();
  const makePairKey = (parentInputId: string, childInputId: string) =>
    `${parentInputId}::${childInputId}`;

  Object.entries(params.inputBindings).forEach(([childInputId, binding]) => {
    if (!baseInputsById.has(childInputId)) {
      return;
    }
    extractBindingPipelineLinks(binding).forEach((link) => {
      if (
        !baseInputsById.has(link.parentInputId) ||
        !baseInputsById.has(link.childInputId)
      ) {
        return;
      }
      const pairKey = makePairKey(link.parentInputId, link.childInputId);
      const existing = linksByPair.get(pairKey);
      if (!existing) {
        linksByPair.set(pairKey, link);
        return;
      }
      linksByPair.set(pairKey, {
        ...existing,
        ...link,
        source:
          existing.source === "by-input-parent" ? "merged" : existing.source,
      });
    });
  });

  Object.entries(params.pipelineConfigByInputId ?? {}).forEach(
    ([childInputId, rawConfig]) => {
      if (!baseInputsById.has(childInputId)) {
        return;
      }
      extractPipelineParentLinksFromConfig({
        childInputId,
        config: asRecord(rawConfig),
      }).forEach((link) => {
        if (
          !baseInputsById.has(link.parentInputId) ||
          !baseInputsById.has(link.childInputId)
        ) {
          return;
        }
        const pairKey = makePairKey(link.parentInputId, link.childInputId);
        const existing = linksByPair.get(pairKey);
        if (!existing) {
          linksByPair.set(pairKey, link);
          return;
        }
        if (existing.source === "pipeline-link") {
          linksByPair.set(pairKey, {
            ...existing,
            source: "merged",
          });
        }
      });
    },
  );

  Object.entries(params.inputBindings).forEach(([childInputId, binding]) => {
    if (!baseInputsById.has(childInputId)) {
      return;
    }
    collectBindingInputIds(binding).forEach((parentInputId) => {
      if (!baseInputsById.has(parentInputId)) {
        return;
      }
      const pairKey = makePairKey(parentInputId, childInputId);
      const existing = linksByPair.get(pairKey);
      if (!existing) {
        linksByPair.set(pairKey, {
          linkId: buildRigPipelineV1LinkId(parentInputId, childInputId),
          parentInputId,
          childInputId,
          scale: 1,
          offset: 0,
          enabled: true,
          source: "by-input-parent",
        });
        return;
      }
      if (existing.source === "pipeline-link") {
        linksByPair.set(pairKey, { ...existing, source: "merged" });
      }
    });
  });

  const pipelineLinks = Array.from(linksByPair.values()).sort((left, right) => {
    const byChild = left.childInputId.localeCompare(right.childInputId);
    if (byChild !== 0) {
      return byChild;
    }
    const byParent = left.parentInputId.localeCompare(right.parentInputId);
    if (byParent !== 0) {
      return byParent;
    }
    return left.linkId.localeCompare(right.linkId);
  });

  const parentsByInputId = new Map<
    string,
    Array<{
      linkId: string;
      parentInputId: string;
      scale: number;
      offset: number;
      enabled: boolean;
    }>
  >();
  const childrenByInputId = new Map<
    string,
    Array<{
      linkId: string;
      childInputId: string;
      scale: number;
      offset: number;
      enabled: boolean;
    }>
  >();

  pipelineLinks.forEach((link) => {
    const parents = parentsByInputId.get(link.childInputId) ?? [];
    parents.push({
      linkId: link.linkId,
      parentInputId: link.parentInputId,
      scale: link.scale,
      offset: link.offset,
      enabled: link.enabled,
    });
    parentsByInputId.set(link.childInputId, parents);

    const children = childrenByInputId.get(link.parentInputId) ?? [];
    children.push({
      linkId: link.linkId,
      childInputId: link.childInputId,
      scale: link.scale,
      offset: link.offset,
      enabled: link.enabled,
    });
    childrenByInputId.set(link.parentInputId, children);
  });

  const inputs = baseInputs.map((input) => ({
    ...input,
    parents: (parentsByInputId.get(input.id) ?? []).sort((left, right) => {
      const byParent = left.parentInputId.localeCompare(right.parentInputId);
      if (byParent !== 0) {
        return byParent;
      }
      return left.linkId.localeCompare(right.linkId);
    }),
    children: (childrenByInputId.get(input.id) ?? []).sort((left, right) => {
      const byChild = left.childInputId.localeCompare(right.childInputId);
      if (byChild !== 0) {
        return byChild;
      }
      return left.linkId.localeCompare(right.linkId);
    }),
  }));

  const inputsById = new Map(inputs.map((input) => [input.id, input]));
  const inputsByPath = new Map<string, readonly ReferenceCatalogInput[]>();
  inputs.forEach((input) => {
    const key = normalizeCatalogPath(input.path);
    const existing = inputsByPath.get(key) ?? [];
    inputsByPath.set(key, [...existing, input].sort(sortCatalogInputs));
  });

  return {
    inputs,
    inputsById,
    inputsByPath,
    pipelineLinks,
    poses: [],
    posesById: new Map(),
  };
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

function toDecisionCustomValue(value: number): string {
  return Number.isFinite(value) ? value.toString(10) : "";
}

function createVariableCopyNumericDecisionDraft(params: {
  fallbackValue: number;
}): VariableCopyNumericDecisionDraft {
  return {
    mode: "source",
    customValue: toDecisionCustomValue(params.fallbackValue),
  };
}

function createVariableCopyLinkRowDraft(
  row: VariableLinkMappingRow,
  destinationInputs: readonly ReferenceCatalogInput[],
): VariableCopyLinkRowDraft {
  const sourcePath = row.sourcePath ?? "";
  const autoMatchedInput = row.destinationInputId?.trim().length
    ? null
    : resolveUniqueCatalogInputByPathQuery(destinationInputs, sourcePath);
  return {
    apply: true,
    destinationInputId: row.destinationInputId ?? autoMatchedInput?.id ?? "",
    searchQuery: "",
    scale: createVariableCopyNumericDecisionDraft({
      fallbackValue: row.sourceScale,
    }),
    offset: createVariableCopyNumericDecisionDraft({
      fallbackValue: row.sourceOffset,
    }),
  };
}

function createPoseCopyTargetRowDraft(
  row: PoseTargetMappingRow,
  destinationInputs: readonly ReferenceCatalogInput[],
): PoseCopyTargetRowDraft {
  const sourcePath = row.sourcePath ?? "";
  const autoMatchedInput = row.destinationInputId?.trim().length
    ? null
    : resolveUniqueCatalogInputByPathQuery(destinationInputs, sourcePath);
  return {
    destinationInputId: row.destinationInputId ?? autoMatchedInput?.id ?? "",
    searchQuery: "",
    value: createVariableCopyNumericDecisionDraft({
      fallbackValue: row.valueMerge.value ?? row.sourceValue,
    }),
  };
}

function isPrimaryVariableDestinationInput(
  input: Pick<ReferenceCatalogInput, "path">,
): boolean {
  return (
    !isPropsRigStandardInputPath(input.path) &&
    !isPoseControlInputPath(input.path)
  );
}

function isUnresolvedMappingStatus(
  status: VariableCopyProposal["destinationRow"]["status"],
): boolean {
  return status === "ambiguous" || status === "unmapped";
}

function resolveVariableCopySourceCatalogInputId(params: {
  sourceCatalog: ReferenceCatalog;
  sourceReferenceEntry: RigNodeData;
}): string | null {
  if (
    params.sourceCatalog.inputsById.has(params.sourceReferenceEntry.input.id)
  ) {
    return params.sourceReferenceEntry.input.id;
  }
  const byPathCandidates = [
    ...(params.sourceCatalog.inputsByPath.get(
      normalizeCatalogPath(params.sourceReferenceEntry.input.path),
    ) ?? []),
  ];
  if (byPathCandidates.length === 0) {
    return null;
  }
  if (byPathCandidates.length === 1) {
    return byPathCandidates[0]?.id ?? null;
  }

  const sourceNormalizedLabel = normalizeLookupLabel(
    params.sourceReferenceEntry.input.label,
  );
  const sourceInputId = params.sourceReferenceEntry.input.id;
  const sourceSourceId = params.sourceReferenceEntry.input.sourceId ?? null;

  const ranked = byPathCandidates.sort((left, right) => {
    const leftRelationshipCount = left.parents.length + left.children.length;
    const rightRelationshipCount = right.parents.length + right.children.length;
    const leftSourceIdMatch =
      left.id === sourceInputId || left.id === sourceSourceId;
    const rightSourceIdMatch =
      right.id === sourceInputId || right.id === sourceSourceId;
    if (leftSourceIdMatch !== rightSourceIdMatch) {
      return leftSourceIdMatch ? -1 : 1;
    }

    const leftLabelMatch =
      sourceNormalizedLabel.length > 0 &&
      normalizeLookupLabel(left.label) === sourceNormalizedLabel;
    const rightLabelMatch =
      sourceNormalizedLabel.length > 0 &&
      normalizeLookupLabel(right.label) === sourceNormalizedLabel;
    if (leftLabelMatch !== rightLabelMatch) {
      return leftLabelMatch ? -1 : 1;
    }

    if (leftRelationshipCount !== rightRelationshipCount) {
      return rightRelationshipCount - leftRelationshipCount;
    }

    return left.id.localeCompare(right.id);
  });
  return ranked[0]?.id ?? null;
}

function createVariableCopyModalState(params: {
  sourceReferenceEntry: RigNodeData;
  proposal: VariableCopyProposal;
  destinationCatalog: ReferenceCatalog;
  launchSource: "row-action" | "toolbar";
}): VariableCopyModalState {
  const parentRowDrafts: Record<string, VariableCopyLinkRowDraft> = {};
  const destinationInputs = [...params.destinationCatalog.inputs];
  params.proposal.parentRows.forEach((row) => {
    parentRowDrafts[row.rowId] = createVariableCopyLinkRowDraft(
      row,
      destinationInputs,
    );
  });
  const childRowDrafts: Record<string, VariableCopyLinkRowDraft> = {};
  params.proposal.childRows.forEach((row) => {
    childRowDrafts[row.rowId] = createVariableCopyLinkRowDraft(
      row,
      destinationInputs,
    );
  });
  const proposedDestinationInput =
    params.proposal.destinationRow.destinationInputId === null
      ? null
      : (params.destinationCatalog.inputsById.get(
          params.proposal.destinationRow.destinationInputId,
        ) ?? null);
  const primaryDestinationOptions = destinationInputs.filter(
    isPrimaryVariableDestinationInput,
  );
  const autoMatchedPrimaryDestination =
    proposedDestinationInput &&
    isPrimaryVariableDestinationInput(proposedDestinationInput)
      ? proposedDestinationInput
      : resolveUniqueCatalogInputByPathQuery(
          primaryDestinationOptions,
          params.proposal.sourceInputPath,
        );
  const hasPrimaryDestinationProposal = autoMatchedPrimaryDestination !== null;
  return {
    sourceReferenceEntry: params.sourceReferenceEntry,
    proposal: params.proposal,
    destinationCatalog: params.destinationCatalog,
    launchSource: params.launchSource,
    destinationMode: hasPrimaryDestinationProposal ? "existing" : "new",
    destinationInputId: hasPrimaryDestinationProposal
      ? autoMatchedPrimaryDestination.id
      : "",
    newDestinationPath: params.proposal.sourceInputPath,
    newDestinationLabel: params.proposal.sourceInputLabel,
    valueMerge: {
      min: createVariableCopyNumericDecisionDraft({
        fallbackValue: params.sourceReferenceEntry.input.range.min,
      }),
      max: createVariableCopyNumericDecisionDraft({
        fallbackValue: params.sourceReferenceEntry.input.range.max,
      }),
      defaultValue: createVariableCopyNumericDecisionDraft({
        fallbackValue: params.sourceReferenceEntry.input.defaultValue,
      }),
    },
    parentRowDrafts,
    childRowDrafts,
  };
}

function createPoseCopyModalState(params: {
  sourcePose: ReferencePoseDefinition;
  proposal: PoseCopyProposal;
  destinationCatalog: ReferenceCatalog;
  launchSource: PoseCopyModalState["launchSource"];
}): PoseCopyModalState {
  const targetRowDrafts: Record<string, PoseCopyTargetRowDraft> = {};
  const destinationInputs = [...params.destinationCatalog.inputs];
  params.proposal.targetRows.forEach((row) => {
    targetRowDrafts[row.rowId] = createPoseCopyTargetRowDraft(
      row,
      destinationInputs,
    );
  });
  return {
    sourcePose: params.sourcePose,
    proposal: params.proposal,
    destinationCatalog: params.destinationCatalog,
    launchSource: params.launchSource,
    destinationPoseName:
      params.proposal.destinationPoseName || params.sourcePose.name,
    targetRowDrafts,
  };
}

function resolveVariableCopyDecisionValue(params: {
  decision: VariableCopyNumericDecisionDraft;
  sourceValue: number;
  destinationValue: number | null;
  fieldLabel: string;
  errors: string[];
}): number {
  if (params.decision.mode === "source") {
    return params.sourceValue;
  }
  if (params.decision.mode === "destination") {
    return isFiniteNumber(params.destinationValue)
      ? params.destinationValue
      : params.sourceValue;
  }
  const parsed = Number(params.decision.customValue.trim());
  if (!Number.isFinite(parsed)) {
    params.errors.push(`Invalid custom value for ${params.fieldLabel}.`);
    return params.sourceValue;
  }
  return parsed;
}

function resolveReferenceCatalogInputForTarget(params: {
  targetInputId: string;
  referenceCatalog: ReferenceCatalog;
}): ReferenceCatalogInput | null {
  const byId = params.referenceCatalog.inputsById.get(params.targetInputId);
  if (byId) {
    return byId;
  }
  const strippedTargetInputId = stripReferenceInputTokenPrefix(
    params.targetInputId,
  );
  if (strippedTargetInputId) {
    const strippedById = params.referenceCatalog.inputsById.get(
      strippedTargetInputId,
    );
    if (strippedById) {
      return strippedById;
    }
  }
  const normalizedTargetPath = normalizeCatalogPath(params.targetInputId);
  if (normalizedTargetPath) {
    const byPath =
      params.referenceCatalog.inputsByPath.get(normalizedTargetPath);
    if (byPath && byPath.length > 0) {
      return byPath[0] ?? null;
    }
  }
  if (strippedTargetInputId) {
    const normalizedStrippedPath = normalizeCatalogPath(strippedTargetInputId);
    if (normalizedStrippedPath) {
      const strippedByPath = params.referenceCatalog.inputsByPath.get(
        normalizedStrippedPath,
      );
      if (strippedByPath && strippedByPath.length > 0) {
        return strippedByPath[0] ?? null;
      }
    }
  }
  return null;
}

function addRuntimeInputLookupToken(
  map: Map<string, StandardRigInput[]>,
  token: string,
  input: StandardRigInput,
) {
  if (!token) {
    return;
  }
  const existing = map.get(token) ?? [];
  if (existing.some((candidate) => candidate.id === input.id)) {
    return;
  }
  map.set(token, [...existing, input]);
}

function buildReferenceRuntimeLookupTokenMap(
  runtimeInputs: readonly StandardRigInput[],
): Map<string, StandardRigInput[]> {
  const map = new Map<string, StandardRigInput[]>();
  runtimeInputs.forEach((input) => {
    const normalizedPath = normalizeStandardRigInputPath(input.path);
    const normalizedPathWithoutLeading = normalizedPath.startsWith("/")
      ? normalizedPath.slice(1)
      : normalizedPath;
    const canonicalPathToken = normalizedPathWithoutLeading.replace(/\//g, "_");
    const idToken = normalizeLookupLabel(input.id);
    const pathToken = normalizeLookupLabel(normalizedPathWithoutLeading);
    const tokens = new Set<string>([
      idToken,
      normalizeLookupLabel(input.path),
      normalizeLookupLabel(normalizedPath),
      pathToken,
      normalizeLookupLabel(canonicalPathToken),
      normalizeLookupLabel(`input_${input.id}`),
      normalizeLookupLabel(`input_${canonicalPathToken}`),
      normalizeLookupLabel(`input_${normalizedPathWithoutLeading}`),
    ]);
    tokens.forEach((token) => {
      addRuntimeInputLookupToken(map, token, input);
    });
  });
  return map;
}

function resolveUniqueRuntimeInputByLookupToken(params: {
  value: string;
  runtimeInputsByLookupToken: ReadonlyMap<string, StandardRigInput[]>;
}): StandardRigInput | null {
  const token = normalizeLookupLabel(params.value);
  if (!token) {
    return null;
  }
  const candidates = params.runtimeInputsByLookupToken.get(token) ?? [];
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }
  return null;
}

function resolveReferenceRuntimeInputForCatalogTarget(params: {
  targetInputId: string;
  referenceCatalog: ReferenceCatalog;
  runtimeInputsById: ReadonlyMap<string, StandardRigInput>;
  runtimeInputsByPath: ReadonlyMap<string, StandardRigInput[]>;
  runtimeInputsByLookupToken: ReadonlyMap<string, StandardRigInput[]>;
}): StandardRigInput | null {
  const strippedTargetInputId = stripReferenceInputTokenPrefix(
    params.targetInputId,
  );
  const directMatch = params.runtimeInputsById.get(params.targetInputId);
  if (directMatch) {
    return directMatch;
  }
  if (strippedTargetInputId) {
    const strippedDirectMatch = params.runtimeInputsById.get(
      strippedTargetInputId,
    );
    if (strippedDirectMatch) {
      return strippedDirectMatch;
    }
  }
  const directPathCandidates =
    params.runtimeInputsByPath.get(
      normalizeStandardRigInputPath(params.targetInputId),
    ) ?? [];
  if (directPathCandidates.length > 0) {
    return directPathCandidates[0] ?? null;
  }
  if (strippedTargetInputId) {
    const strippedPathCandidates =
      params.runtimeInputsByPath.get(
        normalizeStandardRigInputPath(strippedTargetInputId),
      ) ?? [];
    if (strippedPathCandidates.length > 0) {
      return strippedPathCandidates[0] ?? null;
    }
  }
  const directTokenMatch = resolveUniqueRuntimeInputByLookupToken({
    value: params.targetInputId,
    runtimeInputsByLookupToken: params.runtimeInputsByLookupToken,
  });
  if (directTokenMatch) {
    return directTokenMatch;
  }
  if (strippedTargetInputId) {
    const strippedTokenMatch = resolveUniqueRuntimeInputByLookupToken({
      value: strippedTargetInputId,
      runtimeInputsByLookupToken: params.runtimeInputsByLookupToken,
    });
    if (strippedTokenMatch) {
      return strippedTokenMatch;
    }
  }
  const catalogInput = resolveReferenceCatalogInputForTarget({
    targetInputId: params.targetInputId,
    referenceCatalog: params.referenceCatalog,
  });
  if (!catalogInput) {
    return null;
  }
  const candidates =
    params.runtimeInputsByPath.get(
      normalizeStandardRigInputPath(catalogInput.path),
    ) ?? [];
  if (candidates.length === 1) {
    return candidates[0] ?? null;
  }
  if (candidates.length > 1) {
    const normalizedCatalogLabel = normalizeLookupLabel(catalogInput.label);
    const byLabel = candidates.find(
      (candidate) =>
        normalizeLookupLabel(candidate.label) === normalizedCatalogLabel,
    );
    if (byLabel) {
      return byLabel;
    }
  }
  const byCatalogIdToken = resolveUniqueRuntimeInputByLookupToken({
    value: catalogInput.id,
    runtimeInputsByLookupToken: params.runtimeInputsByLookupToken,
  });
  if (byCatalogIdToken) {
    return byCatalogIdToken;
  }
  const byCatalogPathToken = resolveUniqueRuntimeInputByLookupToken({
    value: catalogInput.path,
    runtimeInputsByLookupToken: params.runtimeInputsByLookupToken,
  });
  if (byCatalogPathToken) {
    return byCatalogPathToken;
  }
  if (candidates.length === 0) {
    return null;
  }
  return candidates[0] ?? null;
}

function upsertBindingPipelineLinkMetadata(
  binding: AnimatableBinding,
  params: {
    parentInputId: string;
    childInputId: string;
    scale: number;
    offset: number;
  },
): AnimatableBinding {
  const linkId = buildRigPipelineV1LinkId(
    params.parentInputId,
    params.childInputId,
  );
  const metadata = asRecord(binding.metadata) ?? {};
  const vizij = asRecord(metadata.vizij) ?? {};
  const pipeline = asRecord(vizij.pipelineV1) ?? {};
  const links = asRecord(pipeline.links) ?? {};
  const existingLink = asRecord(links[linkId]) ?? {};
  const directInput = asRecord(pipeline.directInput) ?? {};
  const override = asRecord(pipeline.override) ?? {};
  const clamp = asRecord(pipeline.clamp) ?? {};
  const migration = asRecord(pipeline.migration) ?? {};
  const nextLink = {
    ...existingLink,
    linkId,
    parentInputId: params.parentInputId,
    childInputId: params.childInputId,
    scale: params.scale,
    offset: params.offset,
    enabled: true,
  };
  return {
    ...binding,
    metadata: {
      ...metadata,
      vizij: {
        ...vizij,
        pipelineV1: {
          ...pipeline,
          directInput: {
            ...directInput,
            enabled: true,
          },
          override: {
            ...override,
            enabled: false,
          },
          clamp: {
            ...clamp,
            enabled: true,
          },
          migration: {
            ...migration,
            status: "migrated",
            source:
              typeof migration.source === "string" &&
              migration.source.trim().length > 0
                ? migration.source
                : "reference-variable-copy",
          },
          links: {
            ...links,
            [linkId]: nextLink,
          },
        },
      },
    },
  };
}

function applyVariableCopyLinkPlansToInputBindings(params: {
  bindings: InputBindingMap;
  linkPlans: readonly VariableCopyCommitLinkPlan[];
  standardInputsById: ReadonlyMap<string, StandardRigInput>;
}): InputBindingMap {
  let changed = false;
  let nextBindings = params.bindings;

  params.linkPlans.forEach((plan) => {
    const parentInput = params.standardInputsById.get(plan.parentInputId);
    const childInput = params.standardInputsById.get(plan.childInputId);
    if (!parentInput || !childInput) {
      return;
    }

    const target = bindingTargetFromInput(childInput);
    const existingBinding = nextBindings[plan.childInputId];
    const baseBinding = ensureBindingStructure(
      existingBinding ?? createDefaultParentBinding(target),
      target,
    );
    const expressionBefore = (baseBinding.expression ?? "").trim();
    const canonicalExpressionBefore =
      buildCanonicalBindingExpression(baseBinding).trim();
    const expressionWasAuto =
      expressionBefore.length === 0 ||
      expressionBefore === canonicalExpressionBefore;
    let linkedBinding = baseBinding;

    let targetSlotId =
      linkedBinding.slots.find((slot) => slot.inputId === parentInput.id)?.id ??
      null;
    if (!targetSlotId) {
      const reusableSlot = linkedBinding.slots.find(
        (slot, index) =>
          index > 0 && (slot.inputId === null || slot.inputId === undefined),
      );
      if (reusableSlot) {
        targetSlotId = reusableSlot.id;
      } else {
        linkedBinding = addBindingSlot(linkedBinding, target);
        targetSlotId =
          linkedBinding.slots[linkedBinding.slots.length - 1]?.id ?? null;
      }
    }

    linkedBinding = updateBindingWithInput(
      linkedBinding,
      target,
      parentInput,
      targetSlotId ?? undefined,
    );
    if (expressionWasAuto) {
      const canonicalExpressionAfter =
        buildCanonicalBindingExpression(linkedBinding).trim();
      if (
        canonicalExpressionAfter.length > 0 &&
        (linkedBinding.expression ?? "").trim() !== canonicalExpressionAfter
      ) {
        linkedBinding = {
          ...linkedBinding,
          expression: canonicalExpressionAfter,
        };
      }
    }
    const linkedWithMetadata = upsertBindingPipelineLinkMetadata(
      linkedBinding,
      {
        parentInputId: plan.parentInputId,
        childInputId: plan.childInputId,
        scale: plan.scale,
        offset: plan.offset,
      },
    );

    if (
      existingBinding &&
      JSON.stringify(bindingToDefinition(existingBinding)) ===
        JSON.stringify(bindingToDefinition(linkedWithMetadata))
    ) {
      return;
    }

    if (!changed) {
      changed = true;
      nextBindings = { ...nextBindings };
    }
    nextBindings[plan.childInputId] = linkedWithMetadata;
  });

  return changed ? nextBindings : params.bindings;
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
      const poseData = candidate.data as PoseNodeData | undefined;
      if (poseData?.source === "main" && poseData.pose.id) {
        ids.push(poseData.pose.id);
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

function areStringListsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}

function areStringSetsEqual(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
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
  selectedReferenceRigIds?: ReadonlySet<string>;
  selectedReferencePoseIds?: ReadonlySet<string>;
  onToggleReferenceRigSelection?: (inputId: string) => void;
  onToggleReferencePoseSelection?: (poseId: string) => void;
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
  selectedReferenceRigIds,
  selectedReferencePoseIds,
  onToggleReferenceRigSelection,
  onToggleReferencePoseSelection,
  searchQuery,
}: TreeRowWrapperProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.size > 0;
  const isPoseGroupFolder =
    node.type === "folder" &&
    (node.data as PoseGroupNodeData | undefined)?.kind === "pose-group";
  const poseNodeData =
    node.type === "pose" ? (node.data as PoseNodeData | undefined) : undefined;
  const rigNodeData =
    node.type === "rig" ? (node.data as RigNodeData | undefined) : undefined;
  const isReferencePoseNode = poseNodeData?.source === "reference";
  const isReferenceRigNode = rigNodeData?.source === "reference";
  const referencePoseId = isReferencePoseNode ? poseNodeData?.pose.id : null;
  const referenceRigInputId = isReferenceRigNode ? rigNodeData?.input.id : null;
  const isBulkSelected =
    (referencePoseId
      ? selectedReferencePoseIds?.has(referencePoseId)
      : false) ||
    (referenceRigInputId
      ? selectedReferenceRigIds?.has(referenceRigInputId)
      : false);

  // Check selection
  const isSelected =
    selection &&
    ((node.type === "pose" &&
      selection.type === "pose" &&
      poseNodeData?.source === "main" &&
      poseNodeData.pose.id === selection.id) ||
      (node.type === "rig" &&
        selection.type === "rig" &&
        (node.data as RigNodeData)?.input?.id === selection.id) ||
      (node.type === "input" &&
        selection.type === "input" &&
        (node.data as InputListRow)?.inputId === selection.id) ||
      (isPoseGroupFolder &&
        selection.type === "pose-group" &&
        node.id === selection.id));
  const rowIsSelected = Boolean(isSelected || isBulkSelected);
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
  if (node.type === "pose")
    iconClass = isReferencePoseNode ? "text-cyan-300" : "text-purple-400";
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
        isSelected={rowIsSelected}
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
      isSelected={rowIsSelected}
      onToggle={() => onToggle(node.id)}
      onSelect={
        !hasChildren || isPoseGroupFolder ? () => onSelect?.(node) : undefined
      }
      highlightQuery={searchQuery}
      icon={<Icon size={12} strokeWidth={2} className={iconClass} />}
      actions={
        <>
          {node.type === "pose" && !isReferencePoseNode && (
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
          {node.type === "pose" && isReferencePoseNode && (
            <>
              <label
                className="flex items-center gap-1 text-[9px] text-cyan-200"
                onClick={(event) => event.stopPropagation()}
                title="Select pose for bulk copy"
              >
                <input
                  type="checkbox"
                  checked={referencePoseId ? isBulkSelected : false}
                  onChange={() => {
                    if (!referencePoseId) {
                      return;
                    }
                    onToggleReferencePoseSelection?.(referencePoseId);
                  }}
                />
                Bulk
              </label>
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
                title="Reset pose targets to defaults"
              >
                <RotateCcw size={10} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 hover:text-accent text-cyan-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onAction?.(node, "copy-pose-to-main");
                }}
                title="Copy pose to main face"
              >
                <Copy size={10} />
              </Button>
              <span className="text-[9px] font-mono px-1 rounded bg-cyan-900/40 text-cyan-200">
                reference
              </span>
            </>
          )}

          {node.type === "rig" &&
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
              <>
                <label
                  className="flex items-center gap-1 text-[9px] text-cyan-200"
                  onClick={(event) => event.stopPropagation()}
                  title="Select driver for bulk copy"
                >
                  <input
                    type="checkbox"
                    checked={referenceRigInputId ? isBulkSelected : false}
                    onChange={() => {
                      if (!referenceRigInputId) {
                        return;
                      }
                      onToggleReferenceRigSelection?.(referenceRigInputId);
                    }}
                  />
                  Bulk
                </label>
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
              </>
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
                selectedReferenceRigIds={selectedReferenceRigIds}
                selectedReferencePoseIds={selectedReferencePoseIds}
                onToggleReferenceRigSelection={onToggleReferenceRigSelection}
                onToggleReferencePoseSelection={onToggleReferencePoseSelection}
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
  selectedBlendStage?: BlendStageInspectorSelection | null;
  onSelectBlendStage?: (selection: BlendStageInspectorSelection | null) => void;
  activeSurfaceOverride?: SurfaceTab;
  availableSurfaces?: SurfaceTab[];
  panelTitle?: string;
  panelDescription?: string;
  onClosePanel?: () => void;
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
  selectedBlendStage,
  onSelectBlendStage,
  activeSurfaceOverride,
  availableSurfaces,
  panelTitle = "Control Elements",
  panelDescription = "Author and organize drivers, poses, pose groups, and inputs.",
  onClosePanel,
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
    updatePoseGroup,
    updatePoseValue,
    crossGroupBlendMode,
    blendMode,
    blendStages,
    setCrossGroupBlendMode,
    createBlendStage,
    renameBlendStage,
    deleteBlendStage,
    reorderBlendStage,
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
  const pipelineConfigByInputId = useBindingAuthoring(
    (state) => state.pipelineConfigByInputId,
  );
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const inputBindings = useBindingAuthoring((state) => state.inputBindings);
  const inputValues = useBindingAuthoring((state) => state.inputValues);
  const handleInputValueChange = useBindingAuthoring(
    (state) => state.handleInputValueChange,
  );
  const applyInputBindingPatch = useBindingAuthoring(
    (state) => state.applyInputBindingPatch,
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
  const [variableCopyModal, setVariableCopyModal] =
    useState<VariableCopyModalState | null>(null);
  const [variableCopyBlockingMessages, setVariableCopyBlockingMessages] =
    useState<string[]>([]);
  const [selectedReferenceRigIds, setSelectedReferenceRigIds] = useState<
    Set<string>
  >(new Set());
  const [pendingVariableCopyQueueIds, setPendingVariableCopyQueueIds] =
    useState<string[]>([]);
  const [poseCopyModal, setPoseCopyModal] = useState<PoseCopyModalState | null>(
    null,
  );
  const [poseCopyBlockingMessages, setPoseCopyBlockingMessages] = useState<
    string[]
  >([]);
  const [selectedReferencePoseIds, setSelectedReferencePoseIds] = useState<
    Set<string>
  >(new Set());
  const [pendingPoseCopyQueueIds, setPendingPoseCopyQueueIds] = useState<
    string[]
  >([]);

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

  const mainFaceCopyTargetReferenceCatalog = useMemo(
    () =>
      buildMainFaceReferenceCatalog({
        mainInputs: managedStandardInputs
          .filter((entry) => Boolean(entry.input.path?.trim()))
          .filter((entry) => !isPoseControlInputPath(entry.input.path))
          .filter((entry) => !isPoseOutputInputPath(entry.input.path))
          .map((entry) => entry.input),
        inputBindings: inputBindings as Record<
          string,
          BindingInputLike | undefined
        >,
        pipelineConfigByInputId: pipelineConfigByInputId as Record<
          string,
          Record<string, unknown>
        >,
      }),
    [inputBindings, managedStandardInputs, pipelineConfigByInputId],
  );

  const referenceFaceRuntimeCatalog = useMemo(
    () =>
      buildMainFaceReferenceCatalog({
        mainInputs: referenceFace.standardInputs
          .filter((entry) => Boolean(entry.path?.trim()))
          .filter((entry) => !isPoseControlInputPath(entry.path))
          .filter((entry) => !isPoseOutputInputPath(entry.path)),
        inputBindings: Object.fromEntries(
          referenceFace.standardInputs.map((input) => [
            input.id,
            (input.parentBinding ?? undefined) as BindingInputLike | undefined,
          ]),
        ) as Record<string, BindingInputLike | undefined>,
      }),
    [referenceFace.standardInputs],
  );

  const referenceRigEntries = useMemo(() => {
    const mainByPath = new Map<string, StandardRigInput>();
    mainFaceRigEntries.forEach((entry) => {
      const normalized = normalizeStandardRigInputPath(entry.input.path);
      mainByPath.set(normalized, entry.input);
    });
    return referenceFace.standardInputs
      .filter((entry) => Boolean(entry.path?.trim()))
      .filter((entry) => !isPoseControlInputPath(entry.path))
      .filter((entry) => !isPoseOutputInputPath(entry.path))
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
  const referencePoseEntries = useMemo(
    () =>
      [...referenceFace.referenceCatalog.poses].sort((left, right) => {
        const byName = left.name.localeCompare(right.name);
        if (byName !== 0) {
          return byName;
        }
        return left.id.localeCompare(right.id);
      }),
    [referenceFace.referenceCatalog.poses],
  );
  const referenceRigEntryByInputId = useMemo(
    () => new Map(referenceRigEntries.map((entry) => [entry.input.id, entry])),
    [referenceRigEntries],
  );
  const referencePoseById = useMemo(
    () => new Map(referencePoseEntries.map((pose) => [pose.id, pose])),
    [referencePoseEntries],
  );
  const referenceRuntimeInputsByPath = useMemo(() => {
    const map = new Map<string, StandardRigInput[]>();
    referenceFace.standardInputs.forEach((input) => {
      const key = normalizeStandardRigInputPath(input.path);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, input]);
    });
    return map;
  }, [referenceFace.standardInputs]);
  const referenceRuntimeInputsByLookupToken = useMemo(
    () => buildReferenceRuntimeLookupTokenMap(referenceFace.standardInputs),
    [referenceFace.standardInputs],
  );
  const referenceRuntimeInputPathSet = useMemo(
    () =>
      new Set(
        referenceFace.standardInputs
          .map((input) => normalizeStandardRigInputPath(input.path))
          .filter((path) => path !== "/custom/input"),
      ),
    [referenceFace.standardInputs],
  );
  const canStageReferencePath = useCallback(
    (path: string) => {
      const normalizedPath = normalizeStandardRigInputPath(path);
      if (!normalizedPath || normalizedPath === "/custom/input") {
        return false;
      }
      if (referenceRuntimeInputPathSet.has(normalizedPath)) {
        return true;
      }
      return referenceFace.referenceCatalog.inputsByPath.has(
        normalizeCatalogPath(normalizedPath),
      );
    },
    [referenceFace.referenceCatalog.inputsByPath, referenceRuntimeInputPathSet],
  );
  const stageReferencePathValue = useCallback(
    (path: string, value: number) => {
      const normalizedPath = normalizeStandardRigInputPath(path);
      if (!normalizedPath || normalizedPath === "/custom/input") {
        return false;
      }
      if (!canStageReferencePath(normalizedPath)) {
        return false;
      }
      referenceFace.handleInputPathValueChange(normalizedPath, value);
      return true;
    },
    [canStageReferencePath, referenceFace],
  );
  const applyReferenceRigValue = useCallback(
    (rigData: RigNodeData, nextValue: number, action: string) => {
      if (stageReferencePathValue(rigData.input.path, nextValue)) {
        return;
      }
      const runtimeInput = resolveReferenceRuntimeInputForCatalogTarget({
        targetInputId: rigData.input.id,
        referenceCatalog: referenceFace.referenceCatalog,
        runtimeInputsById: referenceFace.standardInputsById,
        runtimeInputsByPath: referenceRuntimeInputsByPath,
        runtimeInputsByLookupToken: referenceRuntimeInputsByLookupToken,
      });
      if (runtimeInput) {
        referenceFace.handleInputValueChange(runtimeInput.id, nextValue);
        return;
      }
      console.warn(
        `[VariablesPanel] Unable to resolve reference input "${rigData.input.id}" for driver action "${action}".`,
      );
    },
    [
      referenceFace,
      referenceRuntimeInputsByLookupToken,
      referenceRuntimeInputsByPath,
    ],
  );
  const applyRigValueBySource = useCallback(
    (rigData: RigNodeData, nextValue: number, action: string) => {
      if (rigData.source === "reference") {
        applyReferenceRigValue(rigData, nextValue, action);
        return;
      }
      if (rigData.source === "shared") {
        activeInputValueChange(rigData.input.id, nextValue);
        if (stageReferencePathValue(rigData.input.path, nextValue)) {
          return;
        }
        const linkedReferenceInputId = rigData.linkedReferenceInputId?.trim();
        if (
          linkedReferenceInputId &&
          referenceFace.standardInputsById.has(linkedReferenceInputId)
        ) {
          referenceFace.handleInputValueChange(
            linkedReferenceInputId,
            nextValue,
          );
          return;
        }
        const normalizedSharedPath = normalizeStandardRigInputPath(
          rigData.input.path,
        );
        const pathMatches =
          referenceRuntimeInputsByPath.get(normalizedSharedPath) ?? [];
        if (pathMatches.length === 1) {
          referenceFace.handleInputValueChange(pathMatches[0]!.id, nextValue);
          return;
        }
        if (normalizedSharedPath && normalizedSharedPath !== "/custom/input") {
          referenceFace.handleInputPathValueChange(
            normalizedSharedPath,
            nextValue,
          );
          return;
        }
        console.warn(
          `[VariablesPanel] Unable to resolve shared reference target for "${rigData.input.id}" during driver action "${action}".`,
        );
        return;
      }
      activeInputValueChange(rigData.input.id, nextValue);
    },
    [
      activeInputValueChange,
      applyReferenceRigValue,
      referenceFace,
      referenceRuntimeInputsByPath,
      stageReferencePathValue,
    ],
  );
  const setReferencePoseWeightSolo = useCallback(
    (poseId: string) => {
      if (!referencePoseEntries.some((pose) => pose.id === poseId)) {
        return false;
      }
      referencePoseEntries.forEach((pose) => {
        referenceFace.handleInputPathValueChange(
          buildPoseWeightRelativePath(pose.id),
          pose.id === poseId ? 1 : 0,
        );
      });
      return true;
    },
    [referenceFace, referencePoseEntries],
  );
  const toggleReferenceRigSelection = useCallback((inputId: string) => {
    setSelectedReferenceRigIds((current) => {
      const next = new Set(current);
      if (next.has(inputId)) {
        next.delete(inputId);
      } else {
        next.add(inputId);
      }
      return next;
    });
  }, []);
  const toggleReferencePoseSelection = useCallback((poseId: string) => {
    setSelectedReferencePoseIds((current) => {
      const next = new Set(current);
      if (next.has(poseId)) {
        next.delete(poseId);
      } else {
        next.add(poseId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (referenceFace.file) {
      return;
    }
    setSelectedReferenceRigIds((current) =>
      current.size > 0 ? new Set() : current,
    );
    setSelectedReferencePoseIds((current) =>
      current.size > 0 ? new Set() : current,
    );
    setPendingVariableCopyQueueIds((current) =>
      current.length > 0 ? [] : current,
    );
    setPendingPoseCopyQueueIds((current) =>
      current.length > 0 ? [] : current,
    );
    setVariableCopyModal((current) => (current ? null : current));
    setPoseCopyModal((current) => (current ? null : current));
  }, [referenceFace.file]);

  useEffect(() => {
    const validInputIds = new Set(
      referenceRigEntries.map((entry) => entry.input.id),
    );
    setSelectedReferenceRigIds((current) => {
      const next = new Set(
        Array.from(current).filter((inputId) => validInputIds.has(inputId)),
      );
      return areStringSetsEqual(current, next) ? current : next;
    });
    setPendingVariableCopyQueueIds((current) => {
      const filtered = current.filter((inputId) => validInputIds.has(inputId));
      return filtered.length === current.length ? current : filtered;
    });
  }, [referenceRigEntries]);

  useEffect(() => {
    const validPoseIds = new Set(referencePoseEntries.map((pose) => pose.id));
    setSelectedReferencePoseIds((current) => {
      const next = new Set(
        Array.from(current).filter((poseId) => validPoseIds.has(poseId)),
      );
      return areStringSetsEqual(current, next) ? current : next;
    });
    setPendingPoseCopyQueueIds((current) => {
      const filtered = current.filter((poseId) => validPoseIds.has(poseId));
      return filtered.length === current.length ? current : filtered;
    });
  }, [referencePoseEntries]);

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
        .filter((entry) => !isPoseOutputInputPath(entry.input.path))
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

  const prepareVariableCopyModalState = useCallback(
    (
      referenceEntry: RigNodeData,
      launchSource: VariableCopyModalState["launchSource"],
    ): VariableCopyModalState | null => {
      if (referenceEntry.source !== "reference") {
        return null;
      }
      const tryBuildProposal = (
        sourceCatalog: ReferenceCatalog,
      ): VariableCopyProposal | null => {
        const sourceCatalogInputId = resolveVariableCopySourceCatalogInputId({
          sourceCatalog,
          sourceReferenceEntry: referenceEntry,
        });
        if (!sourceCatalogInputId) {
          return null;
        }
        try {
          return buildVariableCopyProposal({
            sourceCatalog,
            destinationCatalog: mainFaceCopyTargetReferenceCatalog,
            sourceInputId: sourceCatalogInputId,
          });
        } catch {
          return null;
        }
      };

      const primarySourceCatalog = referenceFace.referenceCatalog;
      let proposal = tryBuildProposal(primarySourceCatalog);
      if (!proposal) {
        proposal = tryBuildProposal(referenceFaceRuntimeCatalog);
      } else if (
        proposal.parentRows.length === 0 &&
        proposal.childRows.length === 0
      ) {
        const runtimeProposal = tryBuildProposal(referenceFaceRuntimeCatalog);
        if (
          runtimeProposal &&
          (runtimeProposal.parentRows.length > 0 ||
            runtimeProposal.childRows.length > 0)
        ) {
          proposal = runtimeProposal;
        }
      }
      if (!proposal) {
        return null;
      }
      return createVariableCopyModalState({
        sourceReferenceEntry: referenceEntry,
        proposal,
        destinationCatalog: mainFaceCopyTargetReferenceCatalog,
        launchSource,
      });
    },
    [
      mainFaceCopyTargetReferenceCatalog,
      referenceFace.referenceCatalog,
      referenceFaceRuntimeCatalog,
    ],
  );

  const openVariableCopyModalForEntry = useCallback(
    (
      referenceEntry: RigNodeData,
      launchSource: VariableCopyModalState["launchSource"],
    ) => {
      const modalState = prepareVariableCopyModalState(
        referenceEntry,
        launchSource,
      );
      if (!modalState) {
        return;
      }
      setPendingVariableCopyQueueIds([]);
      setVariableCopyBlockingMessages([]);
      setVariableCopyModal(modalState);
    },
    [prepareVariableCopyModalState],
  );

  const closeVariableCopyModal = useCallback(() => {
    setPendingVariableCopyQueueIds([]);
    setVariableCopyModal(null);
    setVariableCopyBlockingMessages([]);
  }, []);

  const commitVariableCopyModal = useCallback(
    (
      modalState: VariableCopyModalState,
      options?: { selectAfterCommit?: boolean },
    ):
      | { ok: true; destinationInputId: string }
      | { ok: false; blockingMessages: string[] } => {
      const sourceInput = modalState.sourceReferenceEntry.input;
      const blockingMessages: string[] = [];
      const destinationInputIdRaw = modalState.destinationInputId.trim();
      let existingDestinationInput: StandardRigInput | null = null;
      let normalizedNewDestinationPath: string | null = null;

      if (modalState.destinationMode === "existing") {
        if (!destinationInputIdRaw) {
          blockingMessages.push(
            "Destination unresolved: select an existing destination input or create a new one.",
          );
        } else {
          existingDestinationInput =
            standardInputsById.get(destinationInputIdRaw) ?? null;
          if (!existingDestinationInput) {
            blockingMessages.push(
              "Destination unresolved: selected destination input is unavailable.",
            );
          } else if (
            !isPrimaryVariableDestinationInput(existingDestinationInput)
          ) {
            blockingMessages.push(
              "Destination unresolved: selected destination cannot be used as the primary variable target.",
            );
          }
        }
      } else {
        const normalized = normalizeStandardRigInputPath(
          modalState.newDestinationPath,
        );
        if (!normalized) {
          blockingMessages.push(
            "Destination unresolved: provide a valid destination path for the new input.",
          );
        } else if (standardInputsByPath.has(normalized)) {
          blockingMessages.push(
            "Destination unresolved: destination path already exists. Pick Existing or change the new path.",
          );
        } else {
          normalizedNewDestinationPath = normalized;
        }
      }

      const mergedMin = resolveVariableCopyDecisionValue({
        decision: modalState.valueMerge.min,
        sourceValue: sourceInput.range.min,
        destinationValue: existingDestinationInput?.range.min ?? null,
        fieldLabel: "minimum",
        errors: blockingMessages,
      });
      const mergedMax = resolveVariableCopyDecisionValue({
        decision: modalState.valueMerge.max,
        sourceValue: sourceInput.range.max,
        destinationValue: existingDestinationInput?.range.max ?? null,
        fieldLabel: "maximum",
        errors: blockingMessages,
      });
      const mergedDefaultValue = resolveVariableCopyDecisionValue({
        decision: modalState.valueMerge.defaultValue,
        sourceValue: sourceInput.defaultValue,
        destinationValue: existingDestinationInput?.defaultValue ?? null,
        fieldLabel: "default",
        errors: blockingMessages,
      });
      if (mergedMin > mergedMax) {
        blockingMessages.push(
          "Invalid custom values: minimum cannot be greater than maximum.",
        );
      }

      const pendingAppliedRows: Array<{
        rowId: string;
        relationship: "parent" | "child";
        mappedInputId: string;
        scale: number;
        offset: number;
      }> = [];
      const collectAppliedRows = (
        rows: readonly VariableLinkMappingRow[],
        drafts: Record<string, VariableCopyLinkRowDraft>,
        relationship: "parent" | "child",
        relationshipLabel: string,
      ) => {
        rows.forEach((row) => {
          const draft = drafts[row.rowId];
          if (!draft?.apply) {
            return;
          }
          const mappedInputId = draft.destinationInputId.trim();
          if (
            !mappedInputId ||
            !modalState.destinationCatalog.inputsById.has(mappedInputId)
          ) {
            blockingMessages.push(
              `Applied row unresolved: ${relationshipLabel} "${row.sourceLabel}".`,
            );
            return;
          }
          const scale = resolveVariableCopyDecisionValue({
            decision: draft.scale,
            sourceValue: row.sourceScale,
            destinationValue: row.destinationScale,
            fieldLabel: `${relationshipLabel} scale`,
            errors: blockingMessages,
          });
          const offset = resolveVariableCopyDecisionValue({
            decision: draft.offset,
            sourceValue: row.sourceOffset,
            destinationValue: row.destinationOffset,
            fieldLabel: `${relationshipLabel} offset`,
            errors: blockingMessages,
          });
          pendingAppliedRows.push({
            rowId: row.rowId,
            relationship,
            mappedInputId,
            scale,
            offset,
          });
        });
      };

      collectAppliedRows(
        modalState.proposal.parentRows,
        modalState.parentRowDrafts,
        "parent",
        "parent mapping",
      );
      collectAppliedRows(
        modalState.proposal.childRows,
        modalState.childRowDrafts,
        "child",
        "child mapping",
      );

      if (blockingMessages.length > 0) {
        return {
          ok: false,
          blockingMessages,
        };
      }

      let destinationInputId = destinationInputIdRaw;
      let createdDestinationInput: StandardRigInput | null = null;
      if (modalState.destinationMode === "new") {
        const created = handleCreateCustomStandardInput(
          normalizedNewDestinationPath!,
        );
        if (!created) {
          return {
            ok: false,
            blockingMessages: [
              "Destination unresolved: failed to create destination input.",
            ],
          };
        }
        destinationInputId = created.id;
        createdDestinationInput = created;
      }

      try {
        handleUpdateStandardInput(destinationInputId, {
          ...(modalState.destinationMode === "new"
            ? {
                label:
                  modalState.newDestinationLabel.trim() || sourceInput.label,
                sourceId: sourceInput.sourceId ?? null,
              }
            : {}),
          defaultValue: mergedDefaultValue,
          range: {
            min: mergedMin,
            max: mergedMax,
          },
        });

        const linkPlans: VariableCopyCommitLinkPlan[] = pendingAppliedRows.map(
          (row) => ({
            rowId: row.rowId,
            relationship: row.relationship,
            parentInputId:
              row.relationship === "parent"
                ? row.mappedInputId
                : destinationInputId,
            childInputId:
              row.relationship === "parent"
                ? destinationInputId
                : row.mappedInputId,
            scale: row.scale,
            offset: row.offset,
          }),
        );

        linkPlans.forEach((plan) => {
          handleLinkChildInput(plan.parentInputId, plan.childInputId);
        });

        if (linkPlans.length > 0) {
          const linkPlanInputLookup = new Map<string, StandardRigInput>(
            standardInputsById,
          );
          if (createdDestinationInput) {
            linkPlanInputLookup.set(
              createdDestinationInput.id,
              createdDestinationInput,
            );
          }
          applyInputBindingPatch((bindings) => {
            return applyVariableCopyLinkPlansToInputBindings({
              bindings,
              linkPlans,
              standardInputsById: linkPlanInputLookup,
            });
          });
        }
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          blockingMessages: [`Variable copy failed. ${detail}`],
        };
      }

      if (options?.selectAfterCommit ?? true) {
        onSelectRig?.(destinationInputId);
        onSelectPoseGroup?.(null);
        onSelectBlendStage?.(null);
      }

      return {
        ok: true,
        destinationInputId,
      };
    },
    [
      applyInputBindingPatch,
      handleCreateCustomStandardInput,
      handleLinkChildInput,
      handleUpdateStandardInput,
      onSelectBlendStage,
      onSelectPoseGroup,
      onSelectRig,
      standardInputsById,
      standardInputsByPath,
    ],
  );

  const handleConfirmVariableCopyModal = useCallback(() => {
    if (!variableCopyModal) {
      return;
    }
    const hasQueuedEntries = pendingVariableCopyQueueIds.length > 0;
    const result = commitVariableCopyModal(variableCopyModal, {
      selectAfterCommit: !hasQueuedEntries,
    });
    if (!result.ok) {
      setVariableCopyBlockingMessages(result.blockingMessages);
      return;
    }
    setVariableCopyBlockingMessages([]);
    setVariableCopyModal(null);
    if (hasQueuedEntries) {
      return;
    }
  }, [commitVariableCopyModal, pendingVariableCopyQueueIds, variableCopyModal]);

  useEffect(() => {
    if (variableCopyModal || pendingVariableCopyQueueIds.length === 0) {
      return;
    }
    const [nextInputId, ...remainingQueue] = pendingVariableCopyQueueIds;
    if (!nextInputId) {
      setPendingVariableCopyQueueIds([]);
      return;
    }
    const entry = referenceRigEntryByInputId.get(nextInputId);
    if (!entry) {
      setPendingVariableCopyQueueIds(remainingQueue);
      return;
    }
    const modalState = prepareVariableCopyModalState(entry, "toolbar");
    if (!modalState) {
      setPendingVariableCopyQueueIds(remainingQueue);
      return;
    }
    const autoCommitResult = commitVariableCopyModal(modalState, {
      selectAfterCommit: false,
    });
    if (autoCommitResult.ok) {
      setPendingVariableCopyQueueIds(remainingQueue);
      return;
    }
    setVariableCopyBlockingMessages([]);
    setVariableCopyModal(modalState);
    setPendingVariableCopyQueueIds(remainingQueue);
  }, [
    commitVariableCopyModal,
    pendingVariableCopyQueueIds,
    prepareVariableCopyModalState,
    referenceRigEntryByInputId,
    variableCopyModal,
  ]);

  const preparePoseCopyModalState = useCallback(
    (
      sourcePose: ReferencePoseDefinition,
      launchSource: PoseCopyModalState["launchSource"],
    ): PoseCopyModalState | null => {
      let proposal: PoseCopyProposal;
      try {
        proposal = buildPoseCopyProposal({
          sourceCatalog: referenceFace.referenceCatalog,
          destinationCatalog: mainFaceCopyTargetReferenceCatalog,
          sourcePoseId: sourcePose.id,
          destinationPoseName: sourcePose.name,
        });
      } catch {
        return null;
      }
      return createPoseCopyModalState({
        sourcePose,
        proposal,
        destinationCatalog: mainFaceCopyTargetReferenceCatalog,
        launchSource,
      });
    },
    [mainFaceCopyTargetReferenceCatalog, referenceFace.referenceCatalog],
  );

  const openPoseCopyModalForPose = useCallback(
    (
      sourcePose: ReferencePoseDefinition,
      launchSource: PoseCopyModalState["launchSource"],
    ) => {
      const modalState = preparePoseCopyModalState(sourcePose, launchSource);
      if (!modalState) {
        return;
      }
      setPendingPoseCopyQueueIds([]);
      setPoseCopyBlockingMessages([]);
      setPoseCopyModal(modalState);
    },
    [preparePoseCopyModalState],
  );

  const closePoseCopyModal = useCallback(() => {
    setPendingPoseCopyQueueIds([]);
    setPoseCopyModal(null);
    setPoseCopyBlockingMessages([]);
  }, []);

  const commitPoseCopyModal = useCallback(
    (
      modalState: PoseCopyModalState,
      options?: { selectAfterCommit?: boolean },
    ):
      | { ok: true; createdPoseId: string }
      | { ok: false; blockingMessages: string[] } => {
      const blockingMessages: string[] = [];
      const destinationPoseName = modalState.destinationPoseName.trim();
      if (!destinationPoseName) {
        blockingMessages.push("Destination pose name is required.");
      }

      const targetRowsWithDrafts = modalState.proposal.targetRows.map((row) => {
        const draft =
          modalState.targetRowDrafts[row.rowId] ??
          createPoseCopyTargetRowDraft(
            row,
            modalState.destinationCatalog.inputs,
          );
        const destinationInputId = draft.destinationInputId.trim();
        const destinationInput = destinationInputId
          ? (modalState.destinationCatalog.inputsById.get(destinationInputId) ??
            null)
          : null;
        const nextStatus = destinationInput ? "resolved" : "unmapped";
        const nextRationale = destinationInput
          ? ["Resolved by modal destination remap"]
          : row.rationale.length > 0
            ? [...row.rationale]
            : ["No destination input selected"];

        const value = resolveVariableCopyDecisionValue({
          decision: draft.value,
          sourceValue: row.sourceValue,
          destinationValue: null,
          fieldLabel: `target "${row.sourcePath ?? row.sourceInputId}"`,
          errors: blockingMessages,
        });

        return {
          row: {
            ...row,
            destinationInputId: destinationInput?.id ?? null,
            destinationPath: destinationInput?.path ?? null,
            destinationLabel: destinationInput?.label ?? null,
            candidateDestinationInputIds: destinationInput
              ? [destinationInput.id]
              : row.candidateDestinationInputIds,
            status: nextStatus,
            confidence: destinationInput ? "high" : "none",
            rationale: nextRationale,
          } as PoseTargetMappingRow,
          value,
        };
      });

      const draftedProposal: PoseCopyProposal = {
        ...modalState.proposal,
        destinationPoseName,
        targetRows: targetRowsWithDrafts.map((entry) => entry.row),
        unresolvedRows: targetRowsWithDrafts
          .map((entry) => entry.row)
          .filter((row) => isUnresolvedMappingStatus(row.status)),
      };
      const preflight = validatePoseCopyProposalPreflight(draftedProposal);
      if (!preflight.ok) {
        const rowById = new Map(
          draftedProposal.targetRows.map((row) => [row.rowId, row]),
        );
        preflight.blockingErrors.forEach((error) => {
          const row = rowById.get(error.rowId);
          const rowLabel = row
            ? (row.sourcePath ?? row.sourceInputId)
            : error.rowId;
          blockingMessages.push(
            `Blocking unresolved mapping: ${rowLabel} (${error.status}).`,
          );
        });
      }

      if (blockingMessages.length > 0) {
        return {
          ok: false,
          blockingMessages,
        };
      }

      const previousSelectedPoseId = selectedPoseId;
      const createdPoseId = resolveDeterministicPoseId({
        existingIds: poses.map((pose) => pose.id),
        name: destinationPoseName,
        reservedIds: ["__pose_rig_neutral__"],
      });

      try {
        createPose(destinationPoseName);
        updatePoseGroup(createdPoseId, null);
        targetRowsWithDrafts.forEach((entry) => {
          if (!entry.row.destinationInputId) {
            return;
          }
          updatePoseValue(
            createdPoseId,
            entry.row.destinationInputId,
            entry.value,
          );
        });
      } catch (error) {
        let rollbackFailed = false;
        try {
          deletePose(createdPoseId);
        } catch {
          rollbackFailed = true;
        }
        if (previousSelectedPoseId) {
          if (onSelectPose) {
            onSelectPose(previousSelectedPoseId);
          } else {
            selectPose(previousSelectedPoseId);
          }
        } else if (onSelectPose) {
          onSelectPose("__pose_rig_neutral__");
        } else {
          selectPose("__pose_rig_neutral__");
        }
        const detail = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          blockingMessages: [
            rollbackFailed
              ? `Pose copy failed and rollback was incomplete. ${detail}`
              : `Pose copy failed. Changes were rolled back. ${detail}`,
          ],
        };
      }

      if (options?.selectAfterCommit ?? true) {
        onSelectRig?.(null);
        onSelectPoseGroup?.(null);
        onSelectBlendStage?.(null);
        if (onSelectPose) {
          onSelectPose(createdPoseId);
        } else {
          selectPose(createdPoseId);
        }
      }

      return {
        ok: true,
        createdPoseId,
      };
    },
    [
      createPose,
      deletePose,
      onSelectBlendStage,
      onSelectPose,
      onSelectPoseGroup,
      onSelectRig,
      poses,
      selectPose,
      selectedPoseId,
      updatePoseGroup,
      updatePoseValue,
    ],
  );

  const handleConfirmPoseCopyModal = useCallback(() => {
    if (!poseCopyModal) {
      return;
    }
    const hasQueuedEntries = pendingPoseCopyQueueIds.length > 0;
    const result = commitPoseCopyModal(poseCopyModal, {
      selectAfterCommit: !hasQueuedEntries,
    });
    if (!result.ok) {
      setPoseCopyBlockingMessages(result.blockingMessages);
      return;
    }
    setPoseCopyBlockingMessages([]);
    setPoseCopyModal(null);
    if (hasQueuedEntries) {
      return;
    }
  }, [commitPoseCopyModal, pendingPoseCopyQueueIds, poseCopyModal]);

  useEffect(() => {
    if (poseCopyModal || pendingPoseCopyQueueIds.length === 0) {
      return;
    }
    const [nextPoseId, ...remainingQueue] = pendingPoseCopyQueueIds;
    if (!nextPoseId) {
      setPendingPoseCopyQueueIds([]);
      return;
    }
    const sourcePose = referencePoseById.get(nextPoseId);
    if (!sourcePose) {
      setPendingPoseCopyQueueIds(remainingQueue);
      return;
    }
    const modalState = preparePoseCopyModalState(sourcePose, "toolbar");
    if (!modalState) {
      setPendingPoseCopyQueueIds(remainingQueue);
      return;
    }
    const autoCommitResult = commitPoseCopyModal(modalState, {
      selectAfterCommit: false,
    });
    if (autoCommitResult.ok) {
      setPendingPoseCopyQueueIds(remainingQueue);
      return;
    }
    setPoseCopyBlockingMessages([]);
    setPoseCopyModal(modalState);
    setPendingPoseCopyQueueIds(remainingQueue);
  }, [
    commitPoseCopyModal,
    pendingPoseCopyQueueIds,
    poseCopyModal,
    preparePoseCopyModalState,
    referencePoseById,
  ]);

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

    const shouldSurfaceReferencePoses =
      Boolean(referenceFace.file) &&
      referenceFace.isLoaded &&
      referencePoseEntries.length > 0;
    let targetRoot: TreeNode = root;

    if (shouldSurfaceReferencePoses) {
      const mainFaceRoot: TreeNode = {
        id: "main_pose_face",
        label: "Main Face",
        type: "folder",
        children: new Map(),
        showChildren: true,
      };
      root.children.set("main_pose_face", mainFaceRoot);
      targetRoot = mainFaceRoot;
    }

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
        data: {
          source: "main",
          pose,
        } as PoseNodeData,
      });
    });

    if (shouldSurfaceReferencePoses) {
      const referenceFaceRoot: TreeNode = {
        id: "reference_pose_face",
        label: "Reference Face",
        type: "folder",
        children: new Map(),
        showChildren: true,
      };
      root.children.set("reference_pose_face", referenceFaceRoot);

      referencePoseEntries.forEach((pose) => {
        const poseKey = `reference_pose_${pose.id}`;
        referenceFaceRoot.children.set(poseKey, {
          id: `${referenceFaceRoot.id}/${poseKey}`,
          label: pose.name,
          type: "pose",
          children: new Map(),
          showChildren: false,
          data: {
            source: "reference",
            pose,
          } as PoseNodeData,
        });
      });
    }

    const simplifiedChildren = new Map<string, TreeNode>();
    for (const [key, child] of root.children) {
      simplifiedChildren.set(key, simplifyNode(child));
    }
    root.children = simplifiedChildren;

    return root;
  }, [poses, referenceFace.file, referenceFace.isLoaded, referencePoseEntries]);

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
    onSelectBlendStage?.(null);
    onSelectPoseGroup?.({
      groupPath: folderData.groupPath,
      label: node.label,
      groupId: matchingGroup?.source === "configured" ? matchingGroup.id : null,
      poseIds,
      nodeId,
    });
  };

  const selectPoseGroup = (group: PoseGroupSummary) => {
    onSelectBlendStage?.(null);
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
      onSelectBlendStage?.(null);
      return clonedInputId;
    },
    [
      handleCloneStandardInputs,
      handleLinkChildInput,
      inputBindings,
      onSelectBlendStage,
      onSelectPoseGroup,
      onSelectRig,
      standardInputsById,
    ],
  );

  const handleAction = (node: TreeNode, action: string) => {
    if (node.type === "pose" && action === "copy-pose-to-main") {
      const poseNodeData = node.data as PoseNodeData;
      if (poseNodeData.source !== "reference") {
        return;
      }
      openPoseCopyModalForPose(
        poseNodeData.pose as ReferencePoseDefinition,
        "row-action",
      );
      return;
    }
    if (node.type === "pose" && action === "play") {
      const poseNodeData = node.data as PoseNodeData;
      if (poseNodeData.source === "reference") {
        const referencePose = poseNodeData.pose as ReferencePoseDefinition;
        if (!setReferencePoseWeightSolo(referencePose.id)) {
          console.warn(
            `[VariablesPanel] Unable to stage canonical pose-weight input for reference pose "${referencePose.name}".`,
          );
        }
        return;
      }
      if (poseNodeData.source !== "main") {
        return;
      }
      const poseData = poseNodeData.pose as PoseDefinition;
      if (!setPoseWeightSolo(poseData.id)) {
        applyPose(poseData.id);
      }
      return;
    }
    if (node.type === "pose" && action === "reset-pose") {
      const poseNodeData = node.data as PoseNodeData;
      if (poseNodeData.source === "reference") {
        const referencePose = poseNodeData.pose as ReferencePoseDefinition;
        referenceFace.handleInputPathValueChange(
          buildPoseWeightRelativePath(referencePose.id),
          0,
        );
        return;
      }
      if (poseNodeData.source !== "main") {
        return;
      }
      const poseData = poseNodeData.pose as PoseDefinition;
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
      const poseNodeData = node.data as PoseNodeData;
      if (poseNodeData.source !== "main") {
        return;
      }
      const poseData = poseNodeData.pose as PoseDefinition;
      if (poseData.id === "__pose_rig_neutral__") {
        return;
      }
      pendingPoseSelectionRef.current = true;
      duplicatePose(poseData.id);
      onSelectPoseGroup?.(null);
      onSelectBlendStage?.(null);
      return;
    }
    if (node.type === "pose" && action === "delete-pose") {
      const poseNodeData = node.data as PoseNodeData;
      if (poseNodeData.source !== "main") {
        return;
      }
      const poseData = poseNodeData.pose as PoseDefinition;
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
      if (rigData.disabled) {
        return;
      }
      const min = rigData.input.range?.min ?? 0;
      const max = rigData.input.range?.max ?? 1;
      const defaultValue = rigData.input.defaultValue ?? 0;
      const nextValue =
        action === "set-min" ? min : action === "set-max" ? max : defaultValue;
      applyRigValueBySource(rigData, nextValue, action);
      return;
    }
    if (node.type === "rig" && action === "copy-to-main") {
      const rigData = node.data as RigNodeData;
      if (rigData.source === "reference") {
        openVariableCopyModalForEntry(rigData, "row-action");
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
      onSelectBlendStage?.(null);
    }
  };

  const handleSelect = (node: TreeNode) => {
    if (node.type === "pose") {
      const poseNodeData = node.data as PoseNodeData;
      if (poseNodeData.source !== "main") {
        return;
      }
      const poseData = poseNodeData.pose as PoseDefinition;
      onSelectPoseGroup?.(null);
      onSelectBlendStage?.(null);
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
      onSelectBlendStage?.(null);
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
      onSelectBlendStage?.(null);
    }
  };

  const handleCreateVariable = () => {
    const path = createUniqueCustomVariablePath();
    const newInput = handleCreateCustomStandardInput(path);
    if (newInput) {
      onSelectRig?.(newInput.id);
      onSelectPoseGroup?.(null);
      onSelectBlendStage?.(null);
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

  const handleCopyReferenceToMain = useCallback(() => {
    const sourceIds =
      selectedReferenceRigIds.size > 0
        ? Array.from(selectedReferenceRigIds)
        : (() => {
            const firstUncopiedReference = referenceRigEntries.find(
              (entry) => !entry.linkedMainInputId,
            );
            return firstUncopiedReference
              ? [firstUncopiedReference.input.id]
              : [];
          })();
    if (sourceIds.length === 0) {
      return;
    }
    setPendingVariableCopyQueueIds(sourceIds);
    setSelectedReferenceRigIds((current) =>
      current.size > 0 ? new Set() : current,
    );
    setVariableCopyBlockingMessages([]);
    setVariableCopyModal(null);
  }, [referenceRigEntries, selectedReferenceRigIds]);

  const handleCopyReferencePoseToMain = useCallback(() => {
    const sourceIds =
      selectedReferencePoseIds.size > 0
        ? Array.from(selectedReferencePoseIds)
        : (() => {
            const firstReferencePose = referencePoseEntries[0];
            return firstReferencePose ? [firstReferencePose.id] : [];
          })();
    if (sourceIds.length === 0) {
      return;
    }
    setPendingPoseCopyQueueIds(sourceIds);
    setSelectedReferencePoseIds((current) =>
      current.size > 0 ? new Set() : current,
    );
    setPoseCopyBlockingMessages([]);
    setPoseCopyModal(null);
  }, [referencePoseEntries, selectedReferencePoseIds]);

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
    onSelectBlendStage?.(null);
  };

  const handleInspectBlendStage = (
    stage: BlendStageDefinition,
    stageIndex: number,
  ) => {
    onSelectPoseGroup?.(null);
    onSelectBlendStage?.(buildBlendStageInspectorSelection(stage, stageIndex));
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

  const variableItemCount =
    mainFaceRigEntries.length +
    referenceRigEntries.length +
    sharedRigEntries.length;
  const poseItemCount = poses.length + referencePoseEntries.length;
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
  const blendStageLabelById = useMemo(() => {
    const labels = new Map<string, string>();
    stageDefinitions.forEach((stage, index) => {
      labels.set(stage.id, blendStageDisplayName(stage, index));
    });
    return labels;
  }, [stageDefinitions]);
  const buildBlendStageInspectorSelection = useCallback(
    (
      stage: BlendStageDefinition,
      stageIndex: number,
    ): BlendStageInspectorSelection => {
      const label = blendStageDisplayName(stage, stageIndex);
      const sourceSummary =
        stage.sources
          .map((source) => {
            if (source.kind === "group") {
              return `group:${poseGroupLabelById.get(source.id) ?? source.id}`;
            }
            return `stage:${blendStageLabelById.get(source.id) ?? source.id}`;
          })
          .join(", ") || "none";
      return {
        id: stage.id,
        label,
        mode: stage.mode,
        sourceSummary,
        sourceIds: stage.sources.map((source) => blendStageSourceToken(source)),
      };
    },
    [blendStageLabelById, poseGroupLabelById],
  );

  useEffect(() => {
    if (!selectedBlendStage || !onSelectBlendStage) {
      return;
    }

    const stageIndex = stageDefinitions.findIndex(
      (stage) => stage.id === selectedBlendStage.id,
    );
    if (stageIndex < 0) {
      onSelectBlendStage(null);
      return;
    }

    const nextSelection = buildBlendStageInspectorSelection(
      stageDefinitions[stageIndex]!,
      stageIndex,
    );
    if (
      selectedBlendStage.id === nextSelection.id &&
      selectedBlendStage.label === nextSelection.label &&
      selectedBlendStage.mode === nextSelection.mode &&
      selectedBlendStage.sourceSummary === nextSelection.sourceSummary &&
      areStringListsEqual(selectedBlendStage.sourceIds, nextSelection.sourceIds)
    ) {
      return;
    }

    onSelectBlendStage(nextSelection);
  }, [
    buildBlendStageInspectorSelection,
    onSelectBlendStage,
    selectedBlendStage,
    stageDefinitions,
  ]);

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
  const referencePoseCopyCount = referencePoseEntries.length;
  const selectedReferenceRigCopyCount = selectedReferenceRigIds.size;
  const selectedReferencePoseCopyCount = selectedReferencePoseIds.size;
  const canCopyReferenceDrivers =
    selectedReferenceRigCopyCount > 0 || uncopiedReferenceCount > 0;
  const canCopyReferencePoses =
    selectedReferencePoseCopyCount > 0 || referencePoseCopyCount > 0;

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

  const actions = onClosePanel ? (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-text-secondary hover:text-text-primary"
      onClick={onClosePanel}
      title="Hide panel"
    >
      <X className="h-4 w-4" />
    </Button>
  ) : null;

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
  const setVariableCopyValueMergeDraft = useCallback(
    (
      key: keyof VariableCopyModalState["valueMerge"],
      updater: (
        current: VariableCopyNumericDecisionDraft,
      ) => VariableCopyNumericDecisionDraft,
    ) => {
      setVariableCopyModal((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          valueMerge: {
            ...current.valueMerge,
            [key]: updater(current.valueMerge[key]),
          },
        };
      });
    },
    [],
  );
  const setVariableCopyLinkRowDraft = useCallback(
    (
      relationship: "parent" | "child",
      rowId: string,
      updater: (current: VariableCopyLinkRowDraft) => VariableCopyLinkRowDraft,
    ) => {
      setVariableCopyModal((current) => {
        if (!current) {
          return current;
        }
        if (relationship === "parent") {
          const draft = current.parentRowDrafts[rowId];
          if (!draft) {
            return current;
          }
          return {
            ...current,
            parentRowDrafts: {
              ...current.parentRowDrafts,
              [rowId]: updater(draft),
            },
          };
        }
        const draft = current.childRowDrafts[rowId];
        if (!draft) {
          return current;
        }
        return {
          ...current,
          childRowDrafts: {
            ...current.childRowDrafts,
            [rowId]: updater(draft),
          },
        };
      });
    },
    [],
  );
  const variableCopyPrimaryDestinationOptions = useMemo(
    () =>
      variableCopyModal
        ? [...variableCopyModal.destinationCatalog.inputs]
            .filter(isPrimaryVariableDestinationInput)
            .sort(sortCatalogInputs)
        : [],
    [variableCopyModal],
  );
  const variableCopyPrimaryDestinationComboboxOptions = useMemo(
    () =>
      variableCopyPrimaryDestinationOptions.map((input) => ({
        value: input.id,
        label: input.path,
        description: input.label,
      })),
    [variableCopyPrimaryDestinationOptions],
  );
  const variableCopyRelationshipDestinationComboboxOptions = useMemo(
    () =>
      variableCopyModal
        ? [...variableCopyModal.destinationCatalog.inputs]
            .sort(sortCatalogInputs)
            .map((input) => ({
              value: input.id,
              label: input.path,
              description: input.label,
            }))
        : [],
    [variableCopyModal],
  );
  const variableCopyRelationshipDestinationOptions = useMemo(
    () =>
      variableCopyModal
        ? [...variableCopyModal.destinationCatalog.inputs].sort(
            sortCatalogInputs,
          )
        : [],
    [variableCopyModal],
  );
  const variableCopyUnresolvedCount = useMemo(() => {
    if (!variableCopyModal) {
      return 0;
    }
    let unresolvedCount = 0;
    if (variableCopyModal.destinationMode === "existing") {
      const destinationInputId = variableCopyModal.destinationInputId.trim();
      if (
        !destinationInputId ||
        !variableCopyModal.destinationCatalog.inputsById.has(destinationInputId)
      ) {
        unresolvedCount += 1;
      }
    } else {
      const normalized = normalizeStandardRigInputPath(
        variableCopyModal.newDestinationPath,
      );
      if (!normalized || standardInputsByPath.has(normalized)) {
        unresolvedCount += 1;
      }
    }
    const relationshipRows: Array<{
      row: VariableLinkMappingRow;
      draft: VariableCopyLinkRowDraft | undefined;
    }> = [
      ...variableCopyModal.proposal.parentRows.map((row) => ({
        row,
        draft: variableCopyModal.parentRowDrafts[row.rowId],
      })),
      ...variableCopyModal.proposal.childRows.map((row) => ({
        row,
        draft: variableCopyModal.childRowDrafts[row.rowId],
      })),
    ];
    relationshipRows.forEach(({ row, draft }) => {
      const activeDraft =
        draft ??
        createVariableCopyLinkRowDraft(
          row,
          variableCopyRelationshipDestinationOptions,
        );
      if (!activeDraft.apply) {
        return;
      }
      const destinationInputId = activeDraft.destinationInputId.trim();
      if (
        !destinationInputId ||
        !variableCopyModal.destinationCatalog.inputsById.has(destinationInputId)
      ) {
        unresolvedCount += 1;
      }
    });
    return unresolvedCount;
  }, [
    standardInputsByPath,
    variableCopyModal,
    variableCopyRelationshipDestinationOptions,
  ]);
  const setPoseCopyTargetRowDraft = useCallback(
    (
      rowId: string,
      updater: (current: PoseCopyTargetRowDraft) => PoseCopyTargetRowDraft,
    ) => {
      setPoseCopyModal((current) => {
        if (!current) {
          return current;
        }
        const draft = current.targetRowDrafts[rowId];
        if (!draft) {
          return current;
        }
        return {
          ...current,
          targetRowDrafts: {
            ...current.targetRowDrafts,
            [rowId]: updater(draft),
          },
        };
      });
    },
    [],
  );
  const poseCopyDestinationOptions = useMemo(
    () =>
      poseCopyModal
        ? [...poseCopyModal.destinationCatalog.inputs].sort(sortCatalogInputs)
        : [],
    [poseCopyModal],
  );
  const poseCopyDestinationComboboxOptions = useMemo(
    () =>
      poseCopyDestinationOptions.map((input) => ({
        value: input.id,
        label: input.path,
        description: input.label,
      })),
    [poseCopyDestinationOptions],
  );
  const poseCopyUnresolvedCount = poseCopyModal
    ? poseCopyModal.proposal.targetRows.filter((row) => {
        const draft = poseCopyModal.targetRowDrafts[row.rowId];
        const mappedInputId = draft?.destinationInputId.trim() ?? "";
        if (!mappedInputId) {
          return true;
        }
        return !poseCopyModal.destinationCatalog.inputsById.has(mappedInputId);
      }).length
    : 0;

  return (
    <>
      <Panel
        title={panelTitle}
        description={panelDescription}
        className="flex-1 min-h-0 border-none bg-transparent shadow-none p-0"
        actions={actions}
        badge={`${totalCount}`}
      >
        <Tabs
          className="flex-1 min-h-0"
          fillPanels
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
            const hasReferenceFace = Boolean(referenceFace.file);
            const showSurfaceContext =
              hasReferenceFace && (isVariables || isPoses || isInputs);
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
                      {referenceFace.file && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 text-cyan-200 hover:text-cyan-100"
                          onClick={handleCopyReferencePoseToMain}
                          disabled={!canCopyReferencePoses}
                          title={
                            selectedReferencePoseCopyCount > 0
                              ? "Copy selected reference poses to the main face"
                              : "Copy a reference pose to the main face"
                          }
                        >
                          <Copy size={11} />
                          {selectedReferencePoseCopyCount > 0
                            ? `Copy Ref Pose (${selectedReferencePoseCopyCount})`
                            : `Copy Ref Pose (${referencePoseCopyCount})`}
                        </Button>
                      )}
                    </>
                  )}
                  {isVariables && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1 text-text-secondary hover:text-text-primary"
                      onClick={handleCopyReferenceToMain}
                      disabled={!canCopyReferenceDrivers}
                      title={
                        selectedReferenceRigCopyCount > 0
                          ? "Copy selected reference drivers to main face"
                          : "Copy reference-only drivers to main face"
                      }
                    >
                      <Copy size={11} />
                      {selectedReferenceRigCopyCount > 0
                        ? `Copy Ref (${selectedReferenceRigCopyCount})`
                        : `Copy Ref (${uncopiedReferenceCount})`}
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
                {showSurfaceContext && (
                  <div className="flex flex-wrap items-center gap-1 px-1 mb-1">
                    {isVariables ? (
                      <>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted mr-1">
                          Variables Context
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border-default/60 text-text-secondary">
                          Main Face
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-teal-500/40 text-teal-200">
                          Shared
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-200">
                          Reference Face
                        </span>
                      </>
                    ) : isPoses ? (
                      <>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted mr-1">
                          Poses Context
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border-default/60 text-text-secondary">
                          Main Face
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/40 text-cyan-200">
                          Reference Face
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] uppercase tracking-wider text-text-muted mr-1">
                          Inputs Context
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-border-default/60 text-text-secondary">
                          Main Face Inputs Only
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-cyan-500/30 text-cyan-100/90">
                          Compare in Variables/Poses
                        </span>
                      </>
                    )}
                  </div>
                )}
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
                          className="h-6 px-2 text-[10px] disabled:opacity-100 disabled:cursor-default"
                          disabled={crossGroupBlendMode === "average"}
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
                          className="h-6 px-2 text-[10px] disabled:opacity-100 disabled:cursor-default"
                          disabled={crossGroupBlendMode === "additive"}
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
                            const isSelectedStage =
                              selectedBlendStage?.id === stage.id;
                            const stageSourceSummary =
                              stage.sources.length === 0
                                ? "No sources configured"
                                : stage.sources
                                    .map((source) =>
                                      source.kind === "group"
                                        ? source.id
                                        : `stage:${source.id}`,
                                    )
                                    .join(" · ");
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
                                role="button"
                                tabIndex={0}
                                aria-pressed={isSelectedStage}
                                aria-label={`Inspect blend stage ${stageName}`}
                                className={cn(
                                  "rounded border p-2 flex flex-col gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                                  isSelectedStage
                                    ? "border-accent/60 bg-accent/10"
                                    : "border-border-default/50 bg-bg-panel/30 hover:border-border-default/70 hover:bg-bg-panel/45",
                                )}
                                onClick={() =>
                                  handleInspectBlendStage(stage, stageIndex)
                                }
                                onKeyDown={(event) => {
                                  if (
                                    event.key !== "Enter" &&
                                    event.key !== " "
                                  ) {
                                    return;
                                  }
                                  event.preventDefault();
                                  handleInspectBlendStage(stage, stageIndex);
                                }}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-text-muted font-mono">
                                    {stage.id}
                                  </span>
                                  <span className="text-xs text-text-primary">
                                    {stageName}
                                  </span>
                                  <span className="text-[10px] text-text-muted uppercase tracking-wide">
                                    {stage.mode === "add" ? "Add" : "Average"}
                                  </span>
                                  {isSelectedStage && (
                                    <span className="rounded border border-accent/50 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-accent">
                                      Inspecting
                                    </span>
                                  )}
                                  <div className="ml-auto flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1"
                                      disabled={Boolean(moveUpIssue)}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleReorderBlendStage(
                                          stageIndex,
                                          "up",
                                        );
                                      }}
                                      title={
                                        moveUpIssue &&
                                        moveUpIssue !== "Boundary"
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
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleReorderBlendStage(
                                          stageIndex,
                                          "down",
                                        );
                                      }}
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
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleRenameBlendStage(
                                          stage,
                                          stageIndex,
                                        );
                                      }}
                                      title="Rename blend stage"
                                    >
                                      Rename
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-2 text-[10px] text-amber-300 hover:text-amber-200"
                                      disabled={referencesThisStage}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleDeleteBlendStage(
                                          stage,
                                          stageIndex,
                                        );
                                      }}
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
                                <div className="text-[10px] text-text-muted font-mono truncate">
                                  Sources: {stageSourceSummary}
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
                            Control Scope
                          </span>
                          <span className="text-[10px] text-text-muted">
                            Main controls only Main Face, Reference controls
                            only Reference Face, and Shared controls both.
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
                        if (a.type === "folder" && b.type !== "folder")
                          return -1;
                        if (a.type !== "folder" && b.type === "folder")
                          return 1;
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
                          selectedReferenceRigIds={selectedReferenceRigIds}
                          selectedReferencePoseIds={selectedReferencePoseIds}
                          onToggleReferenceRigSelection={
                            toggleReferenceRigSelection
                          }
                          onToggleReferencePoseSelection={
                            toggleReferencePoseSelection
                          }
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
      {variableCopyModal && (
        <Modal
          open={true}
          onClose={closeVariableCopyModal}
          title="Variable Copy Mapping"
          maxWidth="4xl"
        >
          <div className="space-y-4">
            <div className="text-xs text-text-muted">
              {variableCopyModal.launchSource === "toolbar"
                ? "Toolbar copy flow"
                : "Row copy flow"}{" "}
              · unresolved rows: {variableCopyUnresolvedCount}
            </div>

            {variableCopyBlockingMessages.length > 0 && (
              <div
                role="alert"
                className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              >
                {variableCopyBlockingMessages.map((message, index) => (
                  <div key={`${message}:${index.toString(10)}`}>{message}</div>
                ))}
              </div>
            )}
            {variableCopyBlockingMessages.length === 0 &&
              variableCopyUnresolvedCount > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {variableCopyUnresolvedCount} unresolved mappings need review
                  before confirm. Use `Match Source Path` for quick
                  auto-mapping.
                </div>
              )}

            <section className="rounded border border-border-default/60 bg-bg-panel/40 p-3 space-y-3">
              <div className="text-xs font-semibold text-text-primary">
                Destination
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={cn(
                    "h-7 px-3 rounded border text-[11px]",
                    variableCopyModal.destinationMode === "existing"
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border-default text-text-muted hover:text-text-primary",
                  )}
                  onClick={() => {
                    setVariableCopyBlockingMessages([]);
                    setVariableCopyModal((current) =>
                      current
                        ? {
                            ...current,
                            destinationMode: "existing",
                          }
                        : current,
                    );
                  }}
                >
                  Existing
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-7 px-3 rounded border text-[11px]",
                    variableCopyModal.destinationMode === "new"
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-border-default text-text-muted hover:text-text-primary",
                  )}
                  onClick={() => {
                    setVariableCopyBlockingMessages([]);
                    setVariableCopyModal((current) =>
                      current
                        ? {
                            ...current,
                            destinationMode: "new",
                          }
                        : current,
                    );
                  }}
                >
                  New
                </button>
              </div>
              {variableCopyModal.destinationMode === "existing" ? (
                <div className="flex flex-col gap-1 text-xs text-text-muted">
                  <span>Map to existing input</span>
                  <Combobox
                    value={variableCopyModal.destinationInputId.trim() || null}
                    onChange={(nextValue) => {
                      setVariableCopyBlockingMessages([]);
                      setVariableCopyModal((current) =>
                        current
                          ? { ...current, destinationInputId: nextValue ?? "" }
                          : current,
                      );
                    }}
                    options={variableCopyPrimaryDestinationComboboxOptions}
                    placeholder="Search destination input"
                    size="sm"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    New path
                    <input
                      value={variableCopyModal.newDestinationPath}
                      onChange={(event) => {
                        setVariableCopyBlockingMessages([]);
                        setVariableCopyModal((current) =>
                          current
                            ? {
                                ...current,
                                newDestinationPath: event.target.value,
                              }
                            : current,
                        );
                      }}
                      className="h-8 rounded border border-border-default bg-bg-canvas px-2 text-xs text-text-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    New label
                    <input
                      value={variableCopyModal.newDestinationLabel}
                      onChange={(event) => {
                        setVariableCopyBlockingMessages([]);
                        setVariableCopyModal((current) =>
                          current
                            ? {
                                ...current,
                                newDestinationLabel: event.target.value,
                              }
                            : current,
                        );
                      }}
                      className="h-8 rounded border border-border-default bg-bg-canvas px-2 text-xs text-text-primary"
                    />
                  </label>
                </div>
              )}
            </section>

            <section className="rounded border border-border-default/60 bg-bg-panel/40 p-3 space-y-2">
              <div className="text-xs font-semibold text-text-primary">
                Value Merge
              </div>
              {(
                [
                  {
                    key: "min",
                    label: "Min",
                    sourceValue:
                      variableCopyModal.sourceReferenceEntry.input.range.min,
                  },
                  {
                    key: "max",
                    label: "Max",
                    sourceValue:
                      variableCopyModal.sourceReferenceEntry.input.range.max,
                  },
                  {
                    key: "defaultValue",
                    label: "Default",
                    sourceValue:
                      variableCopyModal.sourceReferenceEntry.input.defaultValue,
                  },
                ] as const
              ).map((field) => {
                const draft = variableCopyModal.valueMerge[field.key];
                const existingDestinationInput =
                  variableCopyModal.destinationMode === "existing"
                    ? (variableCopyModal.destinationCatalog.inputsById.get(
                        variableCopyModal.destinationInputId.trim(),
                      ) ?? null)
                    : null;
                const destinationValue = existingDestinationInput
                  ? field.key === "min"
                    ? existingDestinationInput.range.min
                    : field.key === "max"
                      ? existingDestinationInput.range.max
                      : existingDestinationInput.defaultValue
                  : null;
                return (
                  <div
                    key={field.key}
                    className="grid grid-cols-1 gap-2 md:grid-cols-[96px_minmax(0,1fr)_auto] md:items-center"
                  >
                    <div className="text-xs text-text-muted">
                      {field.label} ({field.sourceValue.toFixed(3)})
                    </div>
                    <input
                      value={draft.customValue}
                      onChange={(event) => {
                        setVariableCopyBlockingMessages([]);
                        setVariableCopyValueMergeDraft(
                          field.key,
                          (current) => ({
                            ...current,
                            mode: "custom",
                            customValue: event.target.value,
                          }),
                        );
                      }}
                      className="h-8 rounded border border-border-default bg-bg-canvas px-2 text-xs text-text-primary"
                    />
                    {isFiniteNumber(destinationValue) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-[10px]"
                        onClick={() => {
                          setVariableCopyBlockingMessages([]);
                          setVariableCopyValueMergeDraft(
                            field.key,
                            (current) => ({
                              ...current,
                              mode: "custom",
                              customValue:
                                toDecisionCustomValue(destinationValue),
                            }),
                          );
                        }}
                      >
                        Use current {field.label.toLowerCase()} (
                        {destinationValue.toFixed(3)})
                      </Button>
                    ) : (
                      <span className="text-[10px] text-text-muted">
                        No current main face value
                      </span>
                    )}
                  </div>
                );
              })}
            </section>

            {(
              [
                [
                  "parent",
                  "Parent mappings",
                  variableCopyModal.proposal.parentRows,
                ],
                [
                  "child",
                  "Child mappings",
                  variableCopyModal.proposal.childRows,
                ],
              ] as const
            ).map(([relationship, label, rows]) => {
              const drafts =
                relationship === "parent"
                  ? variableCopyModal.parentRowDrafts
                  : variableCopyModal.childRowDrafts;
              return (
                <section
                  key={relationship}
                  className="rounded border border-border-default/60 bg-bg-panel/40 p-3 space-y-2"
                >
                  <div className="text-xs font-semibold text-text-primary">
                    {label}
                  </div>
                  {rows.length === 0 ? (
                    <div className="text-xs text-text-muted">No mappings.</div>
                  ) : (
                    rows.map((row) => {
                      const draft =
                        drafts[row.rowId] ??
                        createVariableCopyLinkRowDraft(
                          row,
                          variableCopyRelationshipDestinationOptions,
                        );
                      const mappedInputId = draft.destinationInputId.trim();
                      const mappedInput = mappedInputId
                        ? (variableCopyModal.destinationCatalog.inputsById.get(
                            mappedInputId,
                          ) ?? null)
                        : null;
                      const mappedStatus = draft.apply
                        ? mappedInput
                          ? "resolved"
                          : "unmapped"
                        : "skipped";
                      const resolvedLinkValues =
                        variableCopyModal.destinationMode === "existing" &&
                        variableCopyModal.destinationInputId.trim().length >
                          0 &&
                        mappedInput
                          ? relationship === "parent"
                            ? (variableCopyModal.destinationCatalog.inputsById
                                .get(
                                  variableCopyModal.destinationInputId.trim(),
                                )
                                ?.parents.find(
                                  (link) =>
                                    link.parentInputId === mappedInput.id,
                                ) ?? null)
                            : (variableCopyModal.destinationCatalog.inputsById
                                .get(
                                  variableCopyModal.destinationInputId.trim(),
                                )
                                ?.children.find(
                                  (link) =>
                                    link.childInputId === mappedInput.id,
                                ) ?? null)
                          : null;
                      return (
                        <div
                          key={row.rowId}
                          className="rounded border border-border-default/50 bg-bg-panel/50 p-2 space-y-2"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-2 text-xs text-text-primary">
                              <input
                                type="checkbox"
                                checked={draft.apply}
                                onChange={(event) => {
                                  setVariableCopyBlockingMessages([]);
                                  setVariableCopyLinkRowDraft(
                                    relationship,
                                    row.rowId,
                                    (current) => ({
                                      ...current,
                                      apply: event.target.checked,
                                    }),
                                  );
                                }}
                              />
                              Apply
                            </label>
                            <span
                              className={cn(
                                "text-[11px] uppercase tracking-wide",
                                mappedStatus === "resolved"
                                  ? "text-emerald-300"
                                  : mappedStatus === "skipped"
                                    ? "text-text-muted"
                                    : "text-amber-300",
                              )}
                            >
                              {mappedStatus}
                            </span>
                            <span className="text-xs text-text-muted">
                              {row.sourceLabel} ({row.sourcePath ?? "no-path"})
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 text-xs text-text-muted">
                            <div className="flex items-center justify-between gap-2">
                              <span>Destination input</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10px]"
                                disabled={!draft.apply || !row.sourcePath}
                                onClick={() => {
                                  const sourcePath = row.sourcePath ?? "";
                                  const uniqueMatch =
                                    resolveUniqueCatalogInputByPathQuery(
                                      variableCopyRelationshipDestinationOptions,
                                      sourcePath,
                                    );
                                  setVariableCopyBlockingMessages([]);
                                  setVariableCopyLinkRowDraft(
                                    relationship,
                                    row.rowId,
                                    (current) => ({
                                      ...current,
                                      apply: true,
                                      destinationInputId: uniqueMatch?.id ?? "",
                                      searchQuery: sourcePath,
                                    }),
                                  );
                                }}
                                title="Seed destination search and auto-apply when one match exists"
                              >
                                Match Source Path
                              </Button>
                            </div>
                            <Combobox
                              value={draft.destinationInputId || null}
                              query={draft.searchQuery}
                              disabled={!draft.apply}
                              onChange={(nextValue) => {
                                setVariableCopyBlockingMessages([]);
                                setVariableCopyLinkRowDraft(
                                  relationship,
                                  row.rowId,
                                  (current) => ({
                                    ...current,
                                    apply: true,
                                    destinationInputId: nextValue ?? "",
                                  }),
                                );
                              }}
                              onQueryChange={(nextQuery) => {
                                setVariableCopyLinkRowDraft(
                                  relationship,
                                  row.rowId,
                                  (current) => ({
                                    ...current,
                                    searchQuery: nextQuery,
                                  }),
                                );
                              }}
                              options={
                                variableCopyRelationshipDestinationComboboxOptions
                              }
                              placeholder="Search destination input"
                              size="sm"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            {(
                              [
                                ["scale", "Scale", row.sourceScale],
                                ["offset", "Offset", row.sourceOffset],
                              ] as const
                            ).map(([key, mergeLabel, sourceValue]) => {
                              const decision = draft[key];
                              const destinationValue =
                                key === "scale"
                                  ? (resolvedLinkValues?.scale ?? null)
                                  : (resolvedLinkValues?.offset ?? null);
                              return (
                                <div
                                  key={key}
                                  className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]"
                                >
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[10px] uppercase tracking-wide text-text-muted">
                                      {mergeLabel} ({sourceValue.toFixed(3)})
                                    </span>
                                    <input
                                      value={decision.customValue}
                                      disabled={!draft.apply}
                                      onChange={(event) => {
                                        setVariableCopyBlockingMessages([]);
                                        setVariableCopyLinkRowDraft(
                                          relationship,
                                          row.rowId,
                                          (current) => ({
                                            ...current,
                                            [key]: {
                                              ...current[key],
                                              mode: "custom",
                                              customValue: event.target.value,
                                            },
                                          }),
                                        );
                                      }}
                                      className="h-8 rounded border border-border-default bg-bg-canvas px-2 text-xs text-text-primary disabled:opacity-40"
                                    />
                                  </div>
                                  {isFiniteNumber(destinationValue) ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={!draft.apply}
                                      className="h-8 px-2 text-[10px]"
                                      onClick={() => {
                                        setVariableCopyBlockingMessages([]);
                                        setVariableCopyLinkRowDraft(
                                          relationship,
                                          row.rowId,
                                          (current) => ({
                                            ...current,
                                            [key]: {
                                              ...current[key],
                                              mode: "custom",
                                              customValue:
                                                toDecisionCustomValue(
                                                  destinationValue,
                                                ),
                                            },
                                          }),
                                        );
                                      }}
                                    >
                                      Use current {mergeLabel.toLowerCase()} (
                                      {destinationValue.toFixed(3)})
                                    </Button>
                                  ) : (
                                    <span className="self-center text-[10px] text-text-muted">
                                      No current value
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          {row.rationale.length > 0 && (
                            <div className="text-[11px] text-text-muted">
                              {row.rationale.join(" · ")}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </section>
              );
            })}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={closeVariableCopyModal}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleConfirmVariableCopyModal}
              >
                Confirm Copy
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {poseCopyModal && (
        <Modal
          open={true}
          onClose={closePoseCopyModal}
          title="Pose Copy Mapping"
          maxWidth="4xl"
        >
          <div className="space-y-4">
            <div className="text-xs text-text-muted">
              {poseCopyModal.launchSource === "toolbar"
                ? "Toolbar copy flow"
                : "Row copy flow"}{" "}
              · unresolved rows: {poseCopyUnresolvedCount}
            </div>

            {poseCopyBlockingMessages.length > 0 && (
              <div
                role="alert"
                className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              >
                {poseCopyBlockingMessages.map((message, index) => (
                  <div key={`${message}:${index.toString(10)}`}>{message}</div>
                ))}
              </div>
            )}
            {poseCopyBlockingMessages.length === 0 &&
              poseCopyUnresolvedCount > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {poseCopyUnresolvedCount} unresolved target mappings need
                  review before confirm. Use `Match Source Path` for quick
                  auto-mapping.
                </div>
              )}

            <section className="rounded border border-border-default/60 bg-bg-panel/40 p-3 space-y-3">
              <div className="text-xs font-semibold text-text-primary">
                Destination Pose
              </div>
              <label className="flex flex-col gap-1 text-xs text-text-muted">
                Name
                <input
                  value={poseCopyModal.destinationPoseName}
                  onChange={(event) => {
                    setPoseCopyBlockingMessages([]);
                    setPoseCopyModal((current) =>
                      current
                        ? {
                            ...current,
                            destinationPoseName: event.target.value,
                          }
                        : current,
                    );
                  }}
                  className="h-8 rounded border border-border-default bg-bg-canvas px-2 text-xs text-text-primary"
                />
              </label>
            </section>

            <section className="rounded border border-border-default/60 bg-bg-panel/40 p-3 space-y-2">
              <div className="text-xs font-semibold text-text-primary">
                Target mappings
              </div>
              {poseCopyModal.proposal.targetRows.length === 0 ? (
                <div className="text-xs text-text-muted">
                  No targets available.
                </div>
              ) : (
                poseCopyModal.proposal.targetRows.map((row) => {
                  const draft =
                    poseCopyModal.targetRowDrafts[row.rowId] ??
                    createPoseCopyTargetRowDraft(
                      row,
                      poseCopyDestinationOptions,
                    );
                  const mappedInputId = draft.destinationInputId.trim();
                  const mappedInput = mappedInputId
                    ? (poseCopyModal.destinationCatalog.inputsById.get(
                        mappedInputId,
                      ) ?? null)
                    : null;
                  const mappedStatus = mappedInput ? "resolved" : "unmapped";
                  const existingPoseValue =
                    mappedInput &&
                    poseCopyModal.destinationPoseName.trim().length > 0
                      ? (() => {
                          const existingPose = poses.find(
                            (pose) =>
                              pose.name.trim() ===
                              poseCopyModal.destinationPoseName.trim(),
                          );
                          if (!existingPose) {
                            return null;
                          }
                          const value = existingPose.values?.[mappedInput.id];
                          return isFiniteNumber(value) ? value : null;
                        })()
                      : null;
                  return (
                    <div
                      key={row.rowId}
                      className="rounded border border-border-default/50 bg-bg-panel/50 p-2 space-y-2"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-text-muted">
                          {row.sourcePath ?? row.sourceInputId}
                        </span>
                        <span
                          className={cn(
                            "text-[11px] uppercase tracking-wide",
                            mappedStatus === "resolved"
                              ? "text-emerald-300"
                              : "text-amber-300",
                          )}
                        >
                          {mappedStatus}
                        </span>
                        <span className="text-xs text-text-muted">
                          source value: {row.sourceValue.toFixed(3)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1 text-xs text-text-muted">
                        <div className="flex items-center justify-between gap-2">
                          <span>Destination input</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            disabled={!row.sourcePath}
                            onClick={() => {
                              const sourcePath = row.sourcePath ?? "";
                              const uniqueMatch =
                                resolveUniqueCatalogInputByPathQuery(
                                  poseCopyDestinationOptions,
                                  sourcePath,
                                );
                              setPoseCopyBlockingMessages([]);
                              setPoseCopyTargetRowDraft(
                                row.rowId,
                                (current) => ({
                                  ...current,
                                  destinationInputId: uniqueMatch?.id ?? "",
                                  searchQuery: sourcePath,
                                }),
                              );
                            }}
                          >
                            Match Source Path
                          </Button>
                        </div>
                        <Combobox
                          value={draft.destinationInputId || null}
                          query={draft.searchQuery}
                          onChange={(nextValue) => {
                            setPoseCopyBlockingMessages([]);
                            setPoseCopyTargetRowDraft(row.rowId, (current) => ({
                              ...current,
                              destinationInputId: nextValue ?? "",
                            }));
                          }}
                          onQueryChange={(nextQuery) => {
                            setPoseCopyTargetRowDraft(row.rowId, (current) => ({
                              ...current,
                              searchQuery: nextQuery,
                            }));
                          }}
                          options={poseCopyDestinationComboboxOptions}
                          placeholder="Search destination input"
                          size="sm"
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                        <input
                          value={draft.value.customValue}
                          onChange={(event) => {
                            setPoseCopyBlockingMessages([]);
                            setPoseCopyTargetRowDraft(row.rowId, (current) => ({
                              ...current,
                              value: {
                                ...current.value,
                                mode: "custom",
                                customValue: event.target.value,
                              },
                            }));
                          }}
                          className="h-8 rounded border border-border-default bg-bg-canvas px-2 text-xs text-text-primary"
                        />
                        {isFiniteNumber(existingPoseValue) ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[10px]"
                            onClick={() => {
                              setPoseCopyBlockingMessages([]);
                              setPoseCopyTargetRowDraft(
                                row.rowId,
                                (current) => ({
                                  ...current,
                                  value: {
                                    ...current.value,
                                    mode: "custom",
                                    customValue:
                                      toDecisionCustomValue(existingPoseValue),
                                  },
                                }),
                              );
                            }}
                          >
                            Use current pose value (
                            {existingPoseValue.toFixed(3)})
                          </Button>
                        ) : (
                          <span className="self-center text-[10px] text-text-muted">
                            No current pose value
                          </span>
                        )}
                      </div>

                      {row.rationale.length > 0 && (
                        <div className="text-[11px] text-text-muted">
                          {row.rationale.join(" · ")}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={closePoseCopyModal}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleConfirmPoseCopyModal}
              >
                Confirm Copy
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
