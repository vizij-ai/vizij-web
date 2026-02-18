import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseDefinition,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  StandardInputId,
} from "./types";
import { PoseConfigService } from "./services/poseConfigService";
import { PoseGraphService } from "./services/poseGraphService";
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

function orderMembershipIds(
  groupIds: Iterable<string>,
  groups: ConfiguredPoseGroup[],
): string[] {
  const configuredOrder = new Map(
    groups.map((group, index) => [group.id, index]),
  );
  const unique = Array.from(
    new Set(
      Array.from(groupIds)
        .map((groupId) => groupId.trim())
        .filter((groupId) => groupId.length > 0),
    ),
  );

  unique.sort((left, right) => {
    const leftIndex = configuredOrder.get(left);
    const rightIndex = configuredOrder.get(right);

    if (leftIndex !== undefined && rightIndex !== undefined) {
      return leftIndex - rightIndex;
    }
    if (leftIndex !== undefined) {
      return -1;
    }
    if (rightIndex !== undefined) {
      return 1;
    }
    return left.localeCompare(right);
  });

  return unique;
}

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
  const orderedGroupIds = orderMembershipIds(groupIds, groups);
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
  poseConfigDraft: PoseRigConfigFile | null; // The config being edited
  standardInputSchema: { id: string; version: string } | null;
  lastImportedConfig: PoseRigConfigFile | null; // For diffing/dirty checks

  // Metadata
  filenames: {
    config: string;
    graph: string;
  };
  warnings: string[];
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
  reset: () => void;
  setFilenames: (filenames: { config?: string; graph?: string }) => void;
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
  poseConfigDraft: null,
  standardInputSchema: null,
  lastImportedConfig: null,
  filenames: {
    config: "",
    graph: "",
  },
  warnings: [],
  isReady: false,
};

export function createPoseRigStore(
  initialState?: Partial<PoseRigState>,
): PoseRigStore {
  let state: PoseRigState;
  const listeners = new Set<() => void>();

  const setState = (updater: PoseRigStoreUpdate) => {
    const patch = typeof updater === "function" ? updater(state) : updater;
    if (!patch) {
      return;
    }
    const nextState = { ...state, ...patch } as PoseRigState;

    // Auto-update poseConfigDraft if relevant fields change
    if (
      patch.poses ||
      patch.neutralInputs ||
      patch.rigName ||
      patch.faceId ||
      patch.rigKind ||
      patch.standardInputs ||
      patch.standardInputSchema ||
      patch.blendMode ||
      patch.crossGroupBlendMode
    ) {
      const standardInputSchema =
        nextState.poseConfigDraft?.standardInputSchema ??
        nextState.lastImportedConfig?.standardInputSchema ??
        nextState.standardInputSchema ??
        undefined;
      const poseGroups = getConfiguredPoseGroups(nextState);

      nextState.poseConfigDraft = PoseConfigService.create(
        nextState.poses,
        nextState.neutralInputs,
        nextState.rigName,
        nextState.faceId,
        nextState.rigKind,
        standardInputSchema,
        {
          poseGroups,
          defaultGroupBlendMode: nextState.blendMode,
          crossGroupBlendMode: nextState.crossGroupBlendMode,
        },
      );

      try {
        const { spec, summary } = PoseGraphService.buildSpec(
          nextState.poseConfigDraft,
          nextState.standardInputs,
          {
            defaultGroupBlendMode: nextState.blendMode,
            crossGroupBlendMode: nextState.crossGroupBlendMode,
          },
        );
        nextState.poseGraphSpec = spec;
        nextState.poseGraphSummary = summary;
      } catch (e) {
        console.error("Failed to build pose graph spec", e);
        // Keep previous spec or set to null?
        // nextState.poseGraphSpec = null;
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
      setState({ rigName: name });
    },
    setRigKind: (kind) => {
      setState({ rigKind: kind });
    },
    setBlendMode: (mode) => {
      setState({ blendMode: mode });
    },
    setCrossGroupBlendMode: (mode) => {
      setState({ crossGroupBlendMode: mode });
    },
    setFilenames: (filenames) => {
      setState((prev) => ({ filenames: { ...prev.filenames, ...filenames } }));
    },
    setNeutralInputs: (inputs) => {
      setState({ neutralInputs: inputs });
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
        return {
          poses: [...prev.poses, normalizedPose],
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
        return {
          poses: [...prev.poses, nextPose],
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
        return {
          poses: [...prev.poses, duplicate],
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
          poses: nextPoses,
          selectedPoseId: nextSelected,
        };
      });
    },
    updatePoseName: (poseId, name) => {
      setState((prev) => ({
        poses: prev.poses.map((p) => (p.id === poseId ? { ...p, name } : p)),
      }));
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
        return {
          poseConfigDraft: PoseConfigService.create(
            prev.poses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: groups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
        };
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
          poses: nextPoses,
          poseConfigDraft: PoseConfigService.create(
            nextPoses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: nextGroups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
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
          poses: nextPoses,
          poseConfigDraft: PoseConfigService.create(
            nextPoses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: nextGroups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
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
        return {
          poseConfigDraft: PoseConfigService.create(
            prev.poses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: nextGroups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
        };
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
        if (!groupsChanged) {
          return { poses: nextPoses };
        }
        return {
          poses: nextPoses,
          poseConfigDraft: PoseConfigService.create(
            nextPoses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: groups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
        };
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
        return { poses: nextPoses };
      });
    },
    updatePoseGroup: (poseId, group) => {
      const nextGroup = group ?? null;
      if (!nextGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          return {
            poses: prev.poses.map((p) =>
              p.id === poseId ? withMembershipIds(p, [], configured) : p,
            ),
          };
        });
        return;
      }
      const normalizedGroup = normalizePoseGroupPath(nextGroup);
      if (!normalizedGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          return {
            poses: prev.poses.map((p) =>
              p.id === poseId ? withMembershipIds(p, [], configured) : p,
            ),
          };
        });
        return;
      }
      setState((prev) => {
        const { groupsChanged, groups, groupId } = ensurePoseGroupFromPath(
          prev,
          normalizedGroup,
        );
        if (!groupId) {
          return;
        }
        const nextPoses = prev.poses.map((p) =>
          p.id === poseId ? withMembershipIds(p, [groupId], groups) : p,
        );
        if (!groupsChanged) {
          return { poses: nextPoses };
        }
        return {
          poses: nextPoses,
          poseConfigDraft: PoseConfigService.create(
            nextPoses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: groups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
        };
      });
    },
    updatePoseGroupBatch: (poseIds, group) => {
      const ids = new Set(poseIds);
      const nextGroup = group ?? null;
      if (!nextGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          return {
            poses: prev.poses.map((p) =>
              ids.has(p.id) ? withMembershipIds(p, [], configured) : p,
            ),
          };
        });
        return;
      }
      const normalizedGroup = normalizePoseGroupPath(nextGroup);
      if (!normalizedGroup) {
        setState((prev) => {
          const configured = getConfiguredPoseGroups(prev);
          return {
            poses: prev.poses.map((p) =>
              ids.has(p.id) ? withMembershipIds(p, [], configured) : p,
            ),
          };
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
        if (!groupId) {
          return { poses: nextPoses };
        }
        if (!groupsChanged) {
          return { poses: nextPoses };
        }
        return {
          poses: nextPoses,
          poseConfigDraft: PoseConfigService.create(
            nextPoses,
            prev.neutralInputs,
            prev.rigName,
            prev.faceId,
            prev.rigKind,
            prev.standardInputSchema ?? undefined,
            {
              poseGroups: groups,
              defaultGroupBlendMode: prev.blendMode,
              crossGroupBlendMode: prev.crossGroupBlendMode,
            },
          ),
        };
      });
    },
    clearPose: (poseId) => {
      setState((prev) => ({
        poses: prev.poses.map((p) =>
          p.id === poseId ? { ...p, values: {} } : p,
        ),
      }));
    },
    addPoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const val =
          prev.currentValues[inputId] ?? prev.neutralInputs[inputId] ?? 0;
        return {
          poses: prev.poses.map((p) =>
            p.id === poseId
              ? { ...p, values: { ...p.values, [inputId]: val } }
              : p,
          ),
        };
      });
    },
    removePoseInput: (poseId, inputId) => {
      setState((prev) => {
        const pose = prev.poses.find((p) => p.id === poseId);
        if (!pose) return;
        const nextValues = { ...pose.values };
        delete nextValues[inputId];
        return {
          poses: prev.poses.map((p) =>
            p.id === poseId ? { ...p, values: nextValues } : p,
          ),
        };
      });
    },
    updatePose: (poseId, updater) => {
      setState((prev) => ({
        poses: prev.poses.map((p) => (p.id === poseId ? updater(p) : p)),
      }));
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
        return {
          poses: prev.poses.map((p) => (p.id === poseId ? updated : p)),
        };
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
          neutralInputs: { ...prev.currentValues },
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
      const importedPoses = normalizePoseDefinitionIds(normalized.poses, {
        reservedIds: [NEUTRAL_POSE_ID],
      });
      const newNeutralInputs = {
        ...createNeutralInputs(state.standardInputs),
        ...normalized.neutralInputs,
      };
      setState({
        poses: importedPoses,
        neutralInputs: newNeutralInputs,
        currentValues: { ...newNeutralInputs },
        rigName: normalized.title || DEFAULT_RIG_NAME,
        rigKind: normalized.rigKind ?? "face-specific",
        blendMode:
          normalized.poseGroups?.[0]?.blendMode ?? state.blendMode ?? "average",
        crossGroupBlendMode: normalized.crossGroupBlendMode ?? "additive",
        standardInputSchema: normalized.standardInputSchema ?? null,
        lastImportedConfig: config,
        poseConfigDraft: normalized,
        warnings,
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
