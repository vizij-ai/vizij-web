import { buildRigPipelineV1LinkId, type StandardRigInput } from "@vizij/utils";
import type { PoseRigConfigFile, PoseRigIrFile } from "../poseRig/types";
import type { VizijPipelineMetadataV1 } from "./graphImport";

function normalizeToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePathKey(path: string | null | undefined): string | null {
  const normalized = normalizeToken(path);
  return normalized ? normalized.toLowerCase() : null;
}

function buildUniqueLookup(
  inputs: readonly StandardRigInput[],
  getKey: (input: StandardRigInput) => string | null,
): Map<string, StandardRigInput | null> {
  const next = new Map<string, StandardRigInput | null>();
  inputs.forEach((input) => {
    const key = getKey(input);
    if (!key) {
      return;
    }
    if (next.has(key)) {
      next.set(key, null);
      return;
    }
    next.set(key, input);
  });
  return next;
}

export function buildStandardInputIdRemap(
  previousInputs: readonly StandardRigInput[],
  nextInputs: readonly StandardRigInput[],
): Map<string, string> {
  if (previousInputs.length === 0 || nextInputs.length === 0) {
    return new Map();
  }

  const nextBySourceId = buildUniqueLookup(nextInputs, (input) =>
    normalizeToken(input.sourceId),
  );
  const nextByPath = buildUniqueLookup(nextInputs, (input) =>
    normalizePathKey(input.path),
  );
  const remap = new Map<string, string>();

  previousInputs.forEach((input) => {
    const previousId = normalizeToken(input.id);
    if (!previousId) {
      return;
    }

    const directMatch = nextInputs.find(
      (candidate) => candidate.id === previousId,
    );
    if (directMatch) {
      return;
    }

    const sourceId = normalizeToken(input.sourceId);
    const sourceMatch = sourceId ? nextBySourceId.get(sourceId) : undefined;
    if (sourceMatch && sourceMatch.id !== previousId) {
      remap.set(previousId, sourceMatch.id);
      return;
    }

    const pathKey = normalizePathKey(input.path);
    const pathMatch = pathKey ? nextByPath.get(pathKey) : undefined;
    if (pathMatch && pathMatch.id !== previousId) {
      remap.set(previousId, pathMatch.id);
    }
  });

  return remap;
}

function remapInputId(
  value: string,
  idRemap: ReadonlyMap<string, string>,
): string {
  return idRemap.get(value) ?? value;
}

function remapNumberRecord(
  record: Record<string, number>,
  idRemap: ReadonlyMap<string, string>,
): Record<string, number> {
  const next: Record<string, number> = {};
  const existingKeys = new Set(Object.keys(record));
  Object.entries(record).forEach(([rawKey, value]) => {
    const mappedKey = remapInputId(rawKey, idRemap);
    if (mappedKey !== rawKey && existingKeys.has(mappedKey)) {
      return;
    }
    next[mappedKey] = value;
  });
  return next;
}

function remapStringRecord<T>(
  record: Record<string, T>,
  idRemap: ReadonlyMap<string, string>,
): Record<string, T> {
  const next: Record<string, T> = {};
  const existingKeys = new Set(Object.keys(record));
  Object.entries(record).forEach(([rawKey, value]) => {
    const mappedKey = remapInputId(rawKey, idRemap);
    if (mappedKey !== rawKey && existingKeys.has(mappedKey)) {
      return;
    }
    next[mappedKey] = value;
  });
  return next;
}

function remapScopedNeutralDefinition<
  T extends
    | { sourceType?: string; values?: Record<string, number> }
    | null
    | undefined,
>(definition: T, idRemap: ReadonlyMap<string, string>): T {
  if (
    !definition ||
    definition.sourceType !== "direct-values" ||
    !definition.values
  ) {
    return definition;
  }
  return {
    ...definition,
    values: remapNumberRecord(definition.values, idRemap),
  };
}

export function remapPipelineMetadataInputIds(
  metadata: VizijPipelineMetadataV1 | null,
  idRemap: ReadonlyMap<string, string>,
): VizijPipelineMetadataV1 | null {
  if (!metadata || idRemap.size === 0) {
    return metadata;
  }

  const next: VizijPipelineMetadataV1 = {
    ...metadata,
  };

  const byInputId =
    metadata.byInputId && typeof metadata.byInputId === "object"
      ? metadata.byInputId
      : null;
  if (byInputId) {
    next.byInputId = Object.fromEntries(
      Object.entries(byInputId).map(([rawInputId, rawConfig]) => {
        const config =
          rawConfig &&
          typeof rawConfig === "object" &&
          !Array.isArray(rawConfig)
            ? { ...(rawConfig as Record<string, unknown>) }
            : {};
        const inputId = remapInputId(rawInputId, idRemap);
        if (typeof config.inputId === "string") {
          config.inputId = remapInputId(config.inputId, idRemap);
        } else {
          config.inputId = inputId;
        }
        if (Array.isArray(config.parents)) {
          config.parents = config.parents.map((entry) => {
            if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
              return entry;
            }
            const parent = { ...(entry as Record<string, unknown>) };
            const parentInputId =
              typeof parent.inputId === "string"
                ? remapInputId(parent.inputId, idRemap)
                : null;
            if (parentInputId) {
              parent.inputId = parentInputId;
            }
            const linkId =
              parentInputId !== null
                ? buildRigPipelineV1LinkId(parentInputId, inputId)
                : typeof parent.linkId === "string"
                  ? parent.linkId
                  : null;
            if (linkId) {
              parent.linkId = linkId;
            }
            return parent;
          });
        }
        return [inputId, config];
      }),
    );
  }

  const links =
    metadata.links && typeof metadata.links === "object"
      ? metadata.links
      : null;
  if (links) {
    const remappedLinks: Array<[string, Record<string, unknown>]> = [];
    Object.entries(links).forEach(([_rawLinkId, rawLink]) => {
      const link =
        rawLink && typeof rawLink === "object" && !Array.isArray(rawLink)
          ? { ...(rawLink as Record<string, unknown>) }
          : {};
      const parentInputId =
        typeof link.parentInputId === "string"
          ? remapInputId(link.parentInputId, idRemap)
          : null;
      const childInputId =
        typeof link.childInputId === "string"
          ? remapInputId(link.childInputId, idRemap)
          : null;
      if (parentInputId) {
        link.parentInputId = parentInputId;
      }
      if (childInputId) {
        link.childInputId = childInputId;
      }
      const linkId =
        parentInputId && childInputId
          ? buildRigPipelineV1LinkId(parentInputId, childInputId)
          : typeof link.linkId === "string"
            ? link.linkId
            : null;
      if (linkId) {
        link.linkId = linkId;
      }
      if (linkId) {
        remappedLinks.push([linkId, link]);
      }
    });
    next.links = Object.fromEntries(remappedLinks);
  }

  return next;
}

export function remapPoseConfigInputIds(
  config: PoseRigConfigFile | null,
  idRemap: ReadonlyMap<string, string>,
): PoseRigConfigFile | null {
  if (!config || idRemap.size === 0) {
    return config;
  }

  return {
    ...config,
    neutralInputs: remapNumberRecord(config.neutralInputs, idRemap),
    crossGroupChannelOverrides: config.crossGroupChannelOverrides
      ? remapStringRecord(config.crossGroupChannelOverrides, idRemap)
      : config.crossGroupChannelOverrides,
    poses: config.poses.map((pose) => ({
      ...pose,
      values: remapNumberRecord(pose.values, idRemap),
      composeModes: pose.composeModes
        ? remapStringRecord(pose.composeModes, idRemap)
        : pose.composeModes,
    })),
    blendStages: config.blendStages?.map((stage) => ({
      ...stage,
      neutral: remapScopedNeutralDefinition(stage.neutral, idRemap),
    })),
    poseGroups: config.poseGroups?.map((group) => ({
      ...group,
      neutral: remapScopedNeutralDefinition(group.neutral, idRemap),
    })),
    lowLevel: config.lowLevel
      ? {
          ...config.lowLevel,
          inputs: Array.from(
            new Set(
              config.lowLevel.inputs.map((inputId) =>
                remapInputId(inputId, idRemap),
              ),
            ),
          ),
          bindings: config.lowLevel.bindings.map((binding) => ({
            ...binding,
            inputId: binding.inputId
              ? remapInputId(binding.inputId, idRemap)
              : null,
          })),
        }
      : config.lowLevel,
  };
}

export function remapPoseIrInputIds(
  ir: PoseRigIrFile | null,
  idRemap: ReadonlyMap<string, string>,
): PoseRigIrFile | null {
  if (!ir || idRemap.size === 0) {
    return ir;
  }

  return {
    ...ir,
    neutral: {
      ...ir.neutral,
      values: remapNumberRecord(ir.neutral.values, idRemap),
    },
    crossGroupPolicy: {
      ...ir.crossGroupPolicy,
      overrides: ir.crossGroupPolicy.overrides
        ? remapStringRecord(ir.crossGroupPolicy.overrides, idRemap)
        : ir.crossGroupPolicy.overrides,
    },
    poses: ir.poses.map((pose) => ({
      ...pose,
      targets: remapNumberRecord(pose.targets, idRemap),
      composeModes: pose.composeModes
        ? remapStringRecord(pose.composeModes, idRemap)
        : pose.composeModes,
    })),
    groups: ir.groups.map((group) => ({
      ...group,
      neutral: remapScopedNeutralDefinition(group.neutral, idRemap),
    })),
    blendStages: ir.blendStages?.map((stage) => ({
      ...stage,
      neutral: remapScopedNeutralDefinition(stage.neutral, idRemap),
    })),
    lowLevel: ir.lowLevel
      ? {
          ...ir.lowLevel,
          inputs: Array.from(
            new Set(
              ir.lowLevel.inputs.map((inputId) =>
                remapInputId(inputId, idRemap),
              ),
            ),
          ),
          bindings: ir.lowLevel.bindings.map((binding) => ({
            ...binding,
            inputId: binding.inputId
              ? remapInputId(binding.inputId, idRemap)
              : null,
          })),
        }
      : ir.lowLevel,
  };
}
