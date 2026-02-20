import type {
  PoseCrossGroupChannelOverride,
  PoseDefinition,
  PoseIrBlendStageDefinition,
  PoseRigConfigFile,
} from "../types";

export function nextBlendStageId(base: string, existing: Set<string>): string {
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

function sanitizeBlendStageId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "stage";
}

export function cloneBlendStages(
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

export function cloneCrossGroupChannelOverrides(
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

export function clonePoseComposeModes(
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

export function projectPoseComposeModesForValues(
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

export interface BlendStageTopologyIssue {
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

export function validateBlendStageTopology(
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
