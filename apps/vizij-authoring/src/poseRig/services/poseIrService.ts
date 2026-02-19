import type { StandardRigInput } from "@vizij/utils";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  resolvePoseMembership,
  sanitizePoseGroupId,
} from "../groupMembership";
import type {
  PoseDiagnostic,
  PoseDiagnosticLocation,
  PoseBlendMode,
  PoseDefinition,
  PoseGroupDefinition,
  PoseIrCompileResult,
  PoseIrBlendMode,
  PoseIrBlendStageDefinition,
  PoseIrStageSource,
  PoseNeutralMode,
  PoseRigConfigFile,
  PoseRigIrFile,
} from "../types";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
  POSE_RIG_IR_VERSION,
} from "../types";

const DEFAULT_GROUP_PATH = "default";

function toPoseIrBlendMode(value: unknown): PoseIrBlendMode {
  if (value === "add") {
    return "add";
  }
  if (value === "additive") {
    return "add";
  }
  return "average";
}

function toPoseConfigBlendMode(value: unknown): PoseBlendMode {
  return value === "add" || value === "additive" ? "additive" : "average";
}

function isSyntheticPoseChannelId(inputId: string): boolean {
  const normalized = inputId.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.startsWith("pose_group_") ||
    normalized.startsWith("pose_cross_") ||
    normalized.startsWith("pose_weights_") ||
    normalized.startsWith("pose_neutral_") ||
    normalized.startsWith("out_") ||
    normalized.includes("__pose_ghost__")
  );
}

interface DiagnosticCollector {
  warnings: string[];
  diagnostics: PoseDiagnostic[];
}

function createDiagnosticCollector(): DiagnosticCollector {
  return {
    warnings: [],
    diagnostics: [],
  };
}

function pushPoseDiagnostic(
  collector: DiagnosticCollector,
  params: {
    severity: "warning" | "error" | "info";
    code: string;
    source: "pose-config" | "pose-ir";
    message: string;
    location?: PoseDiagnosticLocation;
    metadata?: Record<string, unknown>;
  },
): void {
  const { severity, code, source, message, location, metadata } = params;
  const index = collector.diagnostics.length + 1;
  collector.diagnostics.push({
    id: `${source}:${code}:${index}`,
    severity,
    code,
    source,
    message,
    location,
    metadata,
  });
  if (severity === "warning") {
    collector.warnings.push(message);
  }
}

function createPoseIrServiceError(
  message: string,
  diagnostic: Omit<PoseDiagnostic, "id">,
): Error & { diagnostics: PoseDiagnostic[] } {
  const error = new Error(message) as Error & { diagnostics: PoseDiagnostic[] };
  error.diagnostics = [
    {
      ...diagnostic,
      id: `${diagnostic.source}:${diagnostic.code}:1`,
    },
  ];
  return error;
}

function normalizePoseGroups(
  poses: PoseDefinition[],
  poseGroups: unknown,
  defaultBlendMode: PoseBlendMode,
): PoseGroupDefinition[] {
  const groups: PoseGroupDefinition[] = [];
  const byId = new Map<string, PoseGroupDefinition>();
  const byPath = new Map<string, PoseGroupDefinition>();
  const sourceGroups = Array.isArray(poseGroups)
    ? (poseGroups as PoseGroupDefinition[])
    : [];

  sourceGroups.forEach((group) => {
    if (!group || typeof group !== "object") {
      return;
    }
    const path =
      normalizePoseGroupPath(group.path ?? group.name ?? group.id) ??
      DEFAULT_GROUP_PATH;
    if (byPath.has(path)) {
      return;
    }
    const id = sanitizePoseGroupId(group.id, path);
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
          : defaultBlendMode,
    };
    groups.push(normalized);
    byPath.set(path, normalized);
    byId.set(id, normalized);
  });

  poses.forEach((pose) => {
    const membership = resolvePoseMembership(pose, groups);
    membership.groupIds.forEach((groupId) => {
      if (byId.has(groupId)) {
        return;
      }
      const resolvedPath = membership.groupPathsById[groupId] ?? null;
      const path =
        resolvedPath ?? normalizePoseGroupPath(groupId) ?? DEFAULT_GROUP_PATH;
      if (byPath.has(path)) {
        return;
      }
      const normalized: PoseGroupDefinition = {
        id: sanitizePoseGroupId(groupId, path),
        path,
        name: humanizePoseGroupName(path),
        blendMode: defaultBlendMode,
      };
      groups.push(normalized);
      byPath.set(path, normalized);
      byId.set(normalized.id, normalized);
    });
  });

  return groups;
}

function canonicalizeInputValues(
  values: Record<string, number> | null | undefined,
  canonicalInputs: Set<string>,
  collector: DiagnosticCollector,
  context: string,
  source: "pose-config" | "pose-ir",
): Record<string, number> {
  if (!values || typeof values !== "object") {
    return {};
  }
  const normalized: Record<string, number> = {};
  Object.entries(values).forEach(([inputId, value]) => {
    if (!Number.isFinite(value)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "invalid-input-value",
        source,
        message: `${context} input "${inputId}" ignored invalid value.`,
        location: {
          inputId,
        },
        metadata: {
          context,
          value,
        },
      });
      return;
    }
    if (isSyntheticPoseChannelId(inputId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "ghost-channel-id",
        source,
        message: `${context} input "${inputId}" ignored because synthetic pose channels are graph-internal only.`,
        location: {
          inputId,
        },
        metadata: {
          context,
        },
      });
      return;
    }
    if (canonicalInputs.size > 0 && !canonicalInputs.has(inputId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "non-canonical-input-id",
        source,
        message: `${context} input "${inputId}" ignored because it is not a canonical standard input id.`,
        location: {
          inputId,
        },
        metadata: {
          context,
        },
      });
      return;
    }
    normalized[inputId] = value;
  });
  return normalized;
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
  orderedGroupIds: string[],
  fallbackMode: PoseIrBlendMode,
  collector: DiagnosticCollector,
  source: "pose-config" | "pose-ir",
): PoseIrBlendStageDefinition[] | undefined {
  if (blendStages === undefined || blendStages === null) {
    return undefined;
  }

  const pushBlendDiagnostic = (params: {
    code: string;
    message: string;
    path?: string;
    metadata?: Record<string, unknown>;
  }) => {
    pushPoseDiagnostic(collector, {
      severity: "warning",
      source,
      code: params.code,
      message: params.message,
      location: params.path ? { path: params.path } : undefined,
      metadata: params.metadata,
    });
  };

  if (!Array.isArray(blendStages)) {
    pushBlendDiagnostic({
      code: "invalid-blend-stages-payload",
      message: "Blend stages were ignored because payload is not an array.",
      path: "blendStages",
    });
    return undefined;
  }
  if (blendStages.length === 0) {
    return undefined;
  }

  const knownGroupIds = new Set(orderedGroupIds);
  const knownStageIds = new Set<string>();
  const normalizedStages: PoseIrBlendStageDefinition[] = [];

  blendStages.forEach((stage, stageIndex) => {
    const stagePath = `blendStages[${stageIndex}]`;
    if (!stage || typeof stage !== "object") {
      pushBlendDiagnostic({
        code: "invalid-blend-stage",
        message: `Blend stage #${stageIndex + 1} was ignored because it is not an object.`,
        path: stagePath,
      });
      return;
    }

    const stageId = typeof stage.id === "string" ? stage.id.trim() : "";
    if (!stageId) {
      pushBlendDiagnostic({
        code: "missing-blend-stage-id",
        message: `Blend stage #${stageIndex + 1} is missing an id and was ignored.`,
        path: `${stagePath}.id`,
      });
      return;
    }

    if (knownStageIds.has(stageId)) {
      pushBlendDiagnostic({
        code: "duplicate-blend-stage-id",
        message: `Blend stage "${stageId}" is duplicated; later entry was ignored.`,
        path: `${stagePath}.id`,
        metadata: {
          stageId,
          stageIndex,
        },
      });
      return;
    }

    const stageMode =
      stage.mode === "add" || stage.mode === "average"
        ? stage.mode
        : fallbackMode;
    if (stage.mode !== "add" && stage.mode !== "average") {
      pushBlendDiagnostic({
        code: "invalid-blend-stage-mode",
        message: `Blend stage "${stageId}" mode "${String(stage.mode)}" is invalid; using "${stageMode}".`,
        path: `${stagePath}.mode`,
        metadata: {
          stageId,
          fallbackMode: stageMode,
        },
      });
    }

    const stageSources = Array.isArray(stage.sources) ? stage.sources : [];
    if (!Array.isArray(stage.sources)) {
      pushBlendDiagnostic({
        code: "invalid-blend-stage-sources",
        message: `Blend stage "${stageId}" sources are invalid and were normalized to an empty list.`,
        path: `${stagePath}.sources`,
      });
    }

    const seenSourceKeys = new Set<string>();
    const normalizedSources: PoseIrStageSource[] = [];
    stageSources.forEach((stageSource: any, sourceIndex: number) => {
      const sourcePath = `${stagePath}.sources[${sourceIndex}]`;
      if (!stageSource || typeof stageSource !== "object") {
        pushBlendDiagnostic({
          code: "invalid-blend-stage-source",
          message: `Blend stage "${stageId}" source #${sourceIndex + 1} was ignored because it is not an object.`,
          path: sourcePath,
        });
        return;
      }
      const sourceKind = stageSource.kind;
      const sourceId =
        typeof stageSource.id === "string" ? stageSource.id.trim() : "";
      if (sourceKind !== "group" && sourceKind !== "stage") {
        pushBlendDiagnostic({
          code: "invalid-blend-stage-source-kind",
          message: `Blend stage "${stageId}" source #${sourceIndex + 1} has invalid kind "${String(sourceKind)}" and was ignored.`,
          path: `${sourcePath}.kind`,
          metadata: {
            stageId,
            sourceIndex,
            sourceKind,
          },
        });
        return;
      }
      if (!sourceId) {
        pushBlendDiagnostic({
          code: "invalid-blend-stage-source-id",
          message: `Blend stage "${stageId}" source #${sourceIndex + 1} is missing an id and was ignored.`,
          path: `${sourcePath}.id`,
        });
        return;
      }

      if (sourceKind === "group") {
        if (!knownGroupIds.has(sourceId)) {
          pushBlendDiagnostic({
            code: "unknown-blend-stage-group-source",
            message: `Blend stage "${stageId}" group source "${sourceId}" does not exist and was ignored.`,
            path: `${sourcePath}.id`,
            metadata: {
              stageId,
              sourceId,
            },
          });
          return;
        }
      } else {
        if (sourceId === stageId) {
          pushBlendDiagnostic({
            code: "self-blend-stage-source",
            message: `Blend stage "${stageId}" cannot source itself; source "${sourceId}" was ignored.`,
            path: `${sourcePath}.id`,
            metadata: {
              stageId,
              sourceId,
            },
          });
          return;
        }
        if (!knownStageIds.has(sourceId)) {
          pushBlendDiagnostic({
            code: "unknown-blend-stage-source",
            message: `Blend stage "${stageId}" stage source "${sourceId}" does not reference an earlier stage and was ignored.`,
            path: `${sourcePath}.id`,
            metadata: {
              stageId,
              sourceId,
            },
          });
          return;
        }
      }

      const sourceKey = `${sourceKind}:${sourceId}`;
      if (seenSourceKeys.has(sourceKey)) {
        pushBlendDiagnostic({
          code: "duplicate-blend-stage-source",
          message: `Blend stage "${stageId}" source "${sourceKey}" is duplicated and was ignored.`,
          path: sourcePath,
          metadata: {
            stageId,
            sourceKey,
          },
        });
        return;
      }

      seenSourceKeys.add(sourceKey);
      normalizedSources.push({
        kind: sourceKind,
        id: sourceId,
      });
    });

    if (normalizedSources.length === 0) {
      pushBlendDiagnostic({
        code: "empty-blend-stage",
        message: `Blend stage "${stageId}" has no valid sources and was ignored.`,
        path: stagePath,
        metadata: {
          stageId,
        },
      });
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
    pushBlendDiagnostic({
      code: "blend-stages-fallback",
      message:
        "Blend stages were provided but none were valid; compiler will use legacy cross-group compatibility blending.",
      path: "blendStages",
    });
    return undefined;
  }

  return normalizedStages;
}

function mapConfigToPoseIr(
  config: PoseRigConfigFile,
  standardInputs: StandardRigInput[],
  collector: DiagnosticCollector,
  options?: {
    defaultGroupBlendMode?: PoseBlendMode;
    crossGroupBlendMode?: PoseBlendMode;
    diagnosticSource?: "pose-config" | "pose-ir";
  },
): PoseRigIrFile {
  const canonicalInputs = new Set(standardInputs.map((input) => input.id));
  const diagnosticSource = options?.diagnosticSource ?? "pose-config";
  const sourcePoses = Array.isArray(config.poses) ? config.poses : [];
  const fallbackGroupBlendMode = options?.defaultGroupBlendMode ?? "average";
  const crossGroupPolicyMode = toPoseIrBlendMode(
    options?.crossGroupBlendMode ?? config.crossGroupBlendMode ?? "additive",
  );
  const neutralMode: PoseNeutralMode =
    config.neutralMode === "face-default" ? "face-default" : "explicit";
  const normalizedGroups = normalizePoseGroups(
    sourcePoses,
    config.poseGroups,
    fallbackGroupBlendMode,
  );

  const groupsById = new Map(
    normalizedGroups.map((group) => [group.id, group]),
  );
  const groupPoseIds = new Map<string, string[]>();
  const poseOrder = new Map<string, number>();

  const poses = sourcePoses.map((pose, index) => {
    poseOrder.set(pose.id, index);
    const membership = resolvePoseMembership(pose, normalizedGroups);
    let groupIds = membership.groupIds;
    if (groupIds.length === 0) {
      const fallbackPath = DEFAULT_GROUP_PATH;
      const fallbackId = sanitizePoseGroupId(null, fallbackPath);
      if (!groupsById.has(fallbackId)) {
        const fallbackGroup: PoseGroupDefinition = {
          id: fallbackId,
          path: fallbackPath,
          name: humanizePoseGroupName(fallbackPath),
          blendMode: fallbackGroupBlendMode,
        };
        groupsById.set(fallbackId, fallbackGroup);
        normalizedGroups.push(fallbackGroup);
      }
      groupIds = [fallbackId];
    }

    if (groupIds.length > 1) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "multi-group-membership",
        source: diagnosticSource,
        message: `Pose "${pose.name ?? pose.id}" belongs to multiple groups (${groupIds.length}); cross-group "${crossGroupPolicyMode}" may amplify influence depending blend topology.`,
        location: {
          poseId: pose.id,
        },
        metadata: {
          poseId: pose.id,
          groupIds: [...groupIds],
          crossGroupPolicyMode,
        },
      });
    }

    groupIds.forEach((groupId) => {
      const list = groupPoseIds.get(groupId) ?? [];
      if (!list.includes(pose.id)) {
        list.push(pose.id);
      }
      groupPoseIds.set(groupId, list);

      if (!groupsById.has(groupId)) {
        const groupPath =
          membership.groupPathsById[groupId] ??
          normalizePoseGroupPath(groupId) ??
          DEFAULT_GROUP_PATH;
        const synthesized: PoseGroupDefinition = {
          id: sanitizePoseGroupId(groupId, groupPath),
          path: groupPath,
          name: humanizePoseGroupName(groupPath),
          blendMode: fallbackGroupBlendMode,
        };
        groupsById.set(synthesized.id, synthesized);
        normalizedGroups.push(synthesized);
      }
    });

    const targets = canonicalizeInputValues(
      pose.values,
      canonicalInputs,
      collector,
      `Pose "${pose.name ?? pose.id}"`,
      diagnosticSource,
    );

    return {
      id: pose.id,
      name: pose.name,
      description: pose.description,
      groupIds,
      targets,
      createdAt: pose.createdAt ?? new Date().toISOString(),
      updatedAt: pose.updatedAt ?? new Date().toISOString(),
    };
  });

  const groups = normalizedGroups.map((group) => ({
    id: group.id,
    name: group.name,
    path: group.path,
    intraGroupBlendMode: toPoseIrBlendMode(group.blendMode),
    poseIds: (groupPoseIds.get(group.id) ?? []).sort((leftId, rightId) => {
      const leftOrder = poseOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = poseOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return leftId.localeCompare(rightId);
    }),
  }));
  const blendStages = normalizeBlendStages(
    config.blendStages,
    groups.map((group) => group.id),
    crossGroupPolicyMode,
    collector,
    diagnosticSource,
  );

  const neutralValues = canonicalizeInputValues(
    config.neutralInputs,
    canonicalInputs,
    collector,
    "Neutral",
    diagnosticSource,
  );

  if (neutralMode === "explicit" && canonicalInputs.size > 0) {
    const requiredNeutralIds = new Set<string>();
    poses.forEach((pose) => {
      Object.keys(pose.targets).forEach((inputId) => {
        requiredNeutralIds.add(inputId);
      });
    });
    const missingNeutralIds = Array.from(requiredNeutralIds)
      .filter((inputId) => neutralValues[inputId] === undefined)
      .sort();
    if (missingNeutralIds.length > 0) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "implicit-neutral-fallback",
        source: diagnosticSource,
        message: `Neutral mode is explicit but ${missingNeutralIds.length} target channel(s) are missing neutral values; compiler will fallback to face defaults for those channels.`,
        metadata: {
          neutralMode,
          missingNeutralIds,
        },
      });
    }
  }

  return {
    version: POSE_RIG_IR_VERSION,
    faceId: config.faceId ?? null,
    rigKind: config.rigKind ?? "face-specific",
    title: config.title,
    description: config.description,
    contracts: {
      targetIds: POSE_IR_TARGETING_CONTRACT,
      syntheticNodes: POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
    },
    neutral: {
      mode: neutralMode,
      values: neutralValues,
    },
    groups,
    crossGroupPolicy: {
      mode: crossGroupPolicyMode,
    },
    blendStages,
    poses,
    lowLevel: config.lowLevel ?? null,
    metadata: config.metadata,
    standardInputSchema: config.standardInputSchema,
  };
}

function mapPoseIrToConfig(ir: PoseRigIrFile): PoseRigConfigFile {
  const groups = Array.isArray(ir.groups) ? ir.groups : [];
  const groupById = new Map(groups.map((group) => [group.id, group]));

  const poses = (Array.isArray(ir.poses) ? ir.poses : []).map((pose) => {
    const orderedGroupIds = Array.from(
      new Set((pose.groupIds ?? []).map((groupId) => groupId.trim())),
    ).filter((groupId) => groupId.length > 0);
    const primaryGroupId = orderedGroupIds[0] ?? null;
    const primaryGroupPath = primaryGroupId
      ? (groupById.get(primaryGroupId)?.path ?? null)
      : null;

    return {
      id: pose.id,
      name: pose.name,
      description: pose.description,
      groupIds: orderedGroupIds,
      groupId: primaryGroupId,
      group: primaryGroupPath,
      values: { ...pose.targets },
      createdAt: pose.createdAt,
      updatedAt: pose.updatedAt,
    };
  });

  return {
    version: 1,
    faceId: ir.faceId ?? null,
    rigKind: ir.rigKind ?? "face-specific",
    title: ir.title,
    description: ir.description,
    poseGroups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      path: group.path,
      blendMode: toPoseConfigBlendMode(group.intraGroupBlendMode),
    })),
    crossGroupBlendMode: toPoseConfigBlendMode(ir.crossGroupPolicy?.mode),
    blendStages: cloneBlendStages(ir.blendStages),
    neutralMode: ir.neutral?.mode ?? "explicit",
    neutralInputs: { ...(ir.neutral?.values ?? {}) },
    poses,
    lowLevel: ir.lowLevel ?? null,
    metadata: ir.metadata,
    standardInputSchema: ir.standardInputSchema,
  };
}

export const PoseIrService = {
  fromConfig(
    config: PoseRigConfigFile,
    standardInputs: StandardRigInput[] = [],
    currentFaceId: string | null = null,
    options?: {
      defaultGroupBlendMode?: PoseBlendMode;
      crossGroupBlendMode?: PoseBlendMode;
      diagnosticSource?: "pose-config" | "pose-ir";
    },
  ): PoseIrCompileResult {
    const collector = createDiagnosticCollector();
    const diagnosticSource = options?.diagnosticSource ?? "pose-config";
    const importedFaceId = config.faceId;
    if (currentFaceId && importedFaceId && importedFaceId !== currentFaceId) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "face-id-mismatch",
        source: diagnosticSource,
        message: `Imported pose rig targets face "${importedFaceId}", current face "${currentFaceId}".`,
        metadata: {
          importedFaceId,
          currentFaceId,
        },
      });
    }

    const ir = mapConfigToPoseIr(config, standardInputs, collector, options);
    return {
      ir,
      warnings: collector.warnings,
      diagnostics: collector.diagnostics,
    };
  },

  normalize(
    payload: unknown,
    standardInputs: StandardRigInput[] = [],
    currentFaceId: string | null = null,
  ): PoseIrCompileResult {
    if (!payload || typeof payload !== "object") {
      throw createPoseIrServiceError("Invalid pose IR payload.", {
        severity: "error",
        code: "invalid-payload",
        source: "pose-ir",
        message: "Invalid pose IR payload.",
      });
    }

    if (
      "neutralInputs" in payload &&
      !(
        "neutral" in payload &&
        (payload as { neutral?: unknown }).neutral !== undefined
      )
    ) {
      return this.fromConfig(
        payload as PoseRigConfigFile,
        standardInputs,
        currentFaceId,
      );
    }

    const candidate = payload as Partial<PoseRigIrFile> & {
      crossGroupBlendMode?: unknown;
      neutralInputs?: Record<string, number>;
      neutralMode?: PoseNeutralMode;
    };

    if (candidate.version !== POSE_RIG_IR_VERSION) {
      throw createPoseIrServiceError(
        `Unsupported pose rig IR version: ${candidate.version ?? "unknown"}.`,
        {
          severity: "error",
          code: "unsupported-ir-version",
          source: "pose-ir",
          message: `Unsupported pose rig IR version: ${candidate.version ?? "unknown"}.`,
        },
      );
    }

    const now = new Date().toISOString();
    const groups = Array.isArray(candidate.groups) ? candidate.groups : [];
    const membershipByPoseId = new Map<string, string[]>();
    groups.forEach((group) => {
      if (!group || typeof group !== "object") {
        return;
      }
      (group.poseIds ?? []).forEach((poseId) => {
        const list = membershipByPoseId.get(poseId) ?? [];
        list.push(group.id);
        membershipByPoseId.set(poseId, list);
      });
    });

    const configLike: PoseRigConfigFile = {
      version: 1,
      faceId: candidate.faceId ?? null,
      rigKind: candidate.rigKind ?? "face-specific",
      title: candidate.title,
      description: candidate.description,
      neutralMode:
        candidate.neutral?.mode === "face-default" ||
        candidate.neutralMode === "face-default"
          ? "face-default"
          : "explicit",
      neutralInputs: {
        ...(candidate.neutral?.values ?? candidate.neutralInputs ?? {}),
      },
      poseGroups: groups.map((group) => ({
        id: group.id,
        name: group.name,
        path: group.path,
        blendMode: toPoseConfigBlendMode(group.intraGroupBlendMode),
      })),
      crossGroupBlendMode: toPoseConfigBlendMode(
        candidate.crossGroupPolicy?.mode ?? candidate.crossGroupBlendMode,
      ),
      blendStages: cloneBlendStages(candidate.blendStages),
      poses: (Array.isArray(candidate.poses) ? candidate.poses : []).map(
        (pose) => {
          const fallbackGroupIds = membershipByPoseId.get(pose.id) ?? [];
          const groupIds =
            pose.groupIds && pose.groupIds.length > 0
              ? pose.groupIds
              : fallbackGroupIds;
          return {
            id: pose.id,
            name: pose.name,
            description: pose.description,
            groupIds,
            values: {
              ...(pose.targets as Record<string, number> | undefined),
            },
            createdAt: pose.createdAt ?? now,
            updatedAt: pose.updatedAt ?? now,
          };
        },
      ),
      lowLevel: candidate.lowLevel ?? null,
      metadata: candidate.metadata,
      standardInputSchema: candidate.standardInputSchema,
    };

    return this.fromConfig(configLike, standardInputs, currentFaceId, {
      diagnosticSource: "pose-ir",
    });
  },

  toConfig(ir: PoseRigIrFile): PoseRigConfigFile {
    return mapPoseIrToConfig(ir);
  },

  serialize(ir: PoseRigIrFile): string {
    return JSON.stringify(ir, null, 2);
  },
};
