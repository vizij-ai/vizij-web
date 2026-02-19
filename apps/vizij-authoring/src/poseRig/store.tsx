import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseDiagnostic,
  PoseDefinition,
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
  blendMode?: "average" | "additive";
  crossGroupBlendMode?: "average" | "additive";
  standardInputSchema?: { id: string; version: string } | null;
  poseGroups?: ConfiguredPoseGroup[];
}

export interface PoseRigState {
  // Core Data
  faceId: string | null;
  rigName: string;
  rigKind: "generic" | "face-specific";
  neutralInputs: Record<StandardInputId, number>;
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
> = {
  faceId: null,
  rigName: DEFAULT_RIG_NAME,
  rigKind: "face-specific",
  neutralInputs: {},
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
    setFilenames: (filenames) => {
      setState((prev) => ({ filenames: { ...prev.filenames, ...filenames } }));
    },
    setNeutralInputs: (inputs) => {
      setState((prev) => ({
        ...buildProjectedPoseIrPatch(prev, { neutralInputs: inputs }),
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
          p.id === poseId ? { ...p, values: {} } : p,
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
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId
            ? { ...p, values: { ...p.values, [inputId]: val } }
            : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
      });
    },
    removePoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const nextValues = { ...pose.values };
        delete nextValues[inputId];
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? { ...p, values: nextValues } : p,
        );
        return buildProjectedPoseIrPatch(prev, { poses: nextPoses });
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
          ...buildProjectedPoseIrPatch(prev, {
            neutralInputs: { ...prev.currentValues },
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
