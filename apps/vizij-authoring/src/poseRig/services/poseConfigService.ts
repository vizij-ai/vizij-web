import {
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import type {
  PoseRigConfigFile,
  LowLevelRigSummary,
  PoseDefinition,
  PoseCrossGroupChannelOverride,
  PoseGroupDefinition,
  PoseBlendMode,
  PoseIrBlendMode,
  PoseIrBlendStageDefinition,
  PoseIrStageSource,
  PosePriorityTieBreak,
  PoseNeutralMode,
  PoseInputComposeMode,
  PoseScopedNeutralDefinition,
  PoseScopedNeutralSourceType,
} from "../types";
import { POSE_RIG_CONFIG_VERSION } from "../types";
import {
  humanizePoseGroupName,
  normalizePoseGroupPath,
  resolvePoseMembership,
  sanitizePoseGroupId,
} from "../groupMembership";

type InputResolutionReason = "sourceId" | "path" | "normalized" | null;
type ResolveInputId = (rawKey: string) => {
  id: string | null;
  reason: InputResolutionReason;
};

interface ScopedNeutralNormalizationContext {
  scopeLabel: string;
  path: string;
}

type ScopedNeutralNormalizer = (
  neutral: unknown,
  context: ScopedNeutralNormalizationContext,
) => PoseScopedNeutralDefinition | undefined;

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

function clonePoseGroups(
  poseGroups: PoseGroupDefinition[],
): PoseGroupDefinition[] {
  return poseGroups.map((group) => ({
    id: group.id,
    path: group.path,
    name: group.name,
    blendMode: group.blendMode,
    ...(group.neutral ? { neutral: cloneScopedNeutral(group.neutral) } : {}),
  }));
}

function normalizeScopedNeutral(
  neutral: unknown,
  options: {
    scopeLabel: string;
    path: string;
    validInputIds: Set<string>;
    knownPoseIds: Set<string>;
    resolveInputId: ResolveInputId;
    pushWarning: (message: string) => void;
  },
): PoseScopedNeutralDefinition | undefined {
  const {
    scopeLabel,
    path,
    validInputIds,
    knownPoseIds,
    resolveInputId,
    pushWarning,
  } = options;
  if (neutral === undefined || neutral === null) {
    return undefined;
  }
  if (!neutral || typeof neutral !== "object" || Array.isArray(neutral)) {
    pushWarning(
      `${scopeLabel} neutral at "${path}" was ignored because payload is not an object.`,
    );
    return undefined;
  }

  const neutralPayload = neutral as {
    sourceType?: unknown;
    type?: unknown;
    poseId?: unknown;
    values?: unknown;
  };
  const sourceTypeCandidate =
    neutralPayload.sourceType ?? neutralPayload.type ?? null;
  const sourceType: PoseScopedNeutralSourceType | null =
    sourceTypeCandidate === "inherit" ||
    sourceTypeCandidate === "pose-reference" ||
    sourceTypeCandidate === "direct-values"
      ? sourceTypeCandidate
      : null;
  if (!sourceType) {
    pushWarning(
      `${scopeLabel} neutral at "${path}" has invalid source type "${String(sourceTypeCandidate)}" and was ignored.`,
    );
    return undefined;
  }

  if (sourceType === "inherit") {
    return { sourceType: "inherit" };
  }

  if (sourceType === "pose-reference") {
    const poseId =
      typeof neutralPayload.poseId === "string"
        ? neutralPayload.poseId.trim()
        : "";
    if (!poseId) {
      pushWarning(
        `${scopeLabel} neutral at "${path}" is missing poseId and was ignored.`,
      );
      return undefined;
    }
    if (knownPoseIds.size > 0 && !knownPoseIds.has(poseId)) {
      pushWarning(
        `${scopeLabel} neutral at "${path}" references unknown pose "${poseId}" and was ignored.`,
      );
      return undefined;
    }
    return {
      sourceType: "pose-reference",
      poseId,
    };
  }

  if (
    !neutralPayload.values ||
    typeof neutralPayload.values !== "object" ||
    Array.isArray(neutralPayload.values)
  ) {
    pushWarning(
      `${scopeLabel} neutral at "${path}" direct values are invalid and were ignored.`,
    );
    return undefined;
  }

  const values: Record<string, number> = {};
  const valueSourcesByResolvedId = new Map<string, string>();
  Object.entries(neutralPayload.values as Record<string, unknown>).forEach(
    ([key, rawValue]) => {
      if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
        pushWarning(
          `${scopeLabel} neutral at "${path}" input "${key}" ignored invalid value.`,
        );
        return;
      }

      if (validInputIds.size === 0) {
        values[key] = rawValue;
        return;
      }

      const resolved = resolveInputId(key);
      if (!resolved.id) {
        pushWarning(
          `${scopeLabel} neutral at "${path}" input "${key}" references missing input and was ignored.`,
        );
        return;
      }

      const firstSource = valueSourcesByResolvedId.get(resolved.id);
      if (firstSource && firstSource !== key) {
        pushWarning(
          `${scopeLabel} neutral at "${path}" inputs "${firstSource}" and "${key}" both remap to "${resolved.id}"; keeping value from "${key}".`,
        );
      } else if (!firstSource) {
        valueSourcesByResolvedId.set(resolved.id, key);
      }

      values[resolved.id] = rawValue;
      if (resolved.id !== key) {
        pushWarning(
          `${scopeLabel} neutral at "${path}" input "${key}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
        );
      }
    },
  );

  return {
    sourceType: "direct-values",
    values,
  };
}

function normalizePoseGroups(
  poses: PoseDefinition[],
  poseGroups: unknown,
  defaultGroupBlendMode: PoseBlendMode,
  normalizeScopedNeutralForGroup?: ScopedNeutralNormalizer,
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

  sourceGroups.forEach((group, groupIndex) => {
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
      ...(normalizeScopedNeutralForGroup
        ? (() => {
            const normalizedNeutral = normalizeScopedNeutralForGroup(
              (group as { neutral?: unknown }).neutral,
              {
                scopeLabel: `Pose group "${id}"`,
                path: `poseGroups[${groupIndex}].neutral`,
              },
            );
            return normalizedNeutral ? { neutral: normalizedNeutral } : {};
          })()
        : {}),
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
    ...(stage.neutral ? { neutral: cloneScopedNeutral(stage.neutral) } : {}),
    sources: stage.sources.map((source) => ({
      kind: source.kind,
      id: source.id,
    })),
  }));
}

function cloneCrossGroupChannelOverrides(
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
    const normalized: PoseCrossGroupChannelOverride = {
      mode: override.mode,
      ...(override.tieBreak ? { tieBreak: override.tieBreak } : {}),
      ...(override.priorityOrder && override.priorityOrder.length > 0
        ? { priorityOrder: [...override.priorityOrder] }
        : {}),
    };
    return [inputId, normalized] as const;
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

function normalizeTieBreak(
  value: unknown,
  path: string,
  pushWarning: (message: string) => void,
): PosePriorityTieBreak {
  if (value === undefined || value === null) {
    return "group-order";
  }
  if (value === "group-order" || value === "group-id") {
    return value;
  }
  pushWarning(
    `Cross-group override "${path}" tieBreak "${String(value)}" is invalid; using "group-order".`,
  );
  return "group-order";
}

function normalizeCrossGroupChannelOverrides(
  overrides: unknown,
  options: {
    validInputIds: Set<string>;
    knownGroupIds: string[];
    fallbackMode: PoseBlendMode;
    resolveInputId: ResolveInputId;
    pushWarning: (message: string) => void;
  },
): PoseRigConfigFile["crossGroupChannelOverrides"] | undefined {
  const {
    validInputIds,
    knownGroupIds,
    fallbackMode,
    resolveInputId,
    pushWarning,
  } = options;
  if (overrides === undefined || overrides === null) {
    return undefined;
  }
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    pushWarning(
      "Cross-group channel overrides were ignored because payload is not an object map.",
    );
    return undefined;
  }

  const knownGroupIdsSet = new Set(knownGroupIds);
  const normalizedEntries = new Map<string, PoseCrossGroupChannelOverride>();
  const rawEntries = Object.entries(overrides as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  rawEntries.forEach(([rawInputKey, rawOverride]) => {
    const trimmedInputKey = rawInputKey.trim();
    if (!trimmedInputKey) {
      pushWarning(
        "Cross-group channel override entry with empty input id key was ignored.",
      );
      return;
    }

    const resolved = resolveInputId(trimmedInputKey);
    if (!resolved.id) {
      if (validInputIds.size > 0) {
        pushWarning(
          `Cross-group channel override "${trimmedInputKey}" references missing input and was ignored.`,
        );
        return;
      }
    }
    const canonicalInputId = resolved.id ?? trimmedInputKey;
    if (resolved.id && resolved.id !== trimmedInputKey) {
      pushWarning(
        `Cross-group channel override "${trimmedInputKey}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
      );
    }

    if (
      !rawOverride ||
      typeof rawOverride !== "object" ||
      Array.isArray(rawOverride)
    ) {
      pushWarning(
        `Cross-group channel override "${trimmedInputKey}" was ignored because it is not an object.`,
      );
      return;
    }

    const modeCandidate = (rawOverride as { mode?: unknown }).mode;
    const mode: PoseCrossGroupChannelOverride["mode"] =
      modeCandidate === "average" ||
      modeCandidate === "additive" ||
      modeCandidate === "priority"
        ? modeCandidate
        : fallbackMode;
    if (
      modeCandidate !== "average" &&
      modeCandidate !== "additive" &&
      modeCandidate !== "priority"
    ) {
      pushWarning(
        `Cross-group channel override "${trimmedInputKey}" mode "${String(modeCandidate)}" is invalid; using "${mode}".`,
      );
    }

    const tieBreak = normalizeTieBreak(
      (rawOverride as { tieBreak?: unknown }).tieBreak,
      trimmedInputKey,
      pushWarning,
    );

    let priorityOrder: string[] | undefined;
    const priorityOrderCandidate = (rawOverride as { priorityOrder?: unknown })
      .priorityOrder;
    if (
      priorityOrderCandidate !== undefined &&
      !Array.isArray(priorityOrderCandidate)
    ) {
      pushWarning(
        `Cross-group channel override "${trimmedInputKey}" priorityOrder is invalid and was ignored.`,
      );
    } else if (Array.isArray(priorityOrderCandidate)) {
      const seenGroups = new Set<string>();
      const normalizedPriorityOrder: string[] = [];
      priorityOrderCandidate.forEach((groupId) => {
        if (typeof groupId !== "string" || groupId.trim().length === 0) {
          pushWarning(
            `Cross-group channel override "${trimmedInputKey}" contains an invalid priority group id and it was ignored.`,
          );
          return;
        }
        const trimmedGroupId = groupId.trim();
        if (!knownGroupIdsSet.has(trimmedGroupId)) {
          pushWarning(
            `Cross-group channel override "${trimmedInputKey}" references unknown priority group "${trimmedGroupId}" and it was ignored.`,
          );
          return;
        }
        if (seenGroups.has(trimmedGroupId)) {
          pushWarning(
            `Cross-group channel override "${trimmedInputKey}" priority group "${trimmedGroupId}" is duplicated and was ignored.`,
          );
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
      pushWarning(
        `Cross-group channel override "${trimmedInputKey}" provided priorityOrder but mode "${mode}" does not use it; dropping priorityOrder.`,
      );
      priorityOrder = undefined;
    }

    const existing = normalizedEntries.get(canonicalInputId);
    if (existing && canonicalInputId !== trimmedInputKey) {
      pushWarning(
        `Cross-group channel overrides "${trimmedInputKey}" and "${canonicalInputId}" resolve to "${canonicalInputId}"; keeping value from "${trimmedInputKey}".`,
      );
    }
    normalizedEntries.set(canonicalInputId, {
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

function normalizeBlendStages(
  blendStages: unknown,
  groupIds: string[],
  fallbackMode: PoseIrBlendMode,
  pushWarning: (message: string) => void,
  normalizeScopedNeutralForStage?: ScopedNeutralNormalizer,
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
    const scopedNeutral = normalizeScopedNeutralForStage?.(
      (stage as { neutral?: unknown }).neutral,
      {
        scopeLabel: `Blend stage "${stageId}"`,
        path: `blendStages[${stageIndex}].neutral`,
      },
    );
    normalizedStages.push({
      id: stageId,
      name: stageName,
      mode: stageMode,
      ...(scopedNeutral ? { neutral: scopedNeutral } : {}),
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

    const resolveInputId: ResolveInputId = (rawKey: string) => {
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

    const knownPoseIds = new Set<string>();
    candidate.poses.forEach((pose) => {
      if (!pose || typeof pose !== "object") {
        return;
      }
      const poseId = typeof pose.id === "string" ? pose.id.trim() : "";
      if (poseId) {
        knownPoseIds.add(poseId);
      }
    });

    const normalizeScopedNeutralForConfig: ScopedNeutralNormalizer = (
      neutral,
      context,
    ) =>
      normalizeScopedNeutral(neutral, {
        scopeLabel: context.scopeLabel,
        path: context.path,
        validInputIds: validInputs,
        knownPoseIds,
        resolveInputId,
        pushWarning,
      });

    const defaultGroupBlendMode: PoseBlendMode = "average";
    const { poseGroups: normalizedGroups } = normalizePoseGroups(
      candidate.poses as PoseDefinition[],
      candidate.poseGroups,
      defaultGroupBlendMode,
      normalizeScopedNeutralForConfig,
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
      normalizeScopedNeutralForConfig,
    );
    const normalizedCrossGroupChannelOverrides =
      normalizeCrossGroupChannelOverrides(
        candidate.crossGroupChannelOverrides,
        {
          validInputIds: validInputs,
          knownGroupIds: normalizedGroups.map((group) => group.id),
          fallbackMode: crossGroupBlendMode,
          resolveInputId,
          pushWarning,
        },
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

      const composeModesSource =
        pose.composeModes &&
        typeof pose.composeModes === "object" &&
        !Array.isArray(pose.composeModes)
          ? (pose.composeModes as Record<string, unknown>)
          : null;
      if (pose.composeModes !== undefined && composeModesSource === null) {
        pushWarning(
          `Pose "${pose.name}" composeModes were ignored because payload is not an object map.`,
        );
      }
      const composeModes: Record<string, PoseInputComposeMode> = {};
      const composeModeSourcesByResolvedId = new Map<string, string>();
      Object.entries(composeModesSource ?? {}).forEach(([key, rawMode]) => {
        const trimmedKey = key.trim();
        if (!trimmedKey) {
          pushWarning(
            `Pose "${pose.name}" has a compose mode entry with an empty input id and it was ignored.`,
          );
          return;
        }
        const resolved = resolveInputId(trimmedKey);
        if (!resolved.id) {
          if (validInputs.size > 0) {
            pushWarning(
              `Pose "${pose.name}" compose mode for missing input "${trimmedKey}" was ignored.`,
            );
            return;
          }
        }
        const canonicalInputId = resolved.id ?? trimmedKey;
        if (values[canonicalInputId] === undefined) {
          pushWarning(
            `Pose "${pose.name}" compose mode for "${trimmedKey}" was ignored because the pose does not target that channel.`,
          );
          return;
        }
        const firstSource =
          composeModeSourcesByResolvedId.get(canonicalInputId);
        if (firstSource && firstSource !== trimmedKey) {
          pushWarning(
            `Pose "${pose.name}" compose modes "${firstSource}" and "${trimmedKey}" both remap to "${canonicalInputId}"; keeping value from "${trimmedKey}".`,
          );
        } else if (!firstSource) {
          composeModeSourcesByResolvedId.set(canonicalInputId, trimmedKey);
        }
        const mode: PoseInputComposeMode =
          rawMode === "average" || rawMode === "add" ? rawMode : "add";
        if (rawMode !== "average" && rawMode !== "add") {
          pushWarning(
            `Pose "${pose.name}" compose mode for "${trimmedKey}" value "${String(rawMode)}" is invalid; using "add".`,
          );
        }
        composeModes[canonicalInputId] = mode;
        if (resolved.id && resolved.id !== trimmedKey) {
          pushWarning(
            `Pose "${pose.name}" compose mode "${trimmedKey}" remapped to "${resolved.id}" via ${resolved.reason ?? "id"} match.`,
          );
        }
      });

      const membership = resolvePoseMembership(pose, normalizedGroups);
      const normalizedComposeModes = clonePoseComposeModes(composeModes);

      const newPose = {
        ...pose,
        groupIds: membership.groupIds,
        groupId: membership.primaryGroupId,
        group: membership.primaryGroupPath,
        values,
        composeModes: normalizedComposeModes,
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
        poseGroups: clonePoseGroups(normalizedGroups),
        crossGroupBlendMode,
        crossGroupChannelOverrides: cloneCrossGroupChannelOverrides(
          normalizedCrossGroupChannelOverrides,
        ),
        blendStages: cloneBlendStages(normalizedBlendStages),
        neutralMode,
        neutralInputs,
        poses: poses.map((pose) => {
          const composeModes = clonePoseComposeModes(pose.composeModes);
          return {
            ...pose,
            values: { ...pose.values },
            ...(composeModes ? { composeModes } : {}),
          };
        }),
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
      crossGroupChannelOverrides?: PoseRigConfigFile["crossGroupChannelOverrides"];
      blendStages?: PoseRigConfigFile["blendStages"];
      neutralMode?: PoseNeutralMode;
    },
  ): PoseRigConfigFile {
    const defaultGroupBlendMode = options?.defaultGroupBlendMode ?? "average";
    const knownPoseIds = new Set(
      poses
        .map((pose) => (typeof pose.id === "string" ? pose.id.trim() : ""))
        .filter((poseId) => poseId.length > 0),
    );
    const resolveCreateInputId: ResolveInputId = (rawKey) => ({
      id: rawKey.trim() || null,
      reason: null,
    });
    const normalizeScopedNeutralForCreate: ScopedNeutralNormalizer = (
      neutral,
      context,
    ) =>
      normalizeScopedNeutral(neutral, {
        scopeLabel: context.scopeLabel,
        path: context.path,
        validInputIds: new Set(),
        knownPoseIds,
        resolveInputId: resolveCreateInputId,
        pushWarning: () => {
          // create() returns normalized payload; invalid scoped neutral entries are silently dropped.
        },
      });
    const { poseGroups } = normalizePoseGroups(
      poses,
      options?.poseGroups,
      defaultGroupBlendMode,
      normalizeScopedNeutralForCreate,
    );
    const crossGroupBlendMode = options?.crossGroupBlendMode ?? "additive";
    const normalizedBlendStages = normalizeBlendStages(
      options?.blendStages,
      poseGroups.map((group) => group.id),
      resolveDefaultStageMode(crossGroupBlendMode),
      () => {
        // create() returns normalized payload; invalid blend stages are silently dropped.
      },
      normalizeScopedNeutralForCreate,
    );
    const normalizedCrossGroupChannelOverrides =
      normalizeCrossGroupChannelOverrides(options?.crossGroupChannelOverrides, {
        validInputIds: new Set(),
        knownGroupIds: poseGroups.map((group) => group.id),
        fallbackMode: crossGroupBlendMode,
        resolveInputId: resolveCreateInputId,
        pushWarning: () => {
          // create() returns normalized payload; invalid override entries are silently dropped.
        },
      });

    const normalizedPoses = poses.map((pose) => {
      const membership = resolvePoseMembership(pose, poseGroups);
      const composeModes = clonePoseComposeModes(pose.composeModes);
      return {
        ...pose,
        groupIds: membership.groupIds,
        groupId: membership.primaryGroupId,
        group: membership.primaryGroupPath,
        values: { ...pose.values },
        composeModes,
      };
    });

    return {
      version: POSE_RIG_CONFIG_VERSION,
      faceId,
      rigKind,
      title: rigName,
      neutralMode: options?.neutralMode ?? "explicit",
      neutralInputs: { ...neutralInputs },
      poseGroups: clonePoseGroups(poseGroups),
      crossGroupBlendMode,
      crossGroupChannelOverrides: cloneCrossGroupChannelOverrides(
        normalizedCrossGroupChannelOverrides,
      ),
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
