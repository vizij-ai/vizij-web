import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import type {
  PoseRigConfigFile,
  LowLevelRigSummary,
  PoseDefinition,
  PoseGroupDefinition,
  PoseBlendMode,
  PoseIrBlendMode,
  PoseIrBlendStageDefinition,
  PoseIrStageSource,
  PoseNeutralMode,
} from "../types";
import { POSE_RIG_CONFIG_VERSION } from "../types";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  resolvePoseMembership,
  sanitizePoseGroupId,
} from "../groupMembership";

function normalizePoseGroups(
  poses: PoseDefinition[],
  poseGroups: unknown,
  defaultGroupBlendMode: PoseBlendMode,
): {
  poseGroups: PoseGroupDefinition[];
  groupById: Map<string, PoseGroupDefinition>;
  groupByPath: Map<string, PoseGroupDefinition>;
} {
  const groups: PoseGroupDefinition[] = [];
  const groupById = new Map<string, PoseGroupDefinition>();
  const groupByPath = new Map<string, PoseGroupDefinition>();
  const sourceGroups = Array.isArray(poseGroups)
    ? (poseGroups as PoseGroupDefinition[])
    : [];

  sourceGroups.forEach((group) => {
    if (!group || typeof group !== "object") {
      return;
    }
    const path =
      normalizePoseGroupPath(group.path ?? group.name ?? group.id) ?? "default";
    const id = sanitizePoseGroupId(group.id, path);
    const existingByPath = groupByPath.get(path);
    if (existingByPath) {
      return;
    }
    const normalized: PoseGroupDefinition = {
      id,
      path,
      name:
        typeof group.name === "string" && group.name.trim().length > 0
          ? group.name.trim()
          : humanizePoseGroupName(path),
      blendMode:
        group.blendMode === "additive" || group.blendMode === "average"
          ? group.blendMode
          : defaultGroupBlendMode,
    };
    groups.push(normalized);
    groupById.set(id, normalized);
    groupByPath.set(path, normalized);
  });

  poses.forEach((pose) => {
    const membership = resolvePoseMembership(pose, groups);
    membership.groupIds.forEach((resolvedId) => {
      if (groupById.has(resolvedId)) {
        return;
      }
      const resolvedPath = membership.groupPathsById[resolvedId] ?? null;
      const path =
        resolvedPath ?? normalizePoseGroupPath(resolvedId) ?? "default";
      if (groupByPath.has(path)) {
        return;
      }
      const normalized: PoseGroupDefinition = {
        id: sanitizePoseGroupId(resolvedId, path),
        path,
        name: humanizePoseGroupName(path),
        blendMode: defaultGroupBlendMode,
      };
      groups.push(normalized);
      groupById.set(normalized.id, normalized);
      groupByPath.set(normalized.path, normalized);
    });
  });

  return { poseGroups: groups, groupById, groupByPath };
}

function resolveDefaultStageMode(
  crossGroupBlendMode: PoseBlendMode,
): PoseIrBlendMode {
  return crossGroupBlendMode === "additive" ? "add" : "average";
}

function cloneBlendStages(
  blendStages: PoseIrBlendStageDefinition[] | undefined,
): PoseIrBlendStageDefinition[] | undefined {
  if (!blendStages || blendStages.length === 0) {
    return undefined;
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

function normalizeBlendStages(
  blendStages: unknown,
  groupIds: string[],
  fallbackMode: PoseIrBlendMode,
  pushWarning: (message: string) => void,
): PoseIrBlendStageDefinition[] | undefined {
  if (blendStages === undefined || blendStages === null) {
    return undefined;
  }
  if (!Array.isArray(blendStages)) {
    pushWarning("Blend stages payload was ignored because it is not an array.");
    return undefined;
  }
  if (blendStages.length === 0) {
    return undefined;
  }

  const knownGroupIds = new Set(groupIds);
  const knownStageIds = new Set<string>();
  const normalizedStages: PoseIrBlendStageDefinition[] = [];

  blendStages.forEach((stage, stageIndex) => {
    if (!stage || typeof stage !== "object") {
      pushWarning(
        `Blend stage #${stageIndex + 1} was ignored because it is not an object.`,
      );
      return;
    }

    const stageId = typeof stage.id === "string" ? stage.id.trim() : "";
    if (!stageId) {
      pushWarning(
        `Blend stage #${stageIndex + 1} is missing an id and was ignored.`,
      );
      return;
    }
    if (knownStageIds.has(stageId)) {
      pushWarning(
        `Blend stage "${stageId}" is duplicated and later entries were ignored.`,
      );
      return;
    }

    const stageMode =
      stage.mode === "add" || stage.mode === "average"
        ? stage.mode
        : fallbackMode;
    if (stage.mode !== "add" && stage.mode !== "average") {
      pushWarning(
        `Blend stage "${stageId}" mode "${String(stage.mode)}" is invalid; using "${stageMode}".`,
      );
    }

    const stageSources = Array.isArray(stage.sources) ? stage.sources : [];
    if (!Array.isArray(stage.sources)) {
      pushWarning(
        `Blend stage "${stageId}" sources are invalid and were normalized to an empty list.`,
      );
    }

    const seenSourceKeys = new Set<string>();
    const normalizedSources: PoseIrStageSource[] = [];
    stageSources.forEach((source: any, sourceIndex: number) => {
      if (!source || typeof source !== "object") {
        pushWarning(
          `Blend stage "${stageId}" source #${sourceIndex + 1} was ignored because it is not an object.`,
        );
        return;
      }
      const sourceKind = source.kind;
      const sourceId = typeof source.id === "string" ? source.id.trim() : "";
      if (sourceKind !== "group" && sourceKind !== "stage") {
        pushWarning(
          `Blend stage "${stageId}" source #${sourceIndex + 1} has invalid kind "${String(sourceKind)}" and was ignored.`,
        );
        return;
      }
      if (!sourceId) {
        pushWarning(
          `Blend stage "${stageId}" source #${sourceIndex + 1} is missing an id and was ignored.`,
        );
        return;
      }
      if (sourceKind === "group" && !knownGroupIds.has(sourceId)) {
        pushWarning(
          `Blend stage "${stageId}" source group "${sourceId}" does not exist and was ignored.`,
        );
        return;
      }
      if (sourceKind === "stage") {
        if (sourceId === stageId) {
          pushWarning(
            `Blend stage "${stageId}" cannot source itself; source "${sourceId}" was ignored.`,
          );
          return;
        }
        if (!knownStageIds.has(sourceId)) {
          pushWarning(
            `Blend stage "${stageId}" source stage "${sourceId}" does not reference an earlier stage and was ignored.`,
          );
          return;
        }
      }
      const sourceKey = `${sourceKind}:${sourceId}`;
      if (seenSourceKeys.has(sourceKey)) {
        pushWarning(
          `Blend stage "${stageId}" source "${sourceKey}" is duplicated and was ignored.`,
        );
        return;
      }
      seenSourceKeys.add(sourceKey);
      normalizedSources.push({
        kind: sourceKind,
        id: sourceId,
      });
    });

    if (normalizedSources.length === 0) {
      pushWarning(
        `Blend stage "${stageId}" has no valid sources and was ignored.`,
      );
      return;
    }

    const stageName =
      typeof stage.name === "string" && stage.name.trim().length > 0
        ? stage.name.trim()
        : undefined;
    normalizedStages.push({
      id: stageId,
      name: stageName,
      mode: stageMode,
      sources: normalizedSources,
    });
    knownStageIds.add(stageId);
  });

  if (normalizedStages.length === 0) {
    pushWarning(
      "Blend stages were provided but none were valid; compiler will use legacy cross-group blending.",
    );
    return undefined;
  }

  return normalizedStages;
}

export const PoseConfigService = {
  normalize(
    payload: unknown,
    standardInputs: StandardRigInput[] = [],
    currentFaceId: string | null = null,
  ): { config: PoseRigConfigFile; warnings: string[] } {
    if (!payload || typeof payload !== "object") {
      throw new Error("Invalid pose rig config payload.");
    }
    const candidate = payload as Partial<PoseRigConfigFile>;
    if (candidate.version !== POSE_RIG_CONFIG_VERSION) {
      throw new Error(
        `Unsupported pose rig config version: ${candidate.version ?? "unknown"}.`,
      );
    }
    if (!Array.isArray(candidate.poses)) {
      throw new Error("Pose rig config missing pose definitions.");
    }
    const neutralMode: PoseNeutralMode =
      candidate.neutralMode === "face-default" ||
      candidate.neutralMode === "explicit"
        ? candidate.neutralMode
        : "explicit";
    if (
      neutralMode === "explicit" &&
      (!candidate.neutralInputs || typeof candidate.neutralInputs !== "object")
    ) {
      throw new Error("Pose rig config missing neutral inputs.");
    }
    const rawNeutralInputs =
      candidate.neutralInputs && typeof candidate.neutralInputs === "object"
        ? (candidate.neutralInputs as Record<string, number>)
        : {};

    const warnings: string[] = [];
    const importedFaceId = candidate.faceId;
    if (currentFaceId && importedFaceId && importedFaceId !== currentFaceId) {
      warnings.push(
        `Imported pose rig targets face "${importedFaceId}", current face "${currentFaceId}".`,
      );
    }

    const inputsById = new Map(
      standardInputs.map((input) => [input.id, input]),
    );
    const inputsBySourceId = new Map<string, string>();
    const inputsByPath = new Map<string, string>();
    const inputsByNormalizedId = new Map<string, string>();
    const inputsByNormalizedPath = new Map<string, string>();
    const inputsByNormalizedSourceId = new Map<string, string>();

    const normalizeToken = (value: string): string =>
      value.trim().replace(/^\/+/, "").replace(/\/+/g, "_").toLowerCase();

    const pushLookupValue = (
      lookup: Map<string, string>,
      key: string | null | undefined,
      inputId: string,
    ) => {
      if (!key) {
        return;
      }
      const normalized = key.trim();
      if (!normalized) {
        return;
      }
      if (!lookup.has(normalized)) {
        lookup.set(normalized, inputId);
      }
    };

    standardInputs.forEach((input) => {
      const normalizedPath = normalizeStandardRigInputPath(input.path);
      pushLookupValue(inputsByPath, normalizedPath, input.id);
      pushLookupValue(inputsByNormalizedId, normalizeToken(input.id), input.id);
      pushLookupValue(
        inputsByNormalizedPath,
        normalizeToken(normalizedPath),
        input.id,
      );
      if (input.sourceId) {
        pushLookupValue(inputsBySourceId, input.sourceId, input.id);
        pushLookupValue(
          inputsByNormalizedSourceId,
          normalizeToken(input.sourceId),
          input.id,
        );
      }
    });

    const validInputs = new Set(inputsById.keys());
    const seenWarnings = new Set<string>();
    const pushWarning = (message: string) => {
      if (seenWarnings.has(message)) {
        return;
      }
      seenWarnings.add(message);
      warnings.push(message);
    };

    const resolveInputId = (
      rawKey: string,
    ): {
      id: string | null;
      reason: "sourceId" | "path" | "normalized" | null;
    } => {
      const key = rawKey.trim();
      if (!key) {
        return { id: null, reason: null };
      }
      if (inputsById.has(key)) {
        return { id: key, reason: null };
      }
      const sourceMatch = inputsBySourceId.get(key);
      if (sourceMatch) {
        return { id: sourceMatch, reason: "sourceId" };
      }
      const normalizedPath = normalizeStandardRigInputPath(key);
      const pathMatch = inputsByPath.get(normalizedPath);
      if (pathMatch) {
        return { id: pathMatch, reason: "path" };
      }
      const normalized = normalizeToken(key);
      const normalizedMatch =
        inputsByNormalizedId.get(normalized) ??
        inputsByNormalizedPath.get(normalized) ??
        inputsByNormalizedSourceId.get(normalized) ??
        null;
      if (normalizedMatch) {
        return { id: normalizedMatch, reason: "normalized" };
      }
      return { id: null, reason: null };
    };

    const neutralInputs: Record<string, number> = {};

    const neutralSourcesByResolvedId = new Map<string, string>();
    for (const [key, value] of Object.entries(rawNeutralInputs)) {
      if (validInputs.size === 0) {
        neutralInputs[key] = value;
        continue;
      }

      const resolved = resolveInputId(key);
      if (!resolved.id) {
        pushWarning(`Neutral value for missing input "${key}" was ignored.`);
        continue;
      }
      const firstSource = neutralSourcesByResolvedId.get(resolved.id);
      if (firstSource && firstSource !== key) {
        pushWarning(
          `Neutral inputs "${firstSource}" and "${key}" both remap to "${resolved.id}"; keeping value from "${key}".`,
        );
      } else if (!firstSource) {
        neutralSourcesByResolvedId.set(resolved.id, key);
      }
      neutralInputs[resolved.id] = value;
      if (resolved.id !== key) {
        pushWarning(
          `Neutral input "${key}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
        );
      }
    }

    const defaultGroupBlendMode: PoseBlendMode = "average";
    const { poseGroups: normalizedGroups } = normalizePoseGroups(
      candidate.poses as PoseDefinition[],
      candidate.poseGroups,
      defaultGroupBlendMode,
    );
    const crossGroupBlendMode: PoseBlendMode =
      candidate.crossGroupBlendMode === "average" ||
      candidate.crossGroupBlendMode === "additive"
        ? candidate.crossGroupBlendMode
        : "additive";
    const normalizedBlendStages = normalizeBlendStages(
      candidate.blendStages,
      normalizedGroups.map((group) => group.id),
      resolveDefaultStageMode(crossGroupBlendMode),
      pushWarning,
    );

    const poses = candidate.poses.map((pose) => {
      const values: Record<string, number> = {};
      const poseSourcesByResolvedId = new Map<string, string>();
      const poseValues =
        pose.values && typeof pose.values === "object"
          ? (pose.values as Record<string, number>)
          : {};
      for (const [key, value] of Object.entries(poseValues)) {
        if (validInputs.size === 0) {
          values[key] = value;
          continue;
        }
        const resolved = resolveInputId(key);
        if (!resolved.id) {
          pushWarning(
            `Pose "${pose.name}" references missing input "${key}" and was pruned.`,
          );
          continue;
        }
        const firstSource = poseSourcesByResolvedId.get(resolved.id);
        if (firstSource && firstSource !== key) {
          pushWarning(
            `Pose "${pose.name}" inputs "${firstSource}" and "${key}" both remap to "${resolved.id}"; keeping value from "${key}".`,
          );
        } else if (!firstSource) {
          poseSourcesByResolvedId.set(resolved.id, key);
        }
        values[resolved.id] = value;
        if (resolved.id !== key) {
          pushWarning(
            `Pose "${pose.name}" input "${key}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
          );
        }
      }

      const membership = resolvePoseMembership(pose, normalizedGroups);

      const newPose = {
        ...pose,
        groupIds: membership.groupIds,
        groupId: membership.primaryGroupId,
        group: membership.primaryGroupPath,
        values,
      };
      return newPose;
    });

    return {
      config: {
        version: POSE_RIG_CONFIG_VERSION,
        faceId: candidate.faceId ?? null,
        rigKind: candidate.rigKind ?? "face-specific",
        title: candidate.title ?? undefined,
        description: candidate.description ?? undefined,
        poseGroups: normalizedGroups,
        crossGroupBlendMode,
        blendStages: cloneBlendStages(normalizedBlendStages),
        neutralMode,
        neutralInputs,
        poses: poses.map((p) => ({ ...p, values: { ...p.values } })),
        lowLevel:
          (candidate.lowLevel as LowLevelRigSummary | null | undefined) ?? null,
        standardInputSchema: candidate.standardInputSchema ?? undefined,
        metadata: candidate.metadata
          ? { ...candidate.metadata }
          : {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
      },
      warnings,
    };
  },

  create(
    poses: PoseDefinition[],
    neutralInputs: Record<string, number>,
    rigName: string,
    faceId: string | null,
    rigKind: "generic" | "face-specific" = "face-specific",
    standardInputSchema?: PoseRigConfigFile["standardInputSchema"],
    options?: {
      poseGroups?: PoseGroupDefinition[];
      defaultGroupBlendMode?: PoseBlendMode;
      crossGroupBlendMode?: PoseBlendMode;
      blendStages?: PoseRigConfigFile["blendStages"];
      neutralMode?: PoseNeutralMode;
    },
  ): PoseRigConfigFile {
    const defaultGroupBlendMode = options?.defaultGroupBlendMode ?? "average";
    const { poseGroups } = normalizePoseGroups(
      poses,
      options?.poseGroups,
      defaultGroupBlendMode,
    );
    const crossGroupBlendMode = options?.crossGroupBlendMode ?? "additive";
    const normalizedBlendStages = normalizeBlendStages(
      options?.blendStages,
      poseGroups.map((group) => group.id),
      resolveDefaultStageMode(crossGroupBlendMode),
      () => {
        // create() returns normalized payload; invalid blend stages are silently dropped.
      },
    );

    const normalizedPoses = poses.map((pose) => {
      const membership = resolvePoseMembership(pose, poseGroups);
      return {
        ...pose,
        groupIds: membership.groupIds,
        groupId: membership.primaryGroupId,
        group: membership.primaryGroupPath,
        values: { ...pose.values },
      };
    });

    return {
      version: POSE_RIG_CONFIG_VERSION,
      faceId,
      rigKind,
      title: rigName,
      neutralMode: options?.neutralMode ?? "explicit",
      neutralInputs: { ...neutralInputs },
      poseGroups,
      crossGroupBlendMode,
      blendStages: cloneBlendStages(normalizedBlendStages),
      poses: normalizedPoses,
      standardInputSchema: standardInputSchema ?? {
        id: "vizij-standard-face",
        version: "v1",
      },
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  },

  serialize(config: PoseRigConfigFile): string {
    return JSON.stringify(config, null, 2);
  },

  diff(a: PoseRigConfigFile | null, b: PoseRigConfigFile | null): boolean {
    if (a === b) return false;
    if (!a || !b) return true;
    return JSON.stringify(a) !== JSON.stringify(b);
  },
};
