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
    if (
      !candidate.neutralInputs ||
      typeof candidate.neutralInputs !== "object"
    ) {
      throw new Error("Pose rig config missing neutral inputs.");
    }

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
    for (const [key, value] of Object.entries(
      candidate.neutralInputs as Record<string, number>,
    )) {
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
        crossGroupBlendMode:
          candidate.crossGroupBlendMode === "average" ||
          candidate.crossGroupBlendMode === "additive"
            ? candidate.crossGroupBlendMode
            : "additive",
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
    },
  ): PoseRigConfigFile {
    const defaultGroupBlendMode = options?.defaultGroupBlendMode ?? "average";
    const { poseGroups } = normalizePoseGroups(
      poses,
      options?.poseGroups,
      defaultGroupBlendMode,
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
      neutralInputs: { ...neutralInputs },
      poseGroups,
      crossGroupBlendMode: options?.crossGroupBlendMode ?? "additive",
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
