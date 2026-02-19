import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseCrossGroupChannelOverride,
  PoseDiagnostic,
  PoseDefinition,
  PoseIrBlendMode,
  PoseIrBlendStageDefinition,
  PoseIrStageSource,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  PoseRigIrFile,
  StandardInputId,
} from "./types";
import { PoseConfigService } from "./services/poseConfigService";
import { PoseGraphService } from "./services/poseGraphService";
import { PoseIrService } from "./services/poseIrService";
import { PoseSnapshotService } from "./services/poseSnapshotService";
import {
  createNeutralInputs,
  duplicatePoseDefinition,
  normalizePoseDefinitionIds,
  resolveDeterministicPoseId,
} from "./utils";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  orderPoseMembershipIds,
  resolvePoseMembership,
  sanitizePoseGroupId,
} from "./groupMembership";

function nextPoseGroupId(base: string, existing: Set<string>): string {
  const sanitized = sanitizePoseGroupId(base, base);
  if (!existing.has(sanitized)) {
    return sanitized;
  }
  let counter = 1;
  while (existing.has(`${sanitized}_${counter}`)) {
    counter += 1;
  }
  return `${sanitized}_${counter}`;
}

function sanitizeBlendStageId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "stage";
}

function nextBlendStageId(base: string, existing: Set<string>): string {
  const sanitized = sanitizeBlendStageId(base);
  if (!existing.has(sanitized)) {
    return sanitized;
  }
  let counter = 2;
  while (existing.has(`${sanitized}_${counter}`)) {
    counter += 1;
  }
  return `${sanitized}_${counter}`;
}

function cloneBlendStages(
  blendStages: PoseRigConfigFile["blendStages"] | undefined | null,
): PoseIrBlendStageDefinition[] {
  if (!blendStages || blendStages.length === 0) {
    return [];
  }
  return blendStages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    mode: stage.mode,
    sources: stage.sources.map((source) => ({
      kind: source.kind,
      id: source.id,
    })),
  }));
}

function cloneCrossGroupChannelOverrides(
  overrides: PoseRigConfigFile["crossGroupChannelOverrides"] | undefined | null,
): PoseRigConfigFile["crossGroupChannelOverrides"] | undefined {
  if (!overrides) {
    return undefined;
  }
  const entries = Object.entries(overrides).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) {
    return undefined;
  }
  const clonedEntries: Array<readonly [string, PoseCrossGroupChannelOverride]> =
    [];
  entries.forEach(([inputId, override]) => {
    if (!override) {
      return;
    }
    clonedEntries.push([
      inputId,
      {
        mode: override.mode,
        ...(override.priorityOrder &&
        Array.isArray(override.priorityOrder) &&
        override.priorityOrder.length > 0
          ? { priorityOrder: [...override.priorityOrder] }
          : {}),
        ...(override.tieBreak ? { tieBreak: override.tieBreak } : {}),
      },
    ]);
  });
  if (clonedEntries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(clonedEntries);
}

function clonePoseComposeModes(
  composeModes: PoseDefinition["composeModes"] | undefined,
): Record<string, "add" | "average"> | undefined {
  if (!composeModes) {
    return undefined;
  }
  const entries = Object.entries(composeModes).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) {
    return undefined;
  }
  const filtered: Array<[string, "add" | "average"]> = [];
  entries.forEach(([inputId, mode]) => {
    if (mode === "add" || mode === "average") {
      filtered.push([inputId, mode]);
    }
  });
  if (filtered.length === 0) {
    return undefined;
  }
  return Object.fromEntries(filtered);
}

function projectPoseComposeModesForValues(
  composeModes: PoseDefinition["composeModes"] | undefined,
  values: Record<string, number>,
): PoseDefinition["composeModes"] | undefined {
  if (!composeModes) {
    return undefined;
  }
  const next: Record<string, "add" | "average"> = {};
  Object.entries(composeModes).forEach(([inputId, mode]) => {
    if (values[inputId] === undefined) {
      return;
    }
    if (mode !== "add" && mode !== "average") {
      return;
    }
    next[inputId] = mode;
  });
  return clonePoseComposeModes(next);
}

interface BlendStageTopologyIssue {
  code:
    | "missing-stage-id"
    | "duplicate-stage-id"
    | "empty-stage-sources"
    | "invalid-stage-mode"
    | "invalid-source-kind"
    | "missing-source-id"
    | "duplicate-source"
    | "unknown-group-source"
    | "unknown-stage-source"
    | "forward-stage-source"
    | "self-stage-source";
  message: string;
}

function validateBlendStageTopology(
  blendStages: PoseIrBlendStageDefinition[],
  knownGroupIds: Iterable<string>,
): BlendStageTopologyIssue[] {
  if (blendStages.length === 0) {
    return [];
  }

  const issues: BlendStageTopologyIssue[] = [];
  const groupIdSet = new Set(knownGroupIds);
  const allStageIds = new Set<string>();
  const stageIdByIndex: string[] = [];
  const firstStageIndexById = new Map<string, number>();

  blendStages.forEach((stage, index) => {
    const stageId = typeof stage.id === "string" ? stage.id.trim() : "";
    stageIdByIndex[index] = stageId;
    if (!stageId) {
      return;
    }
    allStageIds.add(stageId);
    if (!firstStageIndexById.has(stageId)) {
      firstStageIndexById.set(stageId, index);
    }
  });

  const priorStageIds = new Set<string>();
  blendStages.forEach((stage, stageIndex) => {
    const stageId = stageIdByIndex[stageIndex] ?? "";
    if (!stageId) {
      issues.push({
        code: "missing-stage-id",
        message: `Stage #${stageIndex + 1} is missing an id.`,
      });
      return;
    }
    if (firstStageIndexById.get(stageId) !== stageIndex) {
      issues.push({
        code: "duplicate-stage-id",
        message: `Stage "${stageId}" is duplicated.`,
      });
      return;
    }
    if (stage.mode !== "add" && stage.mode !== "average") {
      issues.push({
        code: "invalid-stage-mode",
        message: `Stage "${stageId}" has invalid mode "${String(stage.mode)}".`,
      });
    }

    const stageSources = Array.isArray(stage.sources) ? stage.sources : [];
    const sourceKeys = new Set<string>();
    let validSources = 0;

    stageSources.forEach((source, sourceIndex) => {
      const sourceKind = source?.kind;
      const sourceId = typeof source?.id === "string" ? source.id.trim() : "";
      if (sourceKind !== "group" && sourceKind !== "stage") {
        issues.push({
          code: "invalid-source-kind",
          message: `Stage "${stageId}" source #${sourceIndex + 1} has invalid kind "${String(sourceKind)}".`,
        });
        return;
      }
      if (!sourceId) {
        issues.push({
          code: "missing-source-id",
          message: `Stage "${stageId}" source #${sourceIndex + 1} is missing an id.`,
        });
        return;
      }
      const sourceKey = `${sourceKind}:${sourceId}`;
      if (sourceKeys.has(sourceKey)) {
        issues.push({
          code: "duplicate-source",
          message: `Stage "${stageId}" source "${sourceKey}" is duplicated.`,
        });
        return;
      }
      sourceKeys.add(sourceKey);

      if (sourceKind === "group") {
        if (!groupIdSet.has(sourceId)) {
          issues.push({
            code: "unknown-group-source",
            message: `Stage "${stageId}" references unknown group "${sourceId}".`,
          });
          return;
        }
      } else {
        if (sourceId === stageId) {
          issues.push({
            code: "self-stage-source",
            message: `Stage "${stageId}" cannot source itself.`,
          });
          return;
        }
        if (!allStageIds.has(sourceId)) {
          issues.push({
            code: "unknown-stage-source",
            message: `Stage "${stageId}" references unknown stage "${sourceId}".`,
          });
          return;
        }
        if (!priorStageIds.has(sourceId)) {
          issues.push({
            code: "forward-stage-source",
            message: `Stage "${stageId}" references forward stage "${sourceId}".`,
          });
          return;
        }
      }

      validSources += 1;
    });

    if (validSources === 0) {
      issues.push({
        code: "empty-stage-sources",
        message: `Stage "${stageId}" has no valid sources.`,
      });
    }

    priorStageIds.add(stageId);
  });

  return issues;
}

function normalizePoseGroupsForState(source: unknown): Array<{
  id: string;
  path: string;
  name: string;
  blendMode?: "average" | "additive";
}> {
  const groups = Array.isArray(source) ? source : [];
  const normalized = groups
    .filter(
      (
        group,
      ): group is {
        id: string;
        path: string;
        name: string;
        blendMode?: "average" | "additive";
      } =>
        Boolean(
          group && typeof group === "object" && typeof group.name === "string",
        ),
    )
    .map((group) => {
      const path = normalizePoseGroupPath(group.path) ?? "default";
      return {
        ...group,
        id: sanitizePoseGroupId(group.id, path),
        path,
        blendMode:
          group.blendMode === "additive" || group.blendMode === "average"
            ? group.blendMode
            : undefined,
      };
    });
  return normalized;
}

function getConfiguredPoseGroups(
  state: Pick<PoseRigState, "poseConfigDraft" | "lastImportedConfig">,
) {
  const draftGroups = normalizePoseGroupsForState(
    state.poseConfigDraft?.poseGroups,
  );
  if (draftGroups.length > 0) {
    return draftGroups;
  }
  return normalizePoseGroupsForState(state.lastImportedConfig?.poseGroups);
}

function getConfiguredBlendStages(
  state: Pick<
    PoseRigState,
    "poseConfigDraft" | "poseIrDraft" | "lastImportedConfig"
  >,
): PoseIrBlendStageDefinition[] {
  return cloneBlendStages(
    state.poseConfigDraft?.blendStages ??
      state.poseIrDraft?.blendStages ??
      state.lastImportedConfig?.blendStages ??
      undefined,
  );
}

function ensurePoseGroupFromPath(
  prev: PoseRigState,
  targetGroup: string | null,
) {
  const normalizedTarget = normalizePoseGroupPath(targetGroup);
  if (!normalizedTarget) {
    return {
      groupPath: null,
      groupId: null,
      groups: getConfiguredPoseGroups(prev),
      groupsChanged: false,
    };
  }
  const normalizedGroups = getConfiguredPoseGroups(prev);
  const byPath = new Map(
    normalizedGroups.map((group) => [group.path, group.id]),
  );
  const existingId = byPath.get(normalizedTarget);
  if (existingId) {
    return {
      groupPath: normalizedTarget,
      groupId: existingId,
      groups: normalizedGroups,
      groupsChanged: false,
    };
  }

  const nextGroups = [...normalizedGroups];
  const nextId = nextPoseGroupId(
    normalizedTarget,
    new Set(nextGroups.map((group) => group.id)),
  );
  nextGroups.push({
    id: nextId,
    path: normalizedTarget,
    name: humanizePoseGroupName(normalizedTarget),
    blendMode: prev.blendMode,
  });
  return {
    groupPath: normalizedTarget,
    groupId: nextId,
    groups: nextGroups,
    groupsChanged: true,
  };
}

type ConfiguredPoseGroup = ReturnType<
  typeof normalizePoseGroupsForState
>[number];

function canonicalizePoseMembership(
  pose: PoseDefinition,
  groups: ConfiguredPoseGroup[],
): PoseDefinition {
  const membership = resolvePoseMembership(pose, groups);
  return withMembershipIds(pose, membership.groupIds, groups);
}

function withMembershipIds(
  pose: PoseDefinition,
  groupIds: string[],
  groups: ConfiguredPoseGroup[],
): PoseDefinition {
  const orderedGroupIds = orderPoseMembershipIds(groupIds, groups);
  const membership = resolvePoseMembership(
    {
      ...pose,
      groupIds: orderedGroupIds,
      groupId: null,
      group: null,
    },
    groups,
  );
  return {
    ...pose,
    groupIds: membership.groupIds,
    groupId: membership.primaryGroupId,
    group: membership.primaryGroupPath,
  };
}

interface PoseStateProjectionOptions {
  poses?: PoseDefinition[];
  neutralInputs?: Record<StandardInputId, number>;
  rigName?: string;
  faceId?: string | null;
  rigKind?: "generic" | "face-specific";
  neutralMode?: "face-default" | "explicit";
  blendMode?: "average" | "additive";
  crossGroupBlendMode?: "average" | "additive";
  crossGroupChannelOverrides?:
    | PoseRigConfigFile["crossGroupChannelOverrides"]
    | null;
  blendStages?: PoseRigConfigFile["blendStages"] | null;
  standardInputSchema?: { id: string; version: string } | null;
  poseGroups?: ConfiguredPoseGroup[];
}

export interface PoseRigState {
  // Core Data
  faceId: string | null;
  rigName: string;
  rigKind: "generic" | "face-specific";
  neutralInputs: Record<StandardInputId, number>;
  neutralMode: "face-default" | "explicit";
  currentValues: Record<StandardInputId, number>;
  standardInputs: StandardRigInput[];
  poses: PoseDefinition[];
  hiddenInputIds: string[];

  // UI State
  selectedPoseId: string | null;
  activePoseId: string | null; // For "preview" mode
  blendMode: "average" | "additive";
  crossGroupBlendMode: "average" | "additive";

  // Graph/Config State
  poseGraphSpec: GraphSpec | null;
  poseGraphSummary: PoseRigGraphSummary | null;
  poseIrDraft: PoseRigIrFile | null;
  poseConfigDraft: PoseRigConfigFile | null; // The config being edited
  standardInputSchema: { id: string; version: string } | null;
  lastImportedConfig: PoseRigConfigFile | null; // For diffing/dirty checks

  // Metadata
  filenames: {
    config: string;
    graph: string;
    ir: string;
  };
  warnings: string[];
  poseDiagnostics: PoseDiagnostic[];
  isReady: boolean;

  // Actions
  setRigName: (name: string) => void;
  setRigKind: (kind: "generic" | "face-specific") => void;
  setNeutralMode: (mode: "face-default" | "explicit") => void;
  setNeutralInputs: (inputs: Record<StandardInputId, number>) => void;
  setStandardInputs: (inputs: StandardRigInput[]) => void;
  updateCurrentValues: (values: Record<StandardInputId, number>) => void;
  selectPose: (poseId: string | null) => void;
  createPose: (name?: string, group?: string | null) => void;
  addPose: (pose: PoseDefinition) => void;
  duplicatePose: (poseId: string) => void;
  deletePose: (poseId: string) => void;
  updatePose: (
    poseId: string,
    updater: (pose: PoseDefinition) => PoseDefinition,
  ) => void;
  capturePose: (poseId: string) => void;
  applyPose: (poseId: string) => void;
  captureNeutral: () => void;
  applyNeutral: () => void;
  importConfig: (config: PoseRigConfigFile) => void;
  importIr: (ir: PoseRigIrFile) => void;
  reset: () => void;
  setFilenames: (filenames: {
    config?: string;
    graph?: string;
    ir?: string;
  }) => void;
  setBlendMode: (mode: "average" | "additive") => void;
  setCrossGroupBlendMode: (mode: "average" | "additive") => void;
  createBlendStage: (name?: string) => void;
  renameBlendStage: (stageId: string, nextName: string) => void;
  setBlendStageMode: (stageId: string, mode: PoseIrBlendMode) => void;
  deleteBlendStage: (stageId: string) => void;
  reorderBlendStage: (fromIndex: number, toIndex: number) => void;
  setBlendStageSources: (stageId: string, sources: PoseIrStageSource[]) => void;
  updatePoseName: (poseId: string, name: string) => void;
  createPoseGroup: (groupPath: string) => void;
  renamePoseGroup: (groupId: string, nextPath: string) => void;
  deletePoseGroup: (groupId: string) => void;
  setPoseGroupBlendMode: (
    groupId: string,
    mode: "average" | "additive",
  ) => void;
  addPoseToGroup: (poseId: string, group: string) => void;
  removePoseFromGroup: (poseId: string, group: string) => void;
  updatePoseGroup: (poseId: string, group: string | null) => void;
  updatePoseGroupBatch: (
    poseIds: Iterable<string>,
    group: string | null,
  ) => void;
  clearPose: (poseId: string) => void;
  addPoseInput: (poseId: string, inputId: string) => void;
  removePoseInput: (poseId: string, inputId: string) => void;
  setPoseImportFeedback: (params: {
    warnings: string[];
    diagnostics: PoseDiagnostic[];
  }) => void;
}

type PoseRigStoreUpdate =
  | Partial<PoseRigState>
  | ((state: PoseRigState) => Partial<PoseRigState> | void);

export interface PoseRigStore {
  getState: () => PoseRigState;
  setState: (updater: PoseRigStoreUpdate) => void;
  subscribe: (listener: () => void) => () => void;
}

export const DEFAULT_RIG_NAME = "pose_rig";
export const NEUTRAL_POSE_ID = "__pose_rig_neutral__";

const defaultState: Omit<
  PoseRigState,
  | "setRigName"
  | "setRigKind"
  | "setNeutralMode"
  | "setNeutralInputs"
  | "setStandardInputs"
  | "updateCurrentValues"
  | "selectPose"
  | "createPose"
  | "deletePose"
  | "updatePose"
  | "capturePose"
  | "applyPose"
  | "captureNeutral"
  | "applyNeutral"
  | "importConfig"
  | "importIr"
  | "reset"
  | "addPose"
  | "duplicatePose"
  | "setFilenames"
  | "setBlendMode"
  | "setCrossGroupBlendMode"
  | "createBlendStage"
  | "renameBlendStage"
  | "setBlendStageMode"
  | "deleteBlendStage"
  | "reorderBlendStage"
  | "setBlendStageSources"
  | "updatePoseName"
  | "createPoseGroup"
  | "renamePoseGroup"
  | "deletePoseGroup"
  | "setPoseGroupBlendMode"
  | "addPoseToGroup"
  | "removePoseFromGroup"
  | "updatePoseGroup"
  | "updatePoseGroupBatch"
  | "clearPose"
  | "addPoseInput"
  | "removePoseInput"
  | "setPoseImportFeedback"
> = {
  faceId: null,
  rigName: DEFAULT_RIG_NAME,
  rigKind: "face-specific",
  neutralInputs: {},
  neutralMode: "face-default",
  currentValues: {},
  standardInputs: [],
  poses: [],
  hiddenInputIds: [],
  selectedPoseId: NEUTRAL_POSE_ID,
  activePoseId: null,
  blendMode: "average",
  crossGroupBlendMode: "additive",
  poseGraphSpec: null,
  poseGraphSummary: null,
  poseIrDraft: null,
  poseConfigDraft: null,
  standardInputSchema: null,
  lastImportedConfig: null,
  filenames: {
    config: "",
    graph: "",
    ir: "",
  },
  warnings: [],
  poseDiagnostics: [],
  isReady: false,
};

export function createPoseRigStore(
  initialState?: Partial<PoseRigState>,
): PoseRigStore {
  let state: PoseRigState;
  const listeners = new Set<() => void>();

  const projectPoseConfig = (
    snapshot: PoseRigState,
    overrides?: PoseStateProjectionOptions,
  ): PoseRigConfigFile => {
    const standardInputSchema =
      overrides?.standardInputSchema === undefined
        ? (snapshot.poseConfigDraft?.standardInputSchema ??
          snapshot.lastImportedConfig?.standardInputSchema ??
          snapshot.standardInputSchema ??
          undefined)
        : (overrides.standardInputSchema ?? undefined);
    const poseGroups =
      overrides?.poseGroups ?? getConfiguredPoseGroups(snapshot);
    const blendStages =
      overrides?.blendStages === undefined
        ? (snapshot.poseIrDraft?.blendStages ??
          snapshot.poseConfigDraft?.blendStages ??
          snapshot.lastImportedConfig?.blendStages ??
          undefined)
        : (overrides.blendStages ?? undefined);
    const crossGroupChannelOverrides =
      overrides?.crossGroupChannelOverrides === undefined
        ? cloneCrossGroupChannelOverrides(
            snapshot.poseConfigDraft?.crossGroupChannelOverrides ??
              snapshot.lastImportedConfig?.crossGroupChannelOverrides ??
              undefined,
          )
        : cloneCrossGroupChannelOverrides(
            overrides.crossGroupChannelOverrides ?? undefined,
          );
    return PoseConfigService.create(
      overrides?.poses ?? snapshot.poses,
      overrides?.neutralInputs ?? snapshot.neutralInputs,
      overrides?.rigName ?? snapshot.rigName,
      overrides?.faceId ?? snapshot.faceId,
      overrides?.rigKind ?? snapshot.rigKind,
      standardInputSchema,
      {
        poseGroups,
        defaultGroupBlendMode: overrides?.blendMode ?? snapshot.blendMode,
        crossGroupBlendMode:
          overrides?.crossGroupBlendMode ?? snapshot.crossGroupBlendMode,
        crossGroupChannelOverrides,
        blendStages,
        neutralMode: overrides?.neutralMode ?? snapshot.neutralMode,
      },
    );
  };

  const compilePoseIrPatch = (
    snapshot: PoseRigState,
    config: PoseRigConfigFile,
  ): Pick<PoseRigState, "poseIrDraft" | "warnings" | "poseDiagnostics"> => {
    const { ir, warnings, diagnostics } = PoseIrService.fromConfig(
      config,
      snapshot.standardInputs,
      snapshot.faceId,
      {
        defaultGroupBlendMode: config.poseGroups?.[0]?.blendMode,
        crossGroupBlendMode: config.crossGroupBlendMode,
      },
    );
    return {
      poseIrDraft: ir,
      warnings,
      poseDiagnostics: diagnostics,
    };
  };

  const buildProjectedPoseIrPatch = (
    snapshot: PoseRigState,
    overrides?: PoseStateProjectionOptions,
  ): Partial<PoseRigState> => {
    const config = projectPoseConfig(snapshot, overrides);
    const projectedPoses = overrides?.poses ?? snapshot.poses;
    return {
      ...compilePoseIrPatch(snapshot, config),
      poses: projectedPoses,
      ...(overrides?.neutralInputs
        ? { neutralInputs: overrides.neutralInputs }
        : {}),
      ...(overrides?.rigName !== undefined
        ? { rigName: overrides.rigName }
        : {}),
      ...(overrides?.faceId !== undefined ? { faceId: overrides.faceId } : {}),
      ...(overrides?.rigKind !== undefined
        ? { rigKind: overrides.rigKind }
        : {}),
      ...(overrides?.neutralMode !== undefined
        ? { neutralMode: overrides.neutralMode }
        : {}),
      ...(overrides?.blendMode !== undefined
        ? { blendMode: overrides.blendMode }
        : {}),
      ...(overrides?.crossGroupBlendMode
        ? { crossGroupBlendMode: overrides.crossGroupBlendMode }
        : {}),
      ...(overrides?.standardInputSchema !== undefined
        ? { standardInputSchema: overrides.standardInputSchema }
        : {}),
    };
  };

  const buildBlendStagesProjectionPatch = (
    snapshot: PoseRigState,
    nextBlendStages: PoseIrBlendStageDefinition[],
  ): Partial<PoseRigState> | undefined => {
    const configuredGroups = getConfiguredPoseGroups(snapshot);
    const topologyIssues = validateBlendStageTopology(
      nextBlendStages,
      configuredGroups.map((group) => group.id),
    );
    if (topologyIssues.length > 0) {
      return;
    }
    return buildProjectedPoseIrPatch(snapshot, {
      poseGroups: configuredGroups,
      blendStages:
        nextBlendStages.length > 0 ? cloneBlendStages(nextBlendStages) : null,
    });
  };

  const setState = (updater: PoseRigStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const nextState = { ...state, ...patch } as PoseRigState;

    // Auto-update pose IR/config/graph drafts when authoring fields change.
    const shouldRebuildPoseDrafts = Boolean(
      patch.poseIrDraft ||
        patch.poses ||
        patch.neutralInputs ||
        patch.neutralMode ||
        patch.rigName ||
        patch.faceId ||
        patch.rigKind ||
        patch.standardInputs ||
        patch.standardInputSchema ||
        patch.blendMode ||
        patch.crossGroupBlendMode ||
        patch.poseConfigDraft,
    );

    if (shouldRebuildPoseDrafts) {
      let irResult:
        | ReturnType<typeof PoseIrService.fromConfig>
        | ReturnType<typeof PoseIrService.normalize>;

      if (patch.poseIrDraft) {
        irResult = PoseIrService.normalize(
          nextState.poseIrDraft,
          nextState.standardInputs,
          nextState.faceId,
        );
      } else {
        const projectedConfig = projectPoseConfig(nextState);
        irResult = PoseIrService.fromConfig(
          projectedConfig,
          nextState.standardInputs,
          nextState.faceId,
          {
            defaultGroupBlendMode: projectedConfig.poseGroups?.[0]?.blendMode,
            crossGroupBlendMode: projectedConfig.crossGroupBlendMode,
          },
        );
      }

      const projectedConfig = PoseIrService.toConfig(irResult.ir);
      const projectedPoses = normalizePoseDefinitionIds(projectedConfig.poses, {
        reservedIds: [NEUTRAL_POSE_ID],
      });
      const projectedNeutralInputs = {
        ...createNeutralInputs(nextState.standardInputs),
        ...projectedConfig.neutralInputs,
      };

      nextState.poseIrDraft = irResult.ir;
      nextState.poseConfigDraft = projectedConfig;
      if (patch.poses === undefined) {
        nextState.poses = projectedPoses;
      } else {
        nextState.poses = normalizePoseDefinitionIds(nextState.poses, {
          reservedIds: [NEUTRAL_POSE_ID],
        });
      }
      if (patch.neutralInputs === undefined) {
        nextState.neutralInputs = projectedNeutralInputs;
      }
      if (patch.rigName === undefined) {
        nextState.rigName = projectedConfig.title || nextState.rigName;
      }
      if (patch.rigKind === undefined) {
        nextState.rigKind = projectedConfig.rigKind ?? nextState.rigKind;
      }
      if (patch.neutralMode === undefined) {
        nextState.neutralMode = projectedConfig.neutralMode ?? "explicit";
      }
      if (patch.blendMode === undefined) {
        nextState.blendMode =
          projectedConfig.poseGroups?.[0]?.blendMode ?? nextState.blendMode;
      }
      if (patch.crossGroupBlendMode === undefined) {
        nextState.crossGroupBlendMode =
          projectedConfig.crossGroupBlendMode ?? nextState.crossGroupBlendMode;
      }
      if (patch.standardInputSchema === undefined) {
        nextState.standardInputSchema =
          projectedConfig.standardInputSchema ?? nextState.standardInputSchema;
      }

      if (patch.warnings === undefined) {
        nextState.warnings = irResult.warnings;
      }
      if (patch.poseDiagnostics === undefined) {
        nextState.poseDiagnostics = irResult.diagnostics;
      }

      try {
        const { spec, summary } = PoseGraphService.buildSpecFromIr(
          irResult.ir,
          nextState.standardInputs,
          {
            rigKind: nextState.rigKind,
          },
        );
        nextState.poseGraphSpec = spec;
        nextState.poseGraphSummary = summary;
      } catch (e) {
        console.error("Failed to build pose graph spec", e);
      }
    }

    if (nextState === state) {
      return;
    }
    state = nextState;
    listeners.forEach((listener) => listener());
  };

  const actions: Pick<
    PoseRigState,
    | "setRigName"
    | "setRigKind"
    | "setNeutralMode"
    | "setNeutralInputs"
    | "setStandardInputs"
    | "updateCurrentValues"
    | "selectPose"
    | "createPose"
    | "deletePose"
    | "updatePose"
    | "capturePose"
    | "applyPose"
    | "captureNeutral"
    | "applyNeutral"
    | "importConfig"
    | "importIr"
    | "reset"
    | "addPose"
    | "duplicatePose"
    | "setFilenames"
    | "setBlendMode"
    | "setCrossGroupBlendMode"
    | "createBlendStage"
    | "renameBlendStage"
    | "setBlendStageMode"
    | "deleteBlendStage"
    | "reorderBlendStage"
    | "setBlendStageSources"
    | "updatePoseName"
    | "createPoseGroup"
    | "renamePoseGroup"
    | "deletePoseGroup"
    | "setPoseGroupBlendMode"
    | "addPoseToGroup"
    | "removePoseFromGroup"
    | "updatePoseGroup"
    | "updatePoseGroupBatch"
    | "clearPose"
    | "addPoseInput"
    | "removePoseInput"
    | "setPoseImportFeedback"
  > = {
    setRigName: (name) => {
      setState((prev) => ({
        rigName: name,
        ...buildProjectedPoseIrPatch(prev, { rigName: name }),
      }));
    },
    setRigKind: (kind) => {
      setState((prev) => ({
        rigKind: kind,
        ...buildProjectedPoseIrPatch(prev, { rigKind: kind }),
      }));
    },
    setNeutralMode: (mode) => {
      setState((prev) => ({
        neutralMode: mode,
        ...buildProjectedPoseIrPatch(prev, { neutralMode: mode }),
      }));
    },
    setBlendMode: (mode) => {
      setState((prev) => ({
        blendMode: mode,
        ...buildProjectedPoseIrPatch(prev, { blendMode: mode }),
      }));
    },
    setCrossGroupBlendMode: (mode) => {
      setState((prev) => ({
        crossGroupBlendMode: mode,
        ...buildProjectedPoseIrPatch(prev, {
          crossGroupBlendMode: mode,
        }),
      }));
    },
    createBlendStage: (name) => {
      setState((prev) => {
        const existingStages = getConfiguredBlendStages(prev);
        const configuredGroups = getConfiguredPoseGroups(prev);
        const defaultSource: PoseIrStageSource | null = configuredGroups[0]?.id
          ? {
              kind: "group",
              id: configuredGroups[0].id,
            }
          : existingStages.length > 0
            ? {
                kind: "stage",
                id: existingStages[existingStages.length - 1]!.id,
              }
            : null;
        if (!defaultSource) {
          return;
        }

        const trimmedName =
          typeof name === "string" && name.trim().length > 0
            ? name.trim()
            : `Stage ${existingStages.length + 1}`;
        const nextStageId = nextBlendStageId(
          trimmedName,
          new Set(existingStages.map((stage) => stage.id)),
        );
        const nextStage: PoseIrBlendStageDefinition = {
          id: nextStageId,
          name: trimmedName,
          mode: prev.crossGroupBlendMode === "additive" ? "add" : "average",
          sources: [defaultSource],
        };

        return buildBlendStagesProjectionPatch(prev, [
          ...existingStages,
          nextStage,
        ]);
      });
    },
    renameBlendStage: (stageId, nextName) => {
      setState((prev) => {
        const trimmedStageId = stageId.trim();
        if (!trimmedStageId) {
          return;
        }
        const existingStages = getConfiguredBlendStages(prev);
        const targetIndex = existingStages.findIndex(
          (stage) => stage.id === trimmedStageId,
        );
        if (targetIndex < 0) {
          return;
        }
        const trimmedName = nextName.trim();
        const nextStages = existingStages.map((stage, index) =>
          index === targetIndex
            ? {
                ...stage,
                name: trimmedName || undefined,
              }
            : stage,
        );
        return buildBlendStagesProjectionPatch(prev, nextStages);
      });
    },
    setBlendStageMode: (stageId, mode) => {
      setState((prev) => {
        if (mode !== "add" && mode !== "average") {
          return;
        }
        const trimmedStageId = stageId.trim();
        if (!trimmedStageId) {
          return;
        }
        const existingStages = getConfiguredBlendStages(prev);
        const targetIndex = existingStages.findIndex(
          (stage) => stage.id === trimmedStageId,
        );
        if (targetIndex < 0) {
          return;
        }
        if (existingStages[targetIndex]?.mode === mode) {
          return;
        }
        const nextStages = existingStages.map((stage, index) =>
          index === targetIndex ? { ...stage, mode } : stage,
        );
        return buildBlendStagesProjectionPatch(prev, nextStages);
      });
    },
    deleteBlendStage: (stageId) => {
      setState((prev) => {
        const trimmedStageId = stageId.trim();
        if (!trimmedStageId) {
          return;
        }
        const existingStages = getConfiguredBlendStages(prev);
        if (!existingStages.some((stage) => stage.id === trimmedStageId)) {
          return;
        }
        const nextStages = existingStages.filter(
          (stage) => stage.id !== trimmedStageId,
        );
        return buildBlendStagesProjectionPatch(prev, nextStages);
      });
    },
    reorderBlendStage: (fromIndex, toIndex) => {
      setState((prev) => {
        if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)) {
          return;
        }
        const existingStages = getConfiguredBlendStages(prev);
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= existingStages.length ||
          toIndex >= existingStages.length ||
          fromIndex === toIndex
        ) {
          return;
        }
        const nextStages = [...existingStages];
        const [moved] = nextStages.splice(fromIndex, 1);
        if (!moved) {
          return;
        }
        nextStages.splice(toIndex, 0, moved);
        return buildBlendStagesProjectionPatch(prev, nextStages);
      });
    },
    setBlendStageSources: (stageId, sources) => {
      setState((prev) => {
        const trimmedStageId = stageId.trim();
        if (!trimmedStageId) {
          return;
        }
        const existingStages = getConfiguredBlendStages(prev);
        const targetIndex = existingStages.findIndex(
          (stage) => stage.id === trimmedStageId,
        );
        if (targetIndex < 0) {
          return;
        }
        const normalizedSources: PoseIrStageSource[] = [];
        (Array.isArray(sources) ? sources : []).forEach((source) => {
          if (!source || typeof source !== "object") {
            return;
          }
          if (source.kind !== "group" && source.kind !== "stage") {
            return;
          }
          const sourceId =
            typeof source.id === "string" ? source.id.trim() : "";
          if (!sourceId) {
            return;
          }
          normalizedSources.push({
            kind: source.kind,
            id: sourceId,
          });
        });
        const nextStages = existingStages.map((stage, index) =>
          index === targetIndex
            ? { ...stage, sources: normalizedSources }
            : stage,
        );
        return buildBlendStagesProjectionPatch(prev, nextStages);
      });
    },
    setFilenames: (filenames) => {
      setState((prev) => ({ filenames: { ...prev.filenames, ...filenames } }));
    },
    setNeutralInputs: (inputs) => {
      setState((prev) => ({
        neutralMode: "explicit",
        ...buildProjectedPoseIrPatch(prev, {
          neutralInputs: inputs,
          neutralMode: "explicit",
        }),
      }));
    },
    setStandardInputs: (inputs) => {
      setState({ standardInputs: inputs });
    },
    updateCurrentValues: (values) => {
      setState((prev) => ({
        currentValues: { ...prev.currentValues, ...values },
      }));
    },
    selectPose: (poseId) => {
      setState({ selectedPoseId: poseId });
    },
    createPose: (name, group) => {
      setState((prev) => {
        const configuredGroups = getConfiguredPoseGroups(prev);
        const newPose = PoseSnapshotService.createPoseDefinition(
          name || `Pose ${prev.poses.length + 1}`,
          group,
          {
            existingIds: prev.poses.map((pose) => pose.id),
            reservedIds: [NEUTRAL_POSE_ID],
          },
        );
        const normalizedPose = canonicalizePoseMembership(
          newPose,
          configuredGroups,
        );
        const nextPoses = [...prev.poses, normalizedPose];
        return {
          ...buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configuredGroups,
          }),
          selectedPoseId: normalizedPose.id,
        };
      });
    },
    addPose: (pose) => {
      setState((prev) => {
        const configuredGroups = getConfiguredPoseGroups(prev);
        const poseId = resolveDeterministicPoseId({
          existingIds: prev.poses.map((entry) => entry.id),
          preferredId: pose.id,
          name: pose.name,
          reservedIds: [NEUTRAL_POSE_ID],
        });
        const withId =
          pose.id === poseId
            ? pose
            : {
                ...pose,
                id: poseId,
              };
        const nextPose = canonicalizePoseMembership(withId, configuredGroups);
        const nextPoses = [...prev.poses, nextPose];
        return {
          ...buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configuredGroups,
          }),
          selectedPoseId: poseId,
        };
      });
    },
    duplicatePose: (poseId) => {
      setState((prev) => {
        const configuredGroups = getConfiguredPoseGroups(prev);
        const original = prev.poses.find((p) => p.id === poseId);
        if (!original) return;
        const duplicate = canonicalizePoseMembership(
          duplicatePoseDefinition(original, {
            existingIds: prev.poses.map((pose) => pose.id),
            reservedIds: [NEUTRAL_POSE_ID],
          }),
          configuredGroups,
        );
        const nextPoses = [...prev.poses, duplicate];
        return {
          ...buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configuredGroups,
          }),
          selectedPoseId: duplicate.id,
        };
      });
    },
    deletePose: (poseId) => {
      setState((prev) => {
        const nextPoses = prev.poses.filter((p) => p.id !== poseId);
        let nextSelected = prev.selectedPoseId;
        if (nextSelected === poseId) {
          nextSelected = nextPoses[0]?.id ?? NEUTRAL_POSE_ID;
        }
        return {
          ...buildProjectedPoseIrPatch(prev, { poses: nextPoses }),
          selectedPoseId: nextSelected,
        };
      });
    },
    updatePoseName: (poseId, name) => {
      setState((prev) => {
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? { ...p, name } : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    createPoseGroup: (groupPath) => {
      setState((prev) => {
        const { groupsChanged, groups } = ensurePoseGroupFromPath(
          prev,
          groupPath,
        );
        if (!groupsChanged) {
          return;
        }
        return buildProjectedPoseIrPatch(prev, {
          poseGroups: groups,
        });
      });
    },
    renamePoseGroup: (groupId, nextPath) => {
      const normalized = normalizePoseGroupPath(nextPath);
      if (!normalized) {
        return;
      }
      setState((prev) => {
        const configured = getConfiguredPoseGroups(prev);
        const targetIndex = configured.findIndex(
          (group) => group.id === groupId,
        );
        if (targetIndex < 0) {
          return;
        }
        const target = configured[targetIndex];
        if (target.path === normalized) {
          return;
        }
        if (
          configured.some(
            (group) => group.id !== groupId && group.path === normalized,
          )
        ) {
          return;
        }
        const nextGroups = configured.map((group, index) =>
          index === targetIndex
            ? {
                ...group,
                path: normalized,
                name: humanizePoseGroupName(normalized),
              }
            : group,
        );
        const nextPoses = prev.poses.map((pose) => {
          const membership = resolvePoseMembership(pose, configured);
          return withMembershipIds(pose, membership.groupIds, nextGroups);
        });
        return {
          ...buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: nextGroups,
          }),
        };
      });
    },
    deletePoseGroup: (groupId) => {
      setState((prev) => {
        const configured = getConfiguredPoseGroups(prev);
        const targetIndex = configured.findIndex(
          (group) => group.id === groupId,
        );
        if (targetIndex < 0) {
          return;
        }
        const nextGroups = configured.filter((group) => group.id !== groupId);
        const nextPoses = prev.poses.map((pose) => {
          const membership = resolvePoseMembership(pose, configured);
          const nextIds = membership.groupIds.filter((id) => id !== groupId);
          return withMembershipIds(pose, nextIds, nextGroups);
        });
        return {
          ...buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: nextGroups,
          }),
        };
      });
    },
    setPoseGroupBlendMode: (groupId, mode) => {
      setState((prev) => {
        const configured = getConfiguredPoseGroups(prev);
        const targetIndex = configured.findIndex(
          (group) => group.id === groupId,
        );
        if (targetIndex < 0) {
          return;
        }
        const target = configured[targetIndex];
        if (!target || target.blendMode === mode) {
          return;
        }
        const nextGroups = configured.map((group, index) =>
          index === targetIndex ? { ...group, blendMode: mode } : group,
        );
        return buildProjectedPoseIrPatch(prev, {
          poseGroups: nextGroups,
        });
      });
    },
    addPoseToGroup: (poseId, group) => {
      const normalizedGroup = normalizePoseGroupPath(group);
      if (!normalizedGroup) {
        return;
      }
      setState((prev) => {
        if (!prev.poses.some((pose) => pose.id === poseId)) {
          return;
        }
        const { groupsChanged, groups, groupId } = ensurePoseGroupFromPath(
          prev,
          normalizedGroup,
        );
        if (!groupId) {
          return;
        }
        let poseChanged = false;
        const nextPoses = prev.poses.map((pose) => {
          if (pose.id !== poseId) {
            return pose;
          }
          const membership = resolvePoseMembership(pose, groups);
          if (membership.groupIds.includes(groupId)) {
            return pose;
          }
          poseChanged = true;
          return withMembershipIds(
            pose,
            [...membership.groupIds, groupId],
            groups,
          );
        });

        if (!poseChanged && !groupsChanged) {
          return;
        }
        return buildProjectedPoseIrPatch(prev, {
          poses: nextPoses,
          poseGroups: groups,
        });
      });
    },
    removePoseFromGroup: (poseId, group) => {
      const normalizedGroup = normalizePoseGroupPath(group);
      const normalizedGroupId = sanitizePoseGroupId(group, group);
      setState((prev) => {
        const configured = getConfiguredPoseGroups(prev);
        const targetGroupId =
          configured.find((entry) => entry.path === normalizedGroup)?.id ??
          configured.find((entry) => entry.id === group)?.id ??
          (normalizedGroup
            ? sanitizePoseGroupId(normalizedGroup, normalizedGroup)
            : null) ??
          normalizedGroupId;
        if (!targetGroupId) {
          return;
        }
        let poseChanged = false;
        const nextPoses = prev.poses.map((pose) => {
          if (pose.id !== poseId) {
            return pose;
          }
          const membership = resolvePoseMembership(pose, configured);
          if (!membership.groupIds.includes(targetGroupId)) {
            return pose;
          }
          poseChanged = true;
          return withMembershipIds(
            pose,
            membership.groupIds.filter((id) => id !== targetGroupId),
            configured,
          );
        });
        if (!poseChanged) {
          return;
        }
        return buildProjectedPoseIrPatch(prev, {
          poses: nextPoses,
        });
      });
    },
    updatePoseGroup: (poseId, group) => {
      const nextGroup = group ?? null;
      if (!nextGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          const nextPoses = prev.poses.map((p) =>
            p.id === poseId ? withMembershipIds(p, [], configured) : p,
          );
          return buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configured,
          });
        });
        return;
      }
      const normalizedGroup = normalizePoseGroupPath(nextGroup);
      if (!normalizedGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          const nextPoses = prev.poses.map((p) =>
            p.id === poseId ? withMembershipIds(p, [], configured) : p,
          );
          return buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configured,
          });
        });
        return;
      }
      setState((prev) => {
        const { groups, groupId } = ensurePoseGroupFromPath(
          prev,
          normalizedGroup,
        );
        if (!groupId) {
          return;
        }
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? withMembershipIds(p, [groupId], groups) : p,
        );
        return buildProjectedPoseIrPatch(prev, {
          poses: nextPoses,
          poseGroups: groups,
        });
      });
    },
    updatePoseGroupBatch: (poseIds, group) => {
      const ids = new Set(poseIds);
      const nextGroup = group ?? null;
      if (!nextGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          const nextPoses = prev.poses.map((p) =>
            ids.has(p.id) ? withMembershipIds(p, [], configured) : p,
          );
          return buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configured,
          });
        });
        return;
      }
      const normalizedGroup = normalizePoseGroupPath(nextGroup);
      if (!normalizedGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          const nextPoses = prev.poses.map((p) =>
            ids.has(p.id) ? withMembershipIds(p, [], configured) : p,
          );
          return buildProjectedPoseIrPatch(prev, {
            poses: nextPoses,
            poseGroups: configured,
          });
        });
        return;
      }
      setState((prev) => {
        const { groupsChanged, groups, groupId } = ensurePoseGroupFromPath(
          prev,
          normalizedGroup,
        );
        const nextPoses = prev.poses.map((p) =>
          ids.has(p.id)
            ? withMembershipIds(p, groupId ? [groupId] : [], groups)
            : p,
        );
        if (!groupId && !groupsChanged) {
          return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
        }
        return buildProjectedPoseIrPatch(prev, {
          poses: nextPoses,
          poseGroups: groups,
        });
      });
    },
    clearPose: (poseId) => {
      setState((prev) => {
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? { ...p, values: {}, composeModes: undefined } : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    addPoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        if (!prev.standardInputs.some((input) => input.id === inputId)) {
          return;
        }
        const val =
          prev.currentValues[inputId] ?? prev.neutralInputs[inputId] ?? 0;
        const nextPoses = prev.poses.map((p) => {
          if (p.id !== poseId) {
            return p;
          }
          const nextComposeModes: Record<string, "add" | "average"> = {
            ...(clonePoseComposeModes(p.composeModes) ?? {}),
          };
          nextComposeModes[inputId] = "add";
          return {
            ...p,
            values: { ...p.values, [inputId]: val },
            composeModes: nextComposeModes,
          };
        });
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    removePoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const nextValues = { ...pose.values };
        delete nextValues[inputId];
        const nextComposeModes = {
          ...(clonePoseComposeModes(pose.composeModes) ?? {}),
        };
        delete nextComposeModes[inputId];
        const projectedComposeModes = clonePoseComposeModes(nextComposeModes);
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId
            ? {
                ...p,
                values: nextValues,
                ...(projectedComposeModes
                  ? { composeModes: projectedComposeModes }
                  : { composeModes: undefined }),
              }
            : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    setPoseImportFeedback: ({ warnings, diagnostics }) => {
      setState({
        warnings,
        poseDiagnostics: diagnostics,
      });
    },
    updatePose: (poseId, updater) => {
      setState((prev) => {
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? updater(p) : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    capturePose: (poseId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const captured = PoseSnapshotService.capture(
          prev.currentValues,
          prev.neutralInputs,
          { name: pose.name, group: pose.group },
        );
        // Preserve ID and other metadata
        const updated = {
          ...pose,
          values: captured.values,
          composeModes: projectPoseComposeModesForValues(
            pose.composeModes,
            captured.values,
          ),
          updatedAt: new Date().toISOString(),
        };
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? updated : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    applyPose: (poseId) => {
      const s = state;
      const pose = s.poses.find((p) => p.id === poseId);
      if (!pose) return;
      const newValues = PoseSnapshotService.apply(pose, s.neutralInputs);
      setState({ currentValues: newValues });
    },
    captureNeutral: () => {
      setState((prev) => {
        return {
          neutralMode: "explicit",
          ...buildProjectedPoseIrPatch(prev, {
            neutralInputs: { ...prev.currentValues },
            neutralMode: "explicit",
          }),
        };
      });
    },
    applyNeutral: () => {
      setState((prev) => ({
        currentValues: { ...prev.neutralInputs },
        selectedPoseId: NEUTRAL_POSE_ID,
      }));
    },
    importConfig: (config) => {
      const { config: normalized, warnings } = PoseConfigService.normalize(
        config,
        state.standardInputs,
        state.faceId,
      );
      const importedPoses = normalizePoseDefinitionIds([...normalized.poses], {
        reservedIds: [NEUTRAL_POSE_ID],
      });
      const normalizedForImport: PoseRigConfigFile = {
        ...normalized,
        poses: importedPoses,
      };
      const {
        ir,
        warnings: irWarnings,
        diagnostics,
      } = PoseIrService.fromConfig(
        normalizedForImport,
        state.standardInputs,
        state.faceId,
        {
          defaultGroupBlendMode:
            normalizedForImport.poseGroups?.[0]?.blendMode ?? state.blendMode,
          crossGroupBlendMode:
            normalizedForImport.crossGroupBlendMode ??
            state.crossGroupBlendMode,
        },
      );
      const projectedConfig = PoseIrService.toConfig(ir);
      const newNeutralInputs = {
        ...createNeutralInputs(state.standardInputs),
        ...projectedConfig.neutralInputs,
      };
      const mergedWarnings = Array.from(new Set([...warnings, ...irWarnings]));
      const mergedDiagnostics = [
        ...diagnostics,
        ...warnings.map((message, index) => ({
          id: `pose-config:legacy-warning:${index + 1}`,
          severity: "warning" as const,
          code: "legacy-config-warning",
          source: "pose-config" as const,
          message,
        })),
      ];
      setState({
        poseIrDraft: ir,
        currentValues: { ...newNeutralInputs },
        rigName: projectedConfig.title || DEFAULT_RIG_NAME,
        rigKind: projectedConfig.rigKind ?? "face-specific",
        neutralMode: projectedConfig.neutralMode ?? "explicit",
        blendMode:
          projectedConfig.poseGroups?.[0]?.blendMode ??
          state.blendMode ??
          "average",
        crossGroupBlendMode: projectedConfig.crossGroupBlendMode ?? "additive",
        standardInputSchema: projectedConfig.standardInputSchema ?? null,
        lastImportedConfig: projectedConfig,
        warnings: mergedWarnings,
        poseDiagnostics: mergedDiagnostics,
      });
    },
    importIr: (irPayload) => {
      const { ir, warnings, diagnostics } = PoseIrService.normalize(
        irPayload,
        state.standardInputs,
        state.faceId,
      );
      const normalized = PoseIrService.toConfig(ir);
      const newNeutralInputs = {
        ...createNeutralInputs(state.standardInputs),
        ...normalized.neutralInputs,
      };
      setState({
        poseIrDraft: ir,
        currentValues: { ...newNeutralInputs },
        rigName: normalized.title || DEFAULT_RIG_NAME,
        rigKind: normalized.rigKind ?? "face-specific",
        neutralMode: normalized.neutralMode ?? "explicit",
        blendMode:
          normalized.poseGroups?.[0]?.blendMode ?? state.blendMode ?? "average",
        crossGroupBlendMode: normalized.crossGroupBlendMode ?? "additive",
        standardInputSchema: normalized.standardInputSchema ?? null,
        lastImportedConfig: normalized,
        warnings,
        poseDiagnostics: diagnostics,
      });
    },
    reset: () => {
      setState({
        ...defaultState,
      });
    },
  };

  state = {
    ...defaultState,
    ...actions,
    ...(initialState ?? {}),
  };

  // Ensure drafts are initialized eagerly so UI/export surfaces can rely on
  // pose IR/config availability even before the first explicit mutation.
  const initialStandardInputSchema =
    state.poseConfigDraft?.standardInputSchema ??
    state.lastImportedConfig?.standardInputSchema ??
    state.standardInputSchema ??
    undefined;
  const initialPoseGroups = getConfiguredPoseGroups(state);
  const initialBlendStages = getConfiguredBlendStages(state);
  const initialConfig = PoseConfigService.create(
    state.poses,
    state.neutralInputs,
    state.rigName,
    state.faceId,
    state.rigKind,
    initialStandardInputSchema,
    {
      poseGroups: initialPoseGroups,
      defaultGroupBlendMode: state.blendMode,
      crossGroupBlendMode: state.crossGroupBlendMode,
      blendStages:
        initialBlendStages.length > 0 ? initialBlendStages : undefined,
      neutralMode: state.neutralMode,
    },
  );
  const { ir: initialIr } = PoseIrService.fromConfig(
    initialConfig,
    state.standardInputs,
    state.faceId,
  );
  state.poseIrDraft = initialIr;
  state.poseConfigDraft = PoseIrService.toConfig(initialIr);
  try {
    const { spec, summary } = PoseGraphService.buildSpecFromIr(
      initialIr,
      state.standardInputs,
      {
        rigKind: state.rigKind,
      },
    );
    state.poseGraphSpec = spec;
    state.poseGraphSummary = summary;
  } catch {
    state.poseGraphSpec = null;
    state.poseGraphSummary = null;
  }

  const getState = () => state;
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { getState, setState, subscribe };
}

const PoseRigStoreContext = createContext<PoseRigStore | null>(null);

export function PoseRigStoreProvider({
  store,
  children,
}: {
  store: PoseRigStore;
  children: ReactNode;
}) {
  return (
    <PoseRigStoreContext.Provider value={store}>
      {children}
    </PoseRigStoreContext.Provider>
  );
}

export function usePoseRigStore<T>(selector: (state: PoseRigState) => T): T {
  const store = useContext(PoseRigStoreContext);
  if (!store) {
    throw new Error("Missing PoseRigStoreProvider");
  }
  const subscribe = store.subscribe;
  const getSnapshot = () => selector(store.getState());
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return value;
}
