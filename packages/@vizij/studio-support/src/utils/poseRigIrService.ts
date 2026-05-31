import type { StandardRigInput } from "@vizij/utils";
import type {
  PoseDiagnostic,
  PoseDiagnosticLocation,
  PoseBlendMode,
  PoseCrossGroupChannelOverride,
  PoseDefinition,
  PoseGroupDefinition,
  PoseIrCompileResult,
  PoseIrBlendMode,
  PoseIrCrossGroupChannelOverride,
  PoseIrBlendStageDefinition,
  PoseIrStageSource,
  PoseInputComposeMode,
  PosePriorityTieBreak,
  PoseNeutralMode,
  PoseScopedNeutralDefinition,
  PoseScopedNeutralSourceType,
  PoseRigConfigFile,
  PoseRigIrFile,
} from "../types/poseRig";
import {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
  POSE_RIG_IR_VERSION,
} from "../types/poseRig";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  resolvePoseMembership,
  sanitizePoseGroupId,
} from "./poseRigGroupMembership";

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

function toPoseIrCrossGroupOverrideMode(
  value: unknown,
  fallbackMode: PoseIrBlendMode,
): PoseIrCrossGroupChannelOverride["mode"] {
  if (value === "priority") {
    return "priority";
  }
  if (value === "add" || value === "additive") {
    return "add";
  }
  if (value === "average") {
    return "average";
  }
  return fallbackMode;
}

function toPoseConfigCrossGroupOverrideMode(
  value: unknown,
): PoseCrossGroupChannelOverride["mode"] {
  if (value === "priority") {
    return "priority";
  }
  return value === "add" || value === "additive" ? "additive" : "average";
}

function cloneConfigCrossGroupChannelOverrides(
  overrides: PoseRigConfigFile["crossGroupChannelOverrides"] | undefined,
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
  const cloned = entries.map(([inputId, override]) => {
    if (!override) {
      return null;
    }
    return [
      inputId,
      {
        mode: override.mode,
        ...(override.tieBreak ? { tieBreak: override.tieBreak } : {}),
        ...(override.priorityOrder && override.priorityOrder.length > 0
          ? { priorityOrder: [...override.priorityOrder] }
          : {}),
      } satisfies PoseCrossGroupChannelOverride,
    ] as const;
  });
  const filtered = cloned.filter(
    (entry): entry is readonly [string, PoseCrossGroupChannelOverride] =>
      entry !== null,
  );
  if (filtered.length === 0) {
    return undefined;
  }
  return Object.fromEntries(filtered);
}

function cloneIrCrossGroupChannelOverrides(
  overrides: PoseRigIrFile["crossGroupPolicy"]["overrides"] | undefined,
): PoseRigIrFile["crossGroupPolicy"]["overrides"] | undefined {
  if (!overrides) {
    return undefined;
  }
  const entries = Object.entries(overrides).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) {
    return undefined;
  }
  const cloned = entries.map(([inputId, override]) => {
    if (!override) {
      return null;
    }
    return [
      inputId,
      {
        mode: override.mode,
        ...(override.tieBreak ? { tieBreak: override.tieBreak } : {}),
        ...(override.priorityOrder && override.priorityOrder.length > 0
          ? { priorityOrder: [...override.priorityOrder] }
          : {}),
      } satisfies PoseIrCrossGroupChannelOverride,
    ] as const;
  });
  const filtered = cloned.filter(
    (entry): entry is readonly [string, PoseIrCrossGroupChannelOverride] =>
      entry !== null,
  );
  if (filtered.length === 0) {
    return undefined;
  }
  return Object.fromEntries(filtered);
}

function mapIrOverridesToConfig(
  overrides: unknown,
): PoseRigConfigFile["crossGroupChannelOverrides"] | undefined {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return undefined;
  }
  const mappedEntries = Object.entries(overrides as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([inputId, override]) => {
      if (
        !override ||
        typeof override !== "object" ||
        Array.isArray(override)
      ) {
        return null;
      }
      const modeCandidate = (override as { mode?: unknown }).mode;
      const tieBreakCandidate = (override as { tieBreak?: unknown }).tieBreak;
      const tieBreak =
        tieBreakCandidate === "group-order" || tieBreakCandidate === "group-id"
          ? tieBreakCandidate
          : undefined;
      const priorityOrderCandidate = (override as { priorityOrder?: unknown })
        .priorityOrder;
      const priorityOrder = Array.isArray(priorityOrderCandidate)
        ? priorityOrderCandidate.filter(
            (groupId): groupId is string =>
              typeof groupId === "string" && groupId.trim().length > 0,
          )
        : undefined;
      return [
        inputId,
        {
          mode: toPoseConfigCrossGroupOverrideMode(modeCandidate),
          ...(tieBreak ? { tieBreak } : {}),
          ...(priorityOrder && priorityOrder.length > 0
            ? { priorityOrder: [...priorityOrder] }
            : {}),
        } satisfies PoseCrossGroupChannelOverride,
      ] as const;
    })
    .filter(
      (entry): entry is readonly [string, PoseCrossGroupChannelOverride] =>
        entry !== null,
    );
  if (mappedEntries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(mappedEntries);
}

function cloneScopedNeutral(
  neutral: PoseScopedNeutralDefinition | undefined,
): PoseScopedNeutralDefinition | undefined {
  if (!neutral) {
    return undefined;
  }
  if (neutral.sourceType === "inherit") {
    return { sourceType: "inherit" };
  }
  if (neutral.sourceType === "pose-reference") {
    return {
      sourceType: "pose-reference",
      poseId: neutral.poseId,
    };
  }
  return {
    sourceType: "direct-values",
    values: { ...neutral.values },
  };
}

function clonePoseComposeModes(
  composeModes: PoseDefinition["composeModes"] | undefined,
): Record<string, PoseInputComposeMode> | undefined {
  if (!composeModes) {
    return undefined;
  }
  const entries = Object.entries(composeModes).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) {
    return undefined;
  }
  const filtered: Array<[string, PoseInputComposeMode]> = [];
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
      ...(group.neutral !== undefined
        ? {
            neutral: (group as { neutral?: PoseScopedNeutralDefinition })
              .neutral,
          }
        : {}),
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

function canonicalizePoseComposeModes(
  composeModes: Record<string, unknown> | null | undefined,
  params: {
    canonicalInputs: Set<string>;
    targetInputIds: Set<string>;
    collector: DiagnosticCollector;
    context: string;
    source: "pose-config" | "pose-ir";
  },
): Record<string, PoseInputComposeMode> | undefined {
  if (!composeModes) {
    return undefined;
  }
  const { canonicalInputs, targetInputIds, collector, context, source } =
    params;
  const normalized: Record<string, PoseInputComposeMode> = {};

  Object.entries(composeModes).forEach(([inputId, rawMode]) => {
    if (isSyntheticPoseChannelId(inputId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "ghost-compose-mode-input-id",
        source,
        message: `${context} compose mode "${inputId}" ignored because synthetic pose channels are graph-internal only.`,
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
        code: "non-canonical-compose-mode-input-id",
        source,
        message: `${context} compose mode "${inputId}" ignored because it is not a canonical standard input id.`,
        location: {
          inputId,
        },
        metadata: {
          context,
        },
      });
      return;
    }
    if (!targetInputIds.has(inputId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "compose-mode-without-target",
        source,
        message: `${context} compose mode "${inputId}" ignored because the pose does not target that channel.`,
        location: {
          inputId,
        },
        metadata: {
          context,
        },
      });
      return;
    }

    const mode: PoseInputComposeMode =
      rawMode === "add" || rawMode === "average" ? rawMode : "add";
    if (rawMode !== "add" && rawMode !== "average") {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "invalid-compose-mode",
        source,
        message: `${context} compose mode "${inputId}" value "${String(rawMode)}" is invalid; using "add".`,
        location: {
          inputId,
        },
        metadata: {
          context,
          rawMode,
        },
      });
    }
    normalized[inputId] = mode;
  });

  return clonePoseComposeModes(normalized);
}

function normalizeScopedNeutralForIr(
  scopedNeutral: unknown,
  params: {
    collector: DiagnosticCollector;
    source: "pose-config" | "pose-ir";
    path: string;
    scopeLabel: string;
    scopeId: string;
    knownPoseIds: Set<string>;
    canonicalInputs: Set<string>;
  },
): PoseScopedNeutralDefinition | undefined {
  const {
    collector,
    source,
    path,
    scopeLabel,
    scopeId,
    knownPoseIds,
    canonicalInputs,
  } = params;

  if (scopedNeutral === undefined || scopedNeutral === null) {
    return undefined;
  }

  if (
    !scopedNeutral ||
    typeof scopedNeutral !== "object" ||
    Array.isArray(scopedNeutral)
  ) {
    pushPoseDiagnostic(collector, {
      severity: "warning",
      source,
      code: "invalid-scoped-neutral-payload",
      message: `${scopeLabel} "${scopeId}" neutral was ignored because payload is not an object.`,
      location: {
        path,
      },
      metadata: {
        scopeId,
      },
    });
    return undefined;
  }

  const scopedNeutralPayload = scopedNeutral as {
    sourceType?: unknown;
    type?: unknown;
    poseId?: unknown;
    values?: unknown;
  };
  const sourceTypeCandidate =
    scopedNeutralPayload.sourceType ?? scopedNeutralPayload.type ?? null;
  const sourceType: PoseScopedNeutralSourceType | null =
    sourceTypeCandidate === "inherit" ||
    sourceTypeCandidate === "pose-reference" ||
    sourceTypeCandidate === "direct-values"
      ? sourceTypeCandidate
      : null;
  if (!sourceType) {
    pushPoseDiagnostic(collector, {
      severity: "warning",
      source,
      code: "invalid-scoped-neutral-source-type",
      message: `${scopeLabel} "${scopeId}" neutral source type "${String(sourceTypeCandidate)}" is invalid and was ignored.`,
      location: {
        path: `${path}.sourceType`,
      },
      metadata: {
        scopeId,
        sourceType: sourceTypeCandidate,
      },
    });
    return undefined;
  }

  if (sourceType === "inherit") {
    return { sourceType: "inherit" };
  }

  if (sourceType === "pose-reference") {
    const poseId =
      typeof scopedNeutralPayload.poseId === "string"
        ? scopedNeutralPayload.poseId.trim()
        : "";
    if (!poseId) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "missing-scoped-neutral-pose-reference",
        message: `${scopeLabel} "${scopeId}" neutral pose-reference is missing poseId and was ignored.`,
        location: {
          path: `${path}.poseId`,
        },
        metadata: {
          scopeId,
        },
      });
      return undefined;
    }
    if (knownPoseIds.size > 0 && !knownPoseIds.has(poseId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "unknown-scoped-neutral-pose-reference",
        message: `${scopeLabel} "${scopeId}" neutral references unknown pose "${poseId}" and was ignored.`,
        location: {
          poseId,
          path: `${path}.poseId`,
        },
        metadata: {
          scopeId,
          poseId,
        },
      });
      return undefined;
    }
    return {
      sourceType: "pose-reference",
      poseId,
    };
  }

  if (
    !scopedNeutralPayload.values ||
    typeof scopedNeutralPayload.values !== "object" ||
    Array.isArray(scopedNeutralPayload.values)
  ) {
    pushPoseDiagnostic(collector, {
      severity: "warning",
      source,
      code: "invalid-scoped-neutral-direct-values-shape",
      message: `${scopeLabel} "${scopeId}" neutral direct-values payload is invalid and was ignored.`,
      location: {
        path: `${path}.values`,
      },
      metadata: {
        scopeId,
      },
    });
    return undefined;
  }

  return {
    sourceType: "direct-values",
    values: canonicalizeInputValues(
      scopedNeutralPayload.values as Record<string, number>,
      canonicalInputs,
      collector,
      `${scopeLabel} "${scopeId}" neutral`,
      source,
    ),
  };
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
    ...(stage.neutral ? { neutral: cloneScopedNeutral(stage.neutral) } : {}),
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
  options: {
    knownPoseIds: Set<string>;
    canonicalInputs: Set<string>;
  },
): PoseIrBlendStageDefinition[] | undefined {
  const { knownPoseIds, canonicalInputs } = options;
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
    const stageNeutral = normalizeScopedNeutralForIr(
      (stage as { neutral?: unknown }).neutral,
      {
        collector,
        source,
        path: `${stagePath}.neutral`,
        scopeLabel: "Blend stage",
        scopeId: stageId,
        knownPoseIds,
        canonicalInputs,
      },
    );
    normalizedStages.push({
      id: stageId,
      name: stageName,
      mode: stageMode,
      ...(stageNeutral ? { neutral: stageNeutral } : {}),
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

function collectGroupTargetChannels(
  groups: PoseRigIrFile["groups"],
  poseTargetChannelsById: Map<string, Set<string>>,
): Map<string, string[]> {
  const channelsByGroupId = new Map<string, string[]>();
  groups.forEach((group) => {
    const channelIds = new Set<string>();
    group.poseIds.forEach((poseId) => {
      poseTargetChannelsById.get(poseId)?.forEach((inputId) => {
        channelIds.add(inputId);
      });
    });
    channelsByGroupId.set(group.id, Array.from(channelIds).sort());
  });
  return channelsByGroupId;
}

function collectStageTargetChannels(
  blendStages: PoseIrBlendStageDefinition[] | undefined,
  groupTargetChannelsById: Map<string, string[]>,
): Map<string, string[]> {
  const channelsByStageId = new Map<string, string[]>();
  (blendStages ?? []).forEach((stage) => {
    const channelIds = new Set<string>();
    stage.sources.forEach((source) => {
      if (source.kind === "group") {
        (groupTargetChannelsById.get(source.id) ?? []).forEach((inputId) => {
          channelIds.add(inputId);
        });
        return;
      }
      (channelsByStageId.get(source.id) ?? []).forEach((inputId) => {
        channelIds.add(inputId);
      });
    });
    channelsByStageId.set(stage.id, Array.from(channelIds).sort());
  });
  return channelsByStageId;
}

function emitScopedNeutralCoverageDiagnostics(options: {
  collector: DiagnosticCollector;
  source: "pose-config" | "pose-ir";
  groups: PoseRigIrFile["groups"];
  blendStages: PoseIrBlendStageDefinition[] | undefined;
  poses: PoseRigIrFile["poses"];
}): void {
  const { collector, source, groups, blendStages, poses } = options;
  const poseTargetChannelsById = new Map<string, Set<string>>();
  poses.forEach((pose) => {
    poseTargetChannelsById.set(pose.id, new Set(Object.keys(pose.targets)));
  });
  const groupTargetChannelsById = collectGroupTargetChannels(
    groups,
    poseTargetChannelsById,
  );
  const stageTargetChannelsById = collectStageTargetChannels(
    blendStages,
    groupTargetChannelsById,
  );

  const pushCoverageDiagnostic = (params: {
    scopeLabel: "Pose group" | "Blend stage";
    scopeId: string;
    neutral: PoseScopedNeutralDefinition;
    targetInputIds: string[];
    missingInputIds: string[];
    path: string;
  }) => {
    const {
      scopeLabel,
      scopeId,
      neutral,
      targetInputIds,
      missingInputIds,
      path,
    } = params;
    if (missingInputIds.length === 0) {
      return;
    }
    if (neutral.sourceType === "pose-reference") {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "scoped-neutral-pose-reference-partial-coverage",
        message: `${scopeLabel} "${scopeId}" neutral pose-reference "${neutral.poseId}" does not define ${missingInputIds.length} scoped target channel(s); missing channels fallback to lower neutral layers.`,
        location: {
          poseId: neutral.poseId,
          path: `${path}.poseId`,
        },
        metadata: {
          scopeId,
          targetInputIds,
          missingInputIds,
          poseId: neutral.poseId,
        },
      });
      return;
    }
    pushPoseDiagnostic(collector, {
      severity: "warning",
      source,
      code: "scoped-neutral-direct-values-partial-coverage",
      message: `${scopeLabel} "${scopeId}" neutral direct-values omit ${missingInputIds.length} scoped target channel(s); missing channels fallback to lower neutral layers.`,
      location: {
        path: `${path}.values`,
      },
      metadata: {
        scopeId,
        targetInputIds,
        missingInputIds,
      },
    });
  };

  groups.forEach((group, groupIndex) => {
    const scopedNeutral = group.neutral;
    if (
      !scopedNeutral ||
      scopedNeutral.sourceType === "inherit" ||
      !groupTargetChannelsById.has(group.id)
    ) {
      return;
    }
    const targetInputIds = groupTargetChannelsById.get(group.id) ?? [];
    if (targetInputIds.length === 0) {
      return;
    }
    const missingInputIds =
      scopedNeutral.sourceType === "pose-reference"
        ? targetInputIds.filter(
            (inputId) =>
              !poseTargetChannelsById.get(scopedNeutral.poseId)?.has(inputId),
          )
        : targetInputIds.filter(
            (inputId) => scopedNeutral.values[inputId] === undefined,
          );
    pushCoverageDiagnostic({
      scopeLabel: "Pose group",
      scopeId: group.id,
      neutral: scopedNeutral,
      targetInputIds,
      missingInputIds,
      path:
        source === "pose-config"
          ? `poseGroups[${groupIndex}].neutral`
          : `groups[${groupIndex}].neutral`,
    });
  });

  (blendStages ?? []).forEach((stage, stageIndex) => {
    const scopedNeutral = stage.neutral;
    if (
      !scopedNeutral ||
      scopedNeutral.sourceType === "inherit" ||
      !stageTargetChannelsById.has(stage.id)
    ) {
      return;
    }
    const targetInputIds = stageTargetChannelsById.get(stage.id) ?? [];
    if (targetInputIds.length === 0) {
      return;
    }
    const missingInputIds =
      scopedNeutral.sourceType === "pose-reference"
        ? targetInputIds.filter(
            (inputId) =>
              !poseTargetChannelsById.get(scopedNeutral.poseId)?.has(inputId),
          )
        : targetInputIds.filter(
            (inputId) => scopedNeutral.values[inputId] === undefined,
          );
    pushCoverageDiagnostic({
      scopeLabel: "Blend stage",
      scopeId: stage.id,
      neutral: scopedNeutral,
      targetInputIds,
      missingInputIds,
      path: `blendStages[${stageIndex}].neutral`,
    });
  });
}

function normalizeOverrideTieBreak(
  tieBreak: unknown,
  collector: DiagnosticCollector,
  source: "pose-config" | "pose-ir",
  inputId: string,
): PosePriorityTieBreak {
  if (tieBreak === undefined || tieBreak === null) {
    return "group-order";
  }
  if (tieBreak === "group-order" || tieBreak === "group-id") {
    return tieBreak;
  }
  pushPoseDiagnostic(collector, {
    severity: "warning",
    source,
    code: "invalid-cross-group-override-tie-break",
    message: `Cross-group override for "${inputId}" has invalid tieBreak "${String(tieBreak)}"; using "group-order".`,
    location: {
      inputId,
      path:
        source === "pose-config"
          ? `crossGroupChannelOverrides.${inputId}.tieBreak`
          : `crossGroupPolicy.overrides.${inputId}.tieBreak`,
    },
    metadata: {
      inputId,
      tieBreak,
      fallback: "group-order",
    },
  });
  return "group-order";
}

function normalizeCrossGroupChannelOverridesForIr(
  overrides: unknown,
  options: {
    canonicalInputs: Set<string>;
    groupIds: string[];
    fallbackMode: PoseIrBlendMode;
    collector: DiagnosticCollector;
    source: "pose-config" | "pose-ir";
  },
): PoseRigIrFile["crossGroupPolicy"]["overrides"] | undefined {
  const { canonicalInputs, groupIds, fallbackMode, collector, source } =
    options;
  if (overrides === undefined || overrides === null) {
    return undefined;
  }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    pushPoseDiagnostic(collector, {
      severity: "warning",
      source,
      code: "invalid-cross-group-overrides-payload",
      message:
        "Cross-group channel overrides were ignored because payload is not an object map.",
      location: {
        path:
          source === "pose-config"
            ? "crossGroupChannelOverrides"
            : "crossGroupPolicy.overrides",
      },
    });
    return undefined;
  }

  const knownGroupIds = new Set(groupIds);
  const normalizedEntries = new Map<string, PoseIrCrossGroupChannelOverride>();
  const rawEntries = Object.entries(overrides as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );

  rawEntries.forEach(([rawInputId, overridePayload]) => {
    const inputId = rawInputId.trim();
    if (!inputId) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "invalid-cross-group-override-input-id",
        message:
          "Cross-group channel override entry with an empty input id was ignored.",
        location: {
          path:
            source === "pose-config"
              ? "crossGroupChannelOverrides"
              : "crossGroupPolicy.overrides",
        },
      });
      return;
    }

    if (isSyntheticPoseChannelId(inputId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "ghost-cross-group-override-input-id",
        message: `Cross-group override for "${inputId}" ignored because synthetic pose channels are graph-internal only.`,
        location: {
          inputId,
          path:
            source === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}`
              : `crossGroupPolicy.overrides.${inputId}`,
        },
      });
      return;
    }

    if (canonicalInputs.size > 0 && !canonicalInputs.has(inputId)) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "non-canonical-cross-group-override-input-id",
        message: `Cross-group override for "${inputId}" ignored because it is not a canonical standard input id.`,
        location: {
          inputId,
          path:
            source === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}`
              : `crossGroupPolicy.overrides.${inputId}`,
        },
      });
      return;
    }

    if (
      !overridePayload ||
      typeof overridePayload !== "object" ||
      Array.isArray(overridePayload)
    ) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "invalid-cross-group-override-entry",
        message: `Cross-group override for "${inputId}" was ignored because it is not an object.`,
        location: {
          inputId,
          path:
            source === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}`
              : `crossGroupPolicy.overrides.${inputId}`,
        },
      });
      return;
    }

    const modeCandidate = (overridePayload as { mode?: unknown }).mode;
    const mode = toPoseIrCrossGroupOverrideMode(modeCandidate, fallbackMode);
    if (
      modeCandidate !== "average" &&
      modeCandidate !== "add" &&
      modeCandidate !== "additive" &&
      modeCandidate !== "priority"
    ) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "invalid-cross-group-override-mode",
        message: `Cross-group override for "${inputId}" mode "${String(modeCandidate)}" is invalid; using "${mode}".`,
        location: {
          inputId,
          path:
            source === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}.mode`
              : `crossGroupPolicy.overrides.${inputId}.mode`,
        },
        metadata: {
          inputId,
          modeCandidate,
          fallbackMode: mode,
        },
      });
    }

    const tieBreak = normalizeOverrideTieBreak(
      (overridePayload as { tieBreak?: unknown }).tieBreak,
      collector,
      source,
      inputId,
    );

    const priorityOrderCandidate = (
      overridePayload as { priorityOrder?: unknown }
    ).priorityOrder;
    let priorityOrder: string[] | undefined;
    if (
      priorityOrderCandidate !== undefined &&
      !Array.isArray(priorityOrderCandidate)
    ) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "invalid-cross-group-override-priority-order",
        message: `Cross-group override for "${inputId}" has invalid priorityOrder and it was ignored.`,
        location: {
          inputId,
          path:
            source === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}.priorityOrder`
              : `crossGroupPolicy.overrides.${inputId}.priorityOrder`,
        },
      });
    } else if (Array.isArray(priorityOrderCandidate)) {
      const seenGroups = new Set<string>();
      const normalizedPriorityOrder: string[] = [];
      priorityOrderCandidate.forEach((groupId) => {
        if (typeof groupId !== "string" || groupId.trim().length === 0) {
          pushPoseDiagnostic(collector, {
            severity: "warning",
            source,
            code: "invalid-cross-group-override-priority-group-id",
            message: `Cross-group override for "${inputId}" contains an invalid priority group id and it was ignored.`,
            location: {
              inputId,
              path:
                source === "pose-config"
                  ? `crossGroupChannelOverrides.${inputId}.priorityOrder`
                  : `crossGroupPolicy.overrides.${inputId}.priorityOrder`,
            },
          });
          return;
        }
        const trimmedGroupId = groupId.trim();
        if (!knownGroupIds.has(trimmedGroupId)) {
          pushPoseDiagnostic(collector, {
            severity: "warning",
            source,
            code: "unknown-cross-group-override-priority-group-id",
            message: `Cross-group override for "${inputId}" references unknown priority group "${trimmedGroupId}" and it was ignored.`,
            location: {
              inputId,
              groupId: trimmedGroupId,
              path:
                source === "pose-config"
                  ? `crossGroupChannelOverrides.${inputId}.priorityOrder`
                  : `crossGroupPolicy.overrides.${inputId}.priorityOrder`,
            },
          });
          return;
        }
        if (seenGroups.has(trimmedGroupId)) {
          pushPoseDiagnostic(collector, {
            severity: "warning",
            source,
            code: "duplicate-cross-group-override-priority-group-id",
            message: `Cross-group override for "${inputId}" duplicated priority group "${trimmedGroupId}" and the duplicate was ignored.`,
            location: {
              inputId,
              groupId: trimmedGroupId,
              path:
                source === "pose-config"
                  ? `crossGroupChannelOverrides.${inputId}.priorityOrder`
                  : `crossGroupPolicy.overrides.${inputId}.priorityOrder`,
            },
          });
          return;
        }
        seenGroups.add(trimmedGroupId);
        normalizedPriorityOrder.push(trimmedGroupId);
      });
      if (normalizedPriorityOrder.length > 0) {
        priorityOrder = normalizedPriorityOrder;
      }
    }

    if (mode !== "priority" && priorityOrder && priorityOrder.length > 0) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        source,
        code: "unused-cross-group-override-priority-order",
        message: `Cross-group override for "${inputId}" provided priorityOrder but mode "${mode}" does not use it; dropping priorityOrder.`,
        location: {
          inputId,
          path:
            source === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}.priorityOrder`
              : `crossGroupPolicy.overrides.${inputId}.priorityOrder`,
        },
      });
      priorityOrder = undefined;
    }

    normalizedEntries.set(inputId, {
      mode,
      tieBreak,
      ...(priorityOrder ? { priorityOrder } : {}),
    });
  });

  if (normalizedEntries.size === 0) {
    return undefined;
  }
  return Object.fromEntries(normalizedEntries);
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
    const rawComposeModes =
      pose.composeModes &&
      typeof pose.composeModes === "object" &&
      !Array.isArray(pose.composeModes)
        ? (pose.composeModes as Record<string, unknown>)
        : null;
    if (pose.composeModes !== undefined && rawComposeModes === null) {
      pushPoseDiagnostic(collector, {
        severity: "warning",
        code: "invalid-compose-mode-map",
        source: diagnosticSource,
        message: `Pose "${pose.name ?? pose.id}" composeModes were ignored because payload is not an object map.`,
        location: {
          poseId: pose.id,
        },
      });
    }
    const composeModes = canonicalizePoseComposeModes(rawComposeModes, {
      canonicalInputs,
      targetInputIds: new Set(Object.keys(targets)),
      collector,
      context: `Pose "${pose.name ?? pose.id}"`,
      source: diagnosticSource,
    });

    return {
      id: pose.id,
      name: pose.name,
      description: pose.description,
      groupIds,
      targets,
      ...(composeModes ? { composeModes } : {}),
      createdAt: pose.createdAt ?? new Date().toISOString(),
      updatedAt: pose.updatedAt ?? new Date().toISOString(),
    };
  });
  const knownPoseIds = new Set(poses.map((pose) => pose.id));

  const groups = normalizedGroups.map((group, groupIndex) => {
    const scopedNeutral = normalizeScopedNeutralForIr(group.neutral, {
      collector,
      source: diagnosticSource,
      path:
        diagnosticSource === "pose-config"
          ? `poseGroups[${groupIndex}].neutral`
          : `groups[${groupIndex}].neutral`,
      scopeLabel: "Pose group",
      scopeId: group.id,
      knownPoseIds,
      canonicalInputs,
    });
    return {
      id: group.id,
      name: group.name,
      path: group.path,
      intraGroupBlendMode: toPoseIrBlendMode(group.blendMode),
      ...(scopedNeutral ? { neutral: scopedNeutral } : {}),
      poseIds: (groupPoseIds.get(group.id) ?? []).sort((leftId, rightId) => {
        const leftOrder = poseOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = poseOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        return leftId.localeCompare(rightId);
      }),
    };
  });
  const crossGroupOverrides = normalizeCrossGroupChannelOverridesForIr(
    config.crossGroupChannelOverrides,
    {
      canonicalInputs,
      groupIds: groups.map((group) => group.id),
      fallbackMode: crossGroupPolicyMode,
      collector,
      source: diagnosticSource,
    },
  );
  const blendStages = normalizeBlendStages(
    config.blendStages,
    groups.map((group) => group.id),
    crossGroupPolicyMode,
    collector,
    diagnosticSource,
    {
      knownPoseIds,
      canonicalInputs,
    },
  );
  emitScopedNeutralCoverageDiagnostics({
    collector,
    source: diagnosticSource,
    groups,
    blendStages,
    poses,
  });

  const overlapGroupIdsByInput = new Map<string, Set<string>>();
  poses.forEach((pose) => {
    const targetInputIds = Object.keys(pose.targets);
    if (targetInputIds.length === 0) {
      return;
    }
    targetInputIds.forEach((inputId) => {
      const groupIdsForInput = overlapGroupIdsByInput.get(inputId) ?? new Set();
      pose.groupIds.forEach((groupId) => {
        groupIdsForInput.add(groupId);
      });
      overlapGroupIdsByInput.set(inputId, groupIdsForInput);
    });
  });

  Object.entries(crossGroupOverrides ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([inputId, override]) => {
      if (!override || override.mode !== "priority") {
        return;
      }
      pushPoseDiagnostic(collector, {
        severity: "info",
        source: diagnosticSource,
        code: "priority-cross-group-override-applied",
        message: `Priority cross-group policy is active for channel "${inputId}".`,
        location: {
          inputId,
          path:
            diagnosticSource === "pose-config"
              ? `crossGroupChannelOverrides.${inputId}`
              : `crossGroupPolicy.overrides.${inputId}`,
        },
        metadata: {
          inputId,
          defaultMode: crossGroupPolicyMode,
          priorityOrder: override.priorityOrder ?? [],
          tieBreak: override.tieBreak ?? "group-order",
        },
      });

      const overlappingGroupIds = Array.from(
        overlapGroupIdsByInput.get(inputId) ?? [],
      ).sort();
      if (overlappingGroupIds.length > 1) {
        pushPoseDiagnostic(collector, {
          severity: "info",
          source: diagnosticSource,
          code: "priority-cross-group-override-resolution-change",
          message: `Priority cross-group policy for "${inputId}" overrides default "${crossGroupPolicyMode}" resolution across ${overlappingGroupIds.length} contributing groups.`,
          location: {
            inputId,
            path:
              diagnosticSource === "pose-config"
                ? `crossGroupChannelOverrides.${inputId}.mode`
                : `crossGroupPolicy.overrides.${inputId}.mode`,
          },
          metadata: {
            inputId,
            defaultMode: crossGroupPolicyMode,
            overridingMode: "priority",
            overlappingGroupIds,
            priorityOrder: override.priorityOrder ?? [],
            tieBreak: override.tieBreak ?? "group-order",
          },
        });
      }
    });

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
      overrides: cloneIrCrossGroupChannelOverrides(crossGroupOverrides),
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
    const composeModes = clonePoseComposeModes(pose.composeModes);

    return {
      id: pose.id,
      name: pose.name,
      description: pose.description,
      groupIds: orderedGroupIds,
      groupId: primaryGroupId,
      group: primaryGroupPath,
      values: { ...pose.targets },
      ...(composeModes ? { composeModes } : {}),
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
      ...(group.neutral ? { neutral: cloneScopedNeutral(group.neutral) } : {}),
    })),
    crossGroupBlendMode: toPoseConfigBlendMode(ir.crossGroupPolicy?.mode),
    crossGroupChannelOverrides: cloneConfigCrossGroupChannelOverrides(
      mapIrOverridesToConfig(ir.crossGroupPolicy?.overrides),
    ),
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
      crossGroupChannelOverrides?: unknown;
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
        ...(group && typeof group === "object" && "neutral" in group
          ? {
              neutral: (group as { neutral?: unknown }).neutral as
                | PoseScopedNeutralDefinition
                | undefined,
            }
          : {}),
      })),
      crossGroupBlendMode: toPoseConfigBlendMode(
        candidate.crossGroupPolicy?.mode ?? candidate.crossGroupBlendMode,
      ),
      crossGroupChannelOverrides: cloneConfigCrossGroupChannelOverrides(
        mapIrOverridesToConfig(
          candidate.crossGroupPolicy?.overrides ??
            candidate.crossGroupChannelOverrides,
        ),
      ),
      blendStages: Array.isArray(candidate.blendStages)
        ? (candidate.blendStages.map((stage) => {
            if (!stage || typeof stage !== "object") {
              return stage;
            }
            return { ...(stage as unknown as Record<string, unknown>) };
          }) as unknown as PoseRigConfigFile["blendStages"])
        : undefined,
      poses: (Array.isArray(candidate.poses) ? candidate.poses : []).map(
        (pose) => {
          const fallbackGroupIds = membershipByPoseId.get(pose.id) ?? [];
          const groupIds =
            pose.groupIds && pose.groupIds.length > 0
              ? pose.groupIds
              : fallbackGroupIds;
          const composeModes =
            pose.composeModes &&
            typeof pose.composeModes === "object" &&
            !Array.isArray(pose.composeModes)
              ? (pose.composeModes as Record<string, PoseInputComposeMode>)
              : undefined;
          return {
            id: pose.id,
            name: pose.name,
            description: pose.description,
            groupIds,
            values: {
              ...(pose.targets as Record<string, number> | undefined),
            },
            ...(composeModes ? { composeModes } : {}),
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
