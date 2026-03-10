import type { StandardRigInput } from "@vizij/utils";
import { normalizeStandardRigInputPath } from "@vizij/utils";
import type { ManagedStandardInput } from "../../types/standardInputs";
import type {
  PoseBlendMode,
  PoseGroupDefinition,
  PoseIrBlendStageDefinition,
} from "../../poseRig/types";
import {
  isPoseControlInputPath,
  isPoseOutputInputPath,
  parsePoseWeightInputSourceId,
} from "../../poseRig/utils";
import { isPropsRigStandardInputPath } from "../../utils/rigElementInputs";

export type InputCatalogSource =
  | "auto"
  | "preset"
  | "custom"
  | "reference"
  | "shared";

export interface InputCatalogRow {
  id: string;
  label: string;
  inputId: string;
  source: InputCatalogSource;
  path: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  controlKind: "rig-input" | "pose-weight" | "group-output" | "stage-output";
  provenance?: string;
  editable: boolean;
  selectable: boolean;
}

export interface InputCatalogTreeNode {
  id: string;
  label: string;
  path: string;
  row?: InputCatalogRow;
  children: InputCatalogTreeNode[];
}

const INPUT_CONTROL_KIND_LABEL: Record<InputCatalogRow["controlKind"], string> =
  {
    "rig-input": "rig",
    "pose-weight": "pose-weight",
    "group-output": "group-output",
    "stage-output": "stage-output",
  };

const INPUT_CONTROL_KIND_BADGE_CLASS: Record<
  InputCatalogRow["controlKind"],
  string
> = {
  "rig-input": "bg-slate-900/40 text-slate-200",
  "pose-weight": "bg-violet-900/40 text-violet-200",
  "group-output": "bg-teal-900/40 text-teal-200",
  "stage-output": "bg-cyan-900/40 text-cyan-200",
};

export function getInputControlKindLabel(
  controlKind: InputCatalogRow["controlKind"],
): string {
  return INPUT_CONTROL_KIND_LABEL[controlKind];
}

export function getInputControlKindBadgeClass(
  controlKind: InputCatalogRow["controlKind"],
): string {
  return INPUT_CONTROL_KIND_BADGE_CLASS[controlKind];
}

interface BuildVisibleInputCatalogArgs {
  managedStandardInputs: ManagedStandardInput[];
  fullyLockedFaceElementIds: Set<string>;
  lockedPropsRigComponentIds: Set<string>;
  inputValues: Record<string, number | undefined>;
  poseNameById: Map<string, string>;
  poseGroups: PoseGroupDefinition[];
  blendStages: PoseIrBlendStageDefinition[];
  poseGroupBlendModeFallback: PoseBlendMode;
  poseCountByGroupId: Map<string, number>;
  poseGroupLabelById: Map<string, string>;
  resolveManagedSource: (entry: ManagedStandardInput) => InputCatalogSource;
}

function buildManagedInputRows(
  args: Omit<
    BuildVisibleInputCatalogArgs,
    | "poseGroups"
    | "blendStages"
    | "poseGroupBlendModeFallback"
    | "poseCountByGroupId"
    | "poseGroupLabelById"
  >,
): InputCatalogRow[] {
  const {
    managedStandardInputs,
    fullyLockedFaceElementIds,
    lockedPropsRigComponentIds,
    inputValues,
    poseNameById,
    resolveManagedSource,
  } = args;

  return managedStandardInputs
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
      const normalizedPath = normalizeStandardRigInputPath(entry.input.path);
      const min = entry.input.range?.min ?? 0;
      const max = entry.input.range?.max ?? 1;
      const value = inputValues[entry.input.id];
      const resolvedValue =
        typeof value === "number" && Number.isFinite(value)
          ? value
          : (entry.input.defaultValue ?? 0);
      const poseWeightPoseId = parsePoseWeightInputSourceId(
        entry.input.sourceId,
      );
      const controlKind: InputCatalogRow["controlKind"] = poseWeightPoseId
        ? "pose-weight"
        : "rig-input";
      return {
        id: entry.input.id,
        label: entry.input.label || entry.input.id,
        inputId: entry.input.id,
        source: resolveManagedSource(entry),
        path: normalizedPath,
        value: resolvedValue,
        defaultValue: entry.input.defaultValue ?? 0,
        min,
        max,
        controlKind,
        provenance: poseWeightPoseId
          ? `pose:${poseNameById.get(poseWeightPoseId) ?? poseWeightPoseId}`
          : undefined,
        editable: true,
        selectable: true,
      } satisfies InputCatalogRow;
    });
}

function buildDerivedPoseOutputRows(args: {
  poseGroups: PoseGroupDefinition[];
  blendStages: PoseIrBlendStageDefinition[];
  poseGroupBlendModeFallback: PoseBlendMode;
  poseCountByGroupId: Map<string, number>;
  poseGroupLabelById: Map<string, string>;
}): InputCatalogRow[] {
  const {
    poseGroups,
    blendStages,
    poseGroupBlendModeFallback,
    poseCountByGroupId,
    poseGroupLabelById,
  } = args;

  const groupRows = poseGroups.map((group) => {
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
      defaultValue: 0,
      min: 0,
      max: 1,
      controlKind: "group-output" as const,
      provenance: `group:${groupId}; mode:${blendMode}; poses:${poseCount}`,
      editable: false,
      selectable: false,
    } satisfies InputCatalogRow;
  });

  const stageRows = blendStages.map((stage) => {
    const stageId = stage.id.trim();
    const stageName = stage.name?.trim() || stageId;
    const path = normalizeStandardRigInputPath(
      `/pose/stages/${stageId}.output`,
    );
    const sourceSummary =
      stage.sources
        .map((source) =>
          source.kind === "group"
            ? `group:${poseGroupLabelById.get(source.id) ?? source.id}`
            : `stage:${source.id}`,
        )
        .join(", ") || "none";

    return {
      id: `pose_stage_output:${stageId}`,
      label: `Stage Output · ${stageName}`,
      inputId: `__pose_stage_output__:${stageId}`,
      source: "auto" as const,
      path,
      value: 0,
      defaultValue: 0,
      min: 0,
      max: 1,
      controlKind: "stage-output" as const,
      provenance: `stage:${stageId}; mode:${stage.mode}; sources:${sourceSummary}`,
      editable: false,
      selectable: false,
    } satisfies InputCatalogRow;
  });

  return [...groupRows, ...stageRows];
}

export function buildVisibleInputCatalog(
  args: BuildVisibleInputCatalogArgs,
): InputCatalogRow[] {
  const managedRows = buildManagedInputRows(args);
  const derivedRows = buildDerivedPoseOutputRows({
    poseGroups: args.poseGroups,
    blendStages: args.blendStages,
    poseGroupBlendModeFallback: args.poseGroupBlendModeFallback,
    poseCountByGroupId: args.poseCountByGroupId,
    poseGroupLabelById: args.poseGroupLabelById,
  });
  return [...managedRows, ...derivedRows];
}

function ensureChildNode(
  parent: InputCatalogTreeNode,
  label: string,
  path: string,
): InputCatalogTreeNode {
  const existing = parent.children.find((child) => child.label === label);
  if (existing) {
    return existing;
  }
  const node: InputCatalogTreeNode = {
    id: `${parent.id}/${label}`,
    label,
    path,
    children: [],
  };
  parent.children.push(node);
  return node;
}

function pathSegments(path: string): string[] {
  return normalizeStandardRigInputPath(path).split("/").filter(Boolean);
}

function rowSort(left: InputCatalogRow, right: InputCatalogRow): number {
  if (left.controlKind !== right.controlKind) {
    return left.controlKind.localeCompare(right.controlKind);
  }
  return left.label.localeCompare(right.label);
}

export function buildInputCatalogTree(
  rows: readonly InputCatalogRow[],
): InputCatalogTreeNode[] {
  const root: InputCatalogTreeNode = {
    id: "input_catalog_root",
    label: "Inputs",
    path: "/",
    children: [],
  };

  [...rows].sort(rowSort).forEach((row) => {
    const segments = pathSegments(row.path);
    if (segments.length === 0) {
      root.children.push({
        id: `${root.id}/${row.id}`,
        label: row.label,
        path: row.path,
        row,
        children: [],
      });
      return;
    }

    let cursor = root;
    let runningPath = "";
    segments.forEach((segment, index) => {
      runningPath = `${runningPath}/${segment}`;
      const isLeaf = index === segments.length - 1;
      if (isLeaf) {
        cursor.children.push({
          id: `${cursor.id}/${row.id}`,
          label: row.label,
          path: row.path,
          row,
          children: [],
        });
        return;
      }
      cursor = ensureChildNode(cursor, segment, runningPath);
    });
  });

  const sortNodes = (nodes: InputCatalogTreeNode[]): InputCatalogTreeNode[] => {
    return nodes
      .map((node) => ({
        ...node,
        children: sortNodes(node.children),
      }))
      .sort((left, right) => {
        const leftFolder = left.row ? 1 : 0;
        const rightFolder = right.row ? 1 : 0;
        if (leftFolder !== rightFolder) {
          return leftFolder - rightFolder;
        }
        return left.label.localeCompare(right.label);
      });
  };

  return sortNodes(root.children);
}

export function buildRigPathForInput(
  faceId: string,
  input: Pick<StandardRigInput, "path">,
): string {
  const normalizedPath = normalizeStandardRigInputPath(input.path);
  const trimmed = normalizedPath.startsWith("/")
    ? normalizedPath.slice(1)
    : normalizedPath;
  return trimmed.length > 0 ? `rig/${faceId}/${trimmed}` : `rig/${faceId}`;
}
