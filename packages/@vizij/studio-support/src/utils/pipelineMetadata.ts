import type {
  AnimatableBinding,
  BindingMap,
  InputBindingMap,
  InputComposeMode,
} from "@vizij/node-graph-authoring";
import {
  SELF_BINDING_ID,
  buildRigPipelineV1LinkId,
  cloneDeepSafe,
  normalizeStandardRigInputPath,
  resolveRigPipelineV1InputConfig,
  resolveStandardRigInputId,
  type RigPipelineV1InputConfig,
  type RigPipelineV1LinkConfig,
  type StandardRigInput,
} from "@vizij/utils";
import type {
  VizijPipelineConfigMap,
  VizijPipelineMetadataV1,
} from "./standardInputRemap";

export type PipelineConfigByInputId = VizijPipelineConfigMap;

export interface PoseConfigSnapshot {
  poses?: Array<{
    values?: Record<string, number | undefined>;
    composeModes?: Record<string, unknown>;
  }>;
}

function cloneSerializable<T>(value: T): T {
  return cloneDeepSafe(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeStringValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeFiniteValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function normalizeBooleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isCanonicalPropsRigInputPath(
  path: string | null | undefined,
): boolean {
  if (!path) {
    return false;
  }
  const normalized = normalizeStandardRigInputPath(path).replace(
    /^\/rig\/[^/]+\//,
    "/",
  );
  return normalized.startsWith("/propsrig/");
}

function collectBindingInputIds(
  binding: AnimatableBinding | undefined,
): string[] {
  if (!binding) {
    return [];
  }
  const ids = new Set<string>();
  if (
    binding.inputId &&
    binding.inputId !== SELF_BINDING_ID &&
    binding.inputId.trim().length > 0
  ) {
    ids.add(binding.inputId);
  }
  binding.slots.forEach((slot) => {
    if (
      slot.inputId &&
      slot.inputId !== SELF_BINDING_ID &&
      slot.inputId.trim().length > 0
    ) {
      ids.add(slot.inputId);
    }
  });
  return Array.from(ids);
}

export function buildPoseComposeModeByInputId(
  poseConfig: PoseConfigSnapshot | null | undefined,
): Partial<Record<string, InputComposeMode>> {
  const next: Partial<Record<string, InputComposeMode>> = {};
  const poses = Array.isArray(poseConfig?.poses) ? poseConfig.poses : [];
  poses.forEach((pose) => {
    if (!pose || typeof pose !== "object") {
      return;
    }
    const targets =
      pose.values && typeof pose.values === "object" ? pose.values : {};
    Object.keys(targets).forEach((inputId) => {
      const rawMode =
        pose.composeModes && typeof pose.composeModes === "object"
          ? pose.composeModes[inputId]
          : undefined;
      next[inputId] = rawMode === "average" ? "average" : "add";
    });
  });
  return next;
}

export function withPipelineConfigBuildOptions<
  T extends Record<string, unknown>,
>(
  options: T,
  pipelineConfigByInputId: PipelineConfigByInputId | null | undefined,
  pipelineMetadataV1?: Record<string, unknown> | null,
): T {
  const normalizedMap = pipelineConfigByInputId
    ? Object.fromEntries(
        Object.entries(pipelineConfigByInputId)
          .filter(
            ([, config]) =>
              Boolean(config) &&
              typeof config === "object" &&
              !Array.isArray(config),
          )
          .map(([inputId, config]) => [
            inputId,
            {
              ...(config as Record<string, unknown>),
              inputId,
            } satisfies RigPipelineV1InputConfig,
          ]),
      )
    : {};
  const hasNormalizedMap = Object.keys(normalizedMap).length > 0;
  const hasPipelineMetadata =
    Boolean(pipelineMetadataV1) &&
    typeof pipelineMetadataV1 === "object" &&
    !Array.isArray(pipelineMetadataV1);
  if (!hasNormalizedMap && !hasPipelineMetadata) {
    return options;
  }
  const mergedPipelineV1 = {
    ...(hasPipelineMetadata
      ? (pipelineMetadataV1 as Record<string, unknown>)
      : {}),
    ...(hasNormalizedMap
      ? {
          byInputId: normalizedMap as Record<string, RigPipelineV1InputConfig>,
        }
      : {}),
  };
  return {
    ...(options as Record<string, unknown>),
    pipelineV1: mergedPipelineV1,
  } as unknown as T;
}

export function resolvePipelineMetadataForExport(
  pipelineMetadataV1: VizijPipelineMetadataV1 | null | undefined,
  pipelineConfigByInputId: PipelineConfigByInputId | null | undefined,
  availableInputIds: ReadonlySet<string>,
): VizijPipelineMetadataV1 | null {
  const hasAvailableInputIds = availableInputIds.size > 0;
  const hasConfigMap =
    Boolean(pipelineConfigByInputId) &&
    Object.keys(pipelineConfigByInputId ?? {}).length > 0;
  const hasMetadataBase =
    Boolean(pipelineMetadataV1) &&
    typeof pipelineMetadataV1 === "object" &&
    !Array.isArray(pipelineMetadataV1);
  if (!hasMetadataBase && !hasConfigMap) {
    return null;
  }

  const base = hasMetadataBase
    ? (cloneSerializable(pipelineMetadataV1) as VizijPipelineMetadataV1)
    : ({} as VizijPipelineMetadataV1);
  const nextByInputId: PipelineConfigByInputId = {};
  const seededByConfigInputIds = new Set<string>();
  const synthesizedLinkParentInputIds = new Set<string>();
  const rawByInputId = hasConfigMap
    ? (pipelineConfigByInputId as PipelineConfigByInputId)
    : ((base.byInputId ?? {}) as PipelineConfigByInputId);

  Object.entries(rawByInputId).forEach(([rawInputId, rawConfig]) => {
    if (
      !rawConfig ||
      typeof rawConfig !== "object" ||
      Array.isArray(rawConfig)
    ) {
      return;
    }
    const configRecord = rawConfig as Record<string, unknown>;
    const inputId =
      normalizeStringValue(rawInputId) ??
      normalizeStringValue(configRecord.inputId);
    if (!inputId) {
      return;
    }
    if (hasAvailableInputIds && !availableInputIds.has(inputId)) {
      return;
    }
    nextByInputId[inputId] = {
      ...configRecord,
      inputId,
    };
    seededByConfigInputIds.add(inputId);
  });

  const nextLinks: Record<string, Record<string, unknown>> = {};
  const parentsByChild = new Map<string, Array<Record<string, unknown>>>();
  const childrenByParent = new Map<string, Set<string>>();
  const rawLinks =
    base.links && typeof base.links === "object" && !Array.isArray(base.links)
      ? (base.links as Record<string, unknown>)
      : {};

  Object.entries(rawLinks).forEach(([rawLinkId, rawLink]) => {
    if (!rawLink || typeof rawLink !== "object" || Array.isArray(rawLink)) {
      return;
    }
    const linkRecord = rawLink as Record<string, unknown>;
    const parentInputId = normalizeStringValue(linkRecord.parentInputId);
    const childInputId = normalizeStringValue(linkRecord.childInputId);
    if (!parentInputId || !childInputId) {
      return;
    }
    if (
      hasAvailableInputIds &&
      (!availableInputIds.has(parentInputId) ||
        !availableInputIds.has(childInputId))
    ) {
      return;
    }
    const linkId =
      normalizeStringValue(linkRecord.linkId) ??
      normalizeStringValue(rawLinkId) ??
      `link/${encodeURIComponent(parentInputId)}->${encodeURIComponent(childInputId)}`;
    const scale = normalizeFiniteValue(linkRecord.scale);
    const offset = normalizeFiniteValue(linkRecord.offset);
    const enabled = normalizeBooleanValue(linkRecord.enabled);
    const expression = normalizeStringValue(linkRecord.expression);
    const normalizedLink: Record<string, unknown> = {
      ...linkRecord,
      linkId,
      parentInputId,
      childInputId,
      ...(scale !== undefined ? { scale } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(expression ? { expression } : {}),
    };
    nextLinks[linkId] = normalizedLink;

    const parentEntry: Record<string, unknown> = {
      linkId,
      inputId: parentInputId,
      ...(scale !== undefined ? { scale } : {}),
      ...(offset !== undefined ? { offset } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(expression ? { expression } : {}),
    };
    const existingParents = parentsByChild.get(childInputId) ?? [];
    existingParents.push(parentEntry);
    parentsByChild.set(childInputId, existingParents);

    const existingChildren = childrenByParent.get(parentInputId) ?? new Set();
    existingChildren.add(childInputId);
    childrenByParent.set(parentInputId, existingChildren);
  });

  parentsByChild.forEach((parents, childInputId) => {
    if (!nextByInputId[childInputId]) {
      nextByInputId[childInputId] = { inputId: childInputId };
    }
    const existingParentEntries = Array.isArray(
      nextByInputId[childInputId]?.parents,
    )
      ? nextByInputId[childInputId].parents
      : [];
    const existingParentsByKey = new Map<string, Record<string, unknown>>();
    existingParentEntries.forEach((rawEntry) => {
      const entry = asRecord(rawEntry);
      if (!entry) {
        return;
      }
      const parentInputId = normalizeStringValue(entry.inputId);
      const linkId =
        normalizeStringValue(entry.linkId) ??
        (parentInputId
          ? buildRigPipelineV1LinkId(parentInputId, childInputId)
          : null);
      if (!parentInputId || !linkId) {
        return;
      }
      existingParentsByKey.set(`${parentInputId}::${linkId}`, entry);
    });
    const dedupedParents = new Map<string, Record<string, unknown>>();
    parents.forEach((parent) => {
      const parentInputId = normalizeStringValue(parent.inputId);
      const linkId = normalizeStringValue(parent.linkId);
      if (!parentInputId || !linkId) {
        return;
      }
      const key = `${parentInputId}::${linkId}`;
      dedupedParents.set(key, parent);
    });
    nextByInputId[childInputId].parents = Array.from(dedupedParents.values())
      .map((parent): Record<string, unknown> => {
        const parentInputId = normalizeStringValue(parent.inputId);
        const linkId = normalizeStringValue(parent.linkId);
        if (!parentInputId || !linkId) {
          return { ...parent };
        }
        const existing =
          existingParentsByKey.get(`${parentInputId}::${linkId}`) ?? null;
        if (!existing) {
          return { ...parent };
        }
        const alias = normalizeStringValue(existing.alias);
        const existingExpression = normalizeStringValue(existing.expression);
        const linkExpression = normalizeStringValue(parent.expression);
        return {
          ...existing,
          ...parent,
          ...(alias ? { alias } : {}),
          ...(linkExpression
            ? { expression: linkExpression }
            : existingExpression
              ? { expression: existingExpression }
              : {}),
        };
      })
      .sort((left, right) => {
        const leftParent = normalizeStringValue(left.inputId) ?? "";
        const rightParent = normalizeStringValue(right.inputId) ?? "";
        if (leftParent !== rightParent) {
          return leftParent.localeCompare(rightParent);
        }
        const leftLinkId = normalizeStringValue(left.linkId) ?? "";
        const rightLinkId = normalizeStringValue(right.linkId) ?? "";
        return leftLinkId.localeCompare(rightLinkId);
      })
      .map((parent) => ({ ...parent }));
  });

  childrenByParent.forEach((children, parentInputId) => {
    if (!nextByInputId[parentInputId]) {
      nextByInputId[parentInputId] = { inputId: parentInputId };
      synthesizedLinkParentInputIds.add(parentInputId);
    }
    nextByInputId[parentInputId].children = Array.from(children).sort((a, b) =>
      a.localeCompare(b),
    );
  });

  Object.keys(nextByInputId).forEach((inputId) => {
    const entry = nextByInputId[inputId];
    if (!entry) {
      return;
    }
    if (!Array.isArray(entry.parents)) {
      entry.parents = [];
    }
    if (!Array.isArray(entry.children)) {
      entry.children = [];
    }
    const directInput = asRecord(entry.directInput);
    const poseSource = asRecord(entry.poseSource);
    const poseTargets = Array.isArray(poseSource?.targetIds)
      ? poseSource.targetIds
      : [];
    const isPropsRigInput = /^propsrig_/i.test(inputId);
    const hasLinkedParents =
      parentsByChild.has(inputId) ||
      (Array.isArray(entry.parents) && entry.parents.length > 0);
    const hasExplicitDirectInput =
      directInput && typeof directInput.enabled === "boolean";
    const shouldRepairDeadRelayDriver =
      !isPropsRigInput &&
      (childrenByParent.has(inputId) ||
        (Array.isArray(entry.children) && entry.children.length > 0)) &&
      Array.isArray(entry.parents) &&
      entry.parents.length === 0 &&
      directInput?.enabled === false &&
      poseTargets.length === 0;
    if (
      synthesizedLinkParentInputIds.has(inputId) &&
      !seededByConfigInputIds.has(inputId) &&
      directInput?.enabled === undefined
    ) {
      entry.directInput = {
        ...(directInput ?? {}),
        enabled: true,
      };
      return;
    }
    if (isPropsRigInput && hasLinkedParents && !hasExplicitDirectInput) {
      entry.directInput = {
        ...(directInput ?? {}),
        enabled: true,
      };
      return;
    }
    if (shouldRepairDeadRelayDriver) {
      entry.directInput = {
        ...(directInput ?? {}),
        enabled: true,
      };
    }
  });

  if (Object.keys(nextByInputId).length > 0) {
    base.byInputId = cloneSerializable(
      nextByInputId,
    ) as PipelineConfigByInputId;
  } else {
    delete base.byInputId;
  }
  if (Object.keys(nextLinks).length > 0) {
    base.links = cloneSerializable(
      nextLinks,
    ) as VizijPipelineMetadataV1["links"];
  } else {
    delete base.links;
  }

  return Object.keys(base).length > 0 ? base : null;
}

function mergePipelineParentsForInput(
  inputId: string,
  importedParentsRaw: unknown,
  localParentsRaw: unknown,
): Record<string, unknown>[] | undefined {
  const importedParents = Array.isArray(importedParentsRaw)
    ? importedParentsRaw
    : [];
  const localParents = Array.isArray(localParentsRaw) ? localParentsRaw : [];
  if (importedParents.length === 0 && localParents.length === 0) {
    return undefined;
  }

  const importedByKey = new Map<string, Record<string, unknown>>();
  const importedWithoutKey: Record<string, unknown>[] = [];
  importedParents.forEach((rawParent) => {
    const parent = asRecord(rawParent);
    if (!parent) {
      return;
    }
    const parentInputId = normalizeStringValue(parent.inputId);
    const linkId =
      normalizeStringValue(parent.linkId) ??
      (parentInputId ? buildRigPipelineV1LinkId(parentInputId, inputId) : null);
    if (!parentInputId || !linkId) {
      importedWithoutKey.push({ ...parent });
      return;
    }
    importedByKey.set(`${parentInputId}::${linkId}`, { ...parent });
  });

  const consumedImportedKeys = new Set<string>();
  const merged: Record<string, unknown>[] = [];
  localParents.forEach((rawParent) => {
    const parent = asRecord(rawParent);
    if (!parent) {
      return;
    }
    const parentInputId = normalizeStringValue(parent.inputId);
    const linkId =
      normalizeStringValue(parent.linkId) ??
      (parentInputId ? buildRigPipelineV1LinkId(parentInputId, inputId) : null);
    if (!parentInputId || !linkId) {
      merged.push({ ...parent });
      return;
    }
    const key = `${parentInputId}::${linkId}`;
    const imported = importedByKey.get(key) ?? null;
    if (imported) {
      consumedImportedKeys.add(key);
    }
    const importedAlias = normalizeStringValue(imported?.alias);
    const localAlias = normalizeStringValue(parent.alias);
    const importedExpression = normalizeStringValue(imported?.expression);
    const localExpression = normalizeStringValue(parent.expression);
    merged.push({
      ...(imported ?? {}),
      ...parent,
      ...(localAlias
        ? { alias: localAlias }
        : importedAlias
          ? { alias: importedAlias }
          : {}),
      ...(localExpression
        ? { expression: localExpression }
        : importedExpression
          ? { expression: importedExpression }
          : {}),
      inputId: parentInputId,
      linkId,
    });
  });

  importedByKey.forEach((parent, key) => {
    if (consumedImportedKeys.has(key)) {
      return;
    }
    merged.push({ ...parent });
  });
  importedWithoutKey.forEach((parent) => {
    merged.push({ ...parent });
  });

  const dedupedByKey = new Map<string, Record<string, unknown>>();
  const dedupedWithoutKey: Record<string, unknown>[] = [];
  merged.forEach((parent) => {
    const parentInputId = normalizeStringValue(parent.inputId);
    const linkId = normalizeStringValue(parent.linkId);
    if (!parentInputId || !linkId) {
      dedupedWithoutKey.push(parent);
      return;
    }
    dedupedByKey.set(`${parentInputId}::${linkId}`, parent);
  });

  return [
    ...Array.from(dedupedByKey.values()).sort((left, right) => {
      const leftInputId = normalizeStringValue(left.inputId) ?? "";
      const rightInputId = normalizeStringValue(right.inputId) ?? "";
      if (leftInputId !== rightInputId) {
        return leftInputId.localeCompare(rightInputId);
      }
      const leftLinkId = normalizeStringValue(left.linkId) ?? "";
      const rightLinkId = normalizeStringValue(right.linkId) ?? "";
      return leftLinkId.localeCompare(rightLinkId);
    }),
    ...dedupedWithoutKey,
  ];
}

function mergePipelineInputConfigRecord(
  inputId: string,
  importedConfigRaw: Record<string, unknown> | null,
  localConfigRaw: Record<string, unknown>,
): Record<string, unknown> {
  const importedConfig = importedConfigRaw ?? {};
  const merged: Record<string, unknown> = {
    ...importedConfig,
    ...localConfigRaw,
    inputId,
  };

  const mergedParents = mergePipelineParentsForInput(
    inputId,
    importedConfig.parents,
    localConfigRaw.parents,
  );
  if (mergedParents) {
    merged.parents = mergedParents;
  } else {
    delete merged.parents;
  }

  const importedParentBlend = asRecord(importedConfig.parentBlend);
  const localParentBlend = asRecord(localConfigRaw.parentBlend);
  if (importedParentBlend || localParentBlend) {
    merged.parentBlend = {
      ...(importedParentBlend ?? {}),
      ...(localParentBlend ?? {}),
    };
  }

  const importedDirectInput = asRecord(importedConfig.directInput);
  const localDirectInput = asRecord(localConfigRaw.directInput);
  if (importedDirectInput || localDirectInput) {
    merged.directInput = {
      ...(importedDirectInput ?? {}),
      ...(localDirectInput ?? {}),
    };
  }

  const importedOverride = asRecord(importedConfig.override);
  const localOverride = asRecord(localConfigRaw.override);
  if (importedOverride || localOverride) {
    merged.override = {
      ...(importedOverride ?? {}),
      ...(localOverride ?? {}),
    };
  }

  const importedClamp = asRecord(importedConfig.clamp);
  const localClamp = asRecord(localConfigRaw.clamp);
  if (importedClamp || localClamp) {
    merged.clamp = {
      ...(importedClamp ?? {}),
      ...(localClamp ?? {}),
    };
  }

  return merged;
}

export function mergeImportedAndLocalPipelineConfigByInputId(
  imported: Record<string, Record<string, unknown>>,
  local: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  if (Object.keys(local).length === 0) {
    return imported;
  }
  const merged: Record<string, Record<string, unknown>> = {
    ...imported,
  };
  Object.entries(local).forEach(([rawInputId, localConfigCandidate]) => {
    const localConfig = asRecord(localConfigCandidate);
    if (!localConfig) {
      return;
    }
    const inputId =
      normalizeStringValue(rawInputId) ??
      normalizeStringValue(localConfig.inputId);
    if (!inputId) {
      return;
    }
    const importedConfig = asRecord(merged[inputId]);
    merged[inputId] = mergePipelineInputConfigRecord(
      inputId,
      importedConfig,
      localConfig,
    );
  });
  return merged;
}

export function mergeImportedAndLocalPipelineLinksById(
  imported: Record<string, Record<string, unknown>>,
  local: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  if (Object.keys(local).length === 0) {
    return imported;
  }
  const merged: Record<string, Record<string, unknown>> = {
    ...imported,
  };
  Object.entries(local).forEach(([rawLinkId, localLinkCandidate]) => {
    const localLink = asRecord(localLinkCandidate);
    if (!localLink) {
      return;
    }
    const linkId =
      normalizeStringValue(rawLinkId) ?? normalizeStringValue(localLink.linkId);
    if (!linkId) {
      return;
    }
    const importedLink = asRecord(merged[linkId]);
    const importedExpression = normalizeStringValue(importedLink?.expression);
    const localExpression = normalizeStringValue(localLink.expression);
    merged[linkId] = {
      ...(importedLink ?? {}),
      ...localLink,
      linkId,
      ...(localExpression
        ? { expression: localExpression }
        : importedExpression
          ? { expression: importedExpression }
          : {}),
    };
  });
  return merged;
}

export interface DerivedPipelineEdits {
  byInputId: Record<string, RigPipelineV1InputConfig>;
  links: Record<string, RigPipelineV1LinkConfig>;
}

export function derivePipelineConfigFromInputBindings(
  inputBindings: InputBindingMap,
): DerivedPipelineEdits {
  const byInputId: Record<string, RigPipelineV1InputConfig> = {};
  const links: Record<string, RigPipelineV1LinkConfig> = {};
  const linkPriorityById: Record<string, number> = {};
  Object.entries(inputBindings).forEach(([inputId, binding]) => {
    if (!binding) {
      return;
    }
    const metadata = asRecord(binding.metadata);
    const vizij = asRecord(metadata?.vizij);
    const pipeline = asRecord(vizij?.pipelineV1);
    if (!pipeline) {
      return;
    }
    const pipelineLinks = asRecord(pipeline.links);
    if (pipelineLinks) {
      Object.entries(pipelineLinks).forEach(([key, entry]) => {
        const linkConfig = asRecord(entry);
        if (!linkConfig) {
          return;
        }
        const linkId =
          normalizeStringValue(key) ?? normalizeStringValue(linkConfig.linkId);
        const parentInputId = normalizeStringValue(linkConfig.parentInputId);
        const childInputId = normalizeStringValue(linkConfig.childInputId);
        if (!linkId || !parentInputId || !childInputId) {
          return;
        }
        const nextLink: RigPipelineV1LinkConfig = {
          linkId,
          parentInputId,
          childInputId,
        };
        const scale = normalizeFiniteValue(linkConfig.scale);
        const offset = normalizeFiniteValue(linkConfig.offset);
        const enabled = normalizeBooleanValue(linkConfig.enabled);
        const expression = normalizeStringValue(linkConfig.expression);
        if (scale !== undefined) {
          nextLink.scale = scale;
        }
        if (offset !== undefined) {
          nextLink.offset = offset;
        }
        if (enabled !== undefined) {
          nextLink.enabled = enabled;
        }
        if (expression !== null) {
          nextLink.expression = expression;
        }
        const isOwnerRecord = childInputId === inputId;
        const nextPriority = isOwnerRecord ? 2 : 1;
        const previousPriority = linkPriorityById[linkId] ?? 0;
        if (nextPriority < previousPriority) {
          return;
        }
        linkPriorityById[linkId] = nextPriority;
        links[linkId] = nextLink;
      });
    }
    const legacy = asRecord(pipeline.legacy);
    if (legacy?.readOnly === true) {
      return;
    }

    const migration = asRecord(pipeline.migration);
    const migrated = migration?.status === "migrated";
    const parentBlend = asRecord(pipeline.parentBlend);
    const parentBlendMode =
      parentBlend?.mode === "normalized-additive"
        ? "normalized-additive"
        : null;
    const parentBlendExpression = normalizeStringValue(parentBlend?.expression);
    const direct = asRecord(pipeline.directInput);
    const override = asRecord(pipeline.override);
    const clamp = asRecord(pipeline.clamp);

    const parentEntries = (binding.slots ?? [])
      .map((slot, index) => {
        if (!slot.inputId || slot.inputId === SELF_BINDING_ID) {
          return null;
        }
        const alias = slot.alias?.trim() || slot.id?.trim() || `s${index + 1}`;
        const linkId = buildRigPipelineV1LinkId(slot.inputId, inputId);
        const linkExpression = normalizeStringValue(
          asRecord(pipelineLinks?.[linkId])?.expression,
        );
        return {
          linkId,
          inputId: slot.inputId,
          alias,
          ...(linkExpression !== null ? { expression: linkExpression } : {}),
        };
      })
      .filter(
        (
          entry,
        ): entry is {
          linkId: string;
          inputId: string;
          alias: string;
          expression?: string;
        } => entry !== null,
      );

    const directEnabled =
      typeof direct?.enabled === "boolean" ? direct.enabled : undefined;
    const overrideEnabled =
      typeof override?.enabled === "boolean" ? override.enabled : undefined;
    const overrideValue =
      typeof override?.value === "number" && Number.isFinite(override.value)
        ? override.value
        : undefined;
    const clampEnabled =
      typeof clamp?.enabled === "boolean" ? clamp.enabled : undefined;

    const hasStageControls =
      directEnabled !== undefined ||
      overrideEnabled !== undefined ||
      overrideValue !== undefined ||
      clampEnabled !== undefined ||
      parentBlendExpression !== null ||
      parentEntries.some((entry) =>
        Boolean(normalizeStringValue(entry.expression)),
      );
    if (!migrated && !hasStageControls) {
      return;
    }

    const config: RigPipelineV1InputConfig = {
      inputId,
    };
    if (parentEntries.length > 0) {
      config.parents = parentEntries;
    }
    if (parentBlendMode || parentBlendExpression) {
      config.parentBlend = {
        ...(parentBlendMode ? { mode: parentBlendMode } : {}),
        ...(parentBlendExpression ? { expression: parentBlendExpression } : {}),
      };
    }
    if (directEnabled !== undefined) {
      config.directInput = {
        enabled: directEnabled,
      };
    }
    if (overrideEnabled !== undefined || overrideValue !== undefined) {
      config.override = {
        ...(overrideEnabled !== undefined
          ? { enabledDefault: overrideEnabled }
          : {}),
        ...(overrideValue !== undefined ? { valueDefault: overrideValue } : {}),
      };
    }
    if (clampEnabled !== undefined) {
      config.clamp = {
        enabled: clampEnabled,
      };
    }
    byInputId[inputId] = config;
  });
  return {
    byInputId,
    links,
  };
}

export function sanitizePipelineConfigAndLinksForAvailableInputs(params: {
  byInputId: Record<string, Record<string, unknown>>;
  linksById: Record<string, Record<string, unknown>>;
  availableInputIds: ReadonlySet<string>;
}): {
  byInputId: Record<string, Record<string, unknown>>;
  linksById: Record<string, Record<string, unknown>>;
} {
  if (params.availableInputIds.size === 0) {
    return {
      byInputId: {},
      linksById: {},
    };
  }

  const normalizedByInputId: Record<string, Record<string, unknown>> = {};
  const referencedLinkIds = new Set<string>();
  const referencedParentChildPairs = new Set<string>();

  Object.entries(params.byInputId).forEach(([rawInputId, rawConfig]) => {
    const configRecord = asRecord(rawConfig);
    if (!configRecord) {
      return;
    }
    const resolvedInputId =
      normalizeStringValue(rawInputId) ??
      normalizeStringValue(configRecord.inputId);
    if (!resolvedInputId || !params.availableInputIds.has(resolvedInputId)) {
      return;
    }

    const nextConfig: Record<string, unknown> = {
      ...configRecord,
      inputId: resolvedInputId,
    };

    const parentRecords = Array.isArray(configRecord.parents)
      ? configRecord.parents
      : null;
    if (parentRecords) {
      const nextParents: Record<string, unknown>[] = [];
      parentRecords.forEach((rawParent) => {
        const parentRecord = asRecord(rawParent);
        if (!parentRecord) {
          return;
        }
        const resolvedParentInputId = normalizeStringValue(
          parentRecord.inputId,
        );
        if (
          !resolvedParentInputId ||
          !params.availableInputIds.has(resolvedParentInputId)
        ) {
          return;
        }
        const resolvedLinkId =
          normalizeStringValue(parentRecord.linkId) ??
          buildRigPipelineV1LinkId(resolvedParentInputId, resolvedInputId);
        nextParents.push({
          ...parentRecord,
          inputId: resolvedParentInputId,
          linkId: resolvedLinkId,
        });
        referencedLinkIds.add(resolvedLinkId);
        referencedParentChildPairs.add(
          `${resolvedParentInputId}::${resolvedInputId}`,
        );
      });
      if (nextParents.length > 0) {
        nextConfig.parents = nextParents;
      } else {
        delete nextConfig.parents;
      }
    }

    normalizedByInputId[resolvedInputId] = nextConfig;
  });

  const shouldConstrainLinks = Object.values(normalizedByInputId).some(
    (config) => Array.isArray(asRecord(config)?.parents),
  );
  const normalizedLinksById: Record<string, Record<string, unknown>> = {};
  const linkParentInputIds = new Set<string>();
  Object.entries(params.linksById).forEach(([rawLinkId, rawConfig]) => {
    const linkRecord = asRecord(rawConfig);
    if (!linkRecord) {
      return;
    }
    const parentInputId = normalizeStringValue(linkRecord.parentInputId);
    const childInputId = normalizeStringValue(linkRecord.childInputId);
    if (!parentInputId || !childInputId) {
      return;
    }
    if (
      !params.availableInputIds.has(parentInputId) ||
      !params.availableInputIds.has(childInputId)
    ) {
      return;
    }

    const resolvedLinkId =
      normalizeStringValue(linkRecord.linkId) ??
      normalizeStringValue(rawLinkId) ??
      buildRigPipelineV1LinkId(parentInputId, childInputId);
    if (shouldConstrainLinks) {
      const pairKey = `${parentInputId}::${childInputId}`;
      if (
        !referencedLinkIds.has(resolvedLinkId) &&
        !referencedParentChildPairs.has(pairKey)
      ) {
        return;
      }
    }

    normalizedLinksById[resolvedLinkId] = {
      ...linkRecord,
      linkId: resolvedLinkId,
      parentInputId,
      childInputId,
    };
    linkParentInputIds.add(parentInputId);
  });

  Object.entries(normalizedByInputId).forEach(([inputId, config]) => {
    const configRecord = asRecord(config);
    if (!configRecord) {
      return;
    }
    const parents = Array.isArray(configRecord.parents)
      ? configRecord.parents
      : [];
    const children = Array.isArray(configRecord.children)
      ? configRecord.children
      : [];
    const hasLinkedChildren =
      children.length > 0 || linkParentInputIds.has(inputId);
    const directInput = asRecord(configRecord.directInput);
    const hasExplicitDirectInput =
      directInput && typeof directInput.enabled === "boolean";
    const poseSource = asRecord(configRecord.poseSource);
    const poseTargets = Array.isArray(poseSource?.targetIds)
      ? poseSource.targetIds
      : [];
    const isPropsRigInput = /^propsrig_/i.test(inputId);
    const shouldRepairDeadRelayDriver =
      !isPropsRigInput &&
      hasLinkedChildren &&
      parents.length === 0 &&
      directInput?.enabled === false &&
      poseTargets.length === 0;
    if (!hasLinkedChildren || parents.length > 0 || hasExplicitDirectInput) {
      if (!shouldRepairDeadRelayDriver) {
        return;
      }
    }
    normalizedByInputId[inputId] = {
      ...configRecord,
      directInput: {
        ...(directInput ?? {}),
        enabled: true,
      },
    };
  });

  return {
    byInputId: normalizedByInputId,
    linksById: normalizedLinksById,
  };
}

export function readPipelineLinkPatch(
  binding: AnimatableBinding | null | undefined,
  parentInputId: string,
  childInputId: string,
): {
  scale?: number;
  offset?: number;
  enabled?: boolean;
  expression?: string | null;
} {
  const metadata = asRecord(binding?.metadata);
  const vizij = asRecord(metadata?.vizij);
  const pipeline = asRecord(vizij?.pipelineV1);
  const links = asRecord(pipeline?.links);
  const linkId = buildRigPipelineV1LinkId(parentInputId, childInputId);
  const link = asRecord(links?.[linkId]);
  if (!link) {
    return {};
  }
  return {
    scale: normalizeFiniteValue(link.scale),
    offset: normalizeFiniteValue(link.offset),
    enabled: normalizeBooleanValue(link.enabled),
    expression: normalizeStringValue(link.expression),
  };
}

export function deriveLockedInspectorTargetsFromPipeline(options: {
  bindings: BindingMap;
  standardInputs: readonly StandardRigInput[];
  pipelineConfigByInputId: Record<string, Record<string, unknown>>;
}): Set<string> {
  const { bindings, standardInputs, pipelineConfigByInputId } = options;
  if (!bindings || !standardInputs.length) {
    return new Set<string>();
  }

  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );
  const directInputDisabledIds = new Set<string>();

  Object.entries(pipelineConfigByInputId).forEach(([rawInputId, config]) => {
    const directInput = asRecord(config?.directInput);
    if (directInput?.enabled !== false) {
      return;
    }
    const resolvedInputId = resolveStandardRigInputId(
      rawInputId,
      standardInputsById,
    );
    if (standardInputsById.has(resolvedInputId)) {
      directInputDisabledIds.add(resolvedInputId);
    }
  });

  if (directInputDisabledIds.size === 0) {
    return new Set<string>();
  }

  const lockedTargets = new Set<string>();
  Object.entries(bindings).forEach(([targetId, binding]) => {
    const resolvedIds = collectBindingInputIds(binding)
      .map((inputId) => resolveStandardRigInputId(inputId, standardInputsById))
      .filter((inputId) => standardInputsById.has(inputId));
    if (resolvedIds.length === 0) {
      return;
    }
    const preferredId =
      resolvedIds.find((inputId) =>
        isCanonicalPropsRigInputPath(standardInputsById.get(inputId)?.path),
      ) ?? resolvedIds[0];
    if (preferredId && directInputDisabledIds.has(preferredId)) {
      lockedTargets.add(targetId);
    }
  });

  return lockedTargets;
}

export function canonicalizeImportedPipelineMetadataV1(params: {
  faceId: string;
  standardInputs: readonly StandardRigInput[];
  pipelineMetadataV1: VizijPipelineMetadataV1 | null | undefined;
}): VizijPipelineMetadataV1 | null {
  const { faceId, standardInputs, pipelineMetadataV1 } = params;
  if (!pipelineMetadataV1) {
    return null;
  }

  const standardInputsById = new Map(
    standardInputs.map((input) => [input.id, input]),
  );
  const pipelineConfigByInputId =
    pipelineMetadataV1.byInputId &&
    typeof pipelineMetadataV1.byInputId === "object" &&
    !Array.isArray(pipelineMetadataV1.byInputId)
      ? pipelineMetadataV1.byInputId
      : {};
  const relevantInputIds = new Set<string>(
    Object.keys(pipelineConfigByInputId),
  );
  const links = asRecord(pipelineMetadataV1.links);
  if (links) {
    Object.values(links).forEach((candidate) => {
      const link = asRecord(candidate);
      const parentInputId =
        typeof link?.parentInputId === "string"
          ? link.parentInputId.trim()
          : "";
      const childInputId =
        typeof link?.childInputId === "string" ? link.childInputId.trim() : "";
      if (parentInputId.length > 0) {
        relevantInputIds.add(parentInputId);
      }
      if (childInputId.length > 0) {
        relevantInputIds.add(childInputId);
      }
    });
  }

  const nextByInputId: Record<string, Record<string, unknown>> = {};
  relevantInputIds.forEach((inputId) => {
    const input = standardInputsById.get(inputId);
    if (!input) {
      return;
    }
    const rawConfig = asRecord(pipelineConfigByInputId[inputId]);
    const rawParentBlend = asRecord(rawConfig?.parentBlend);
    const resolvedConfig = resolveRigPipelineV1InputConfig({
      faceId,
      input,
      pipelineV1: pipelineMetadataV1 as Parameters<
        typeof resolveRigPipelineV1InputConfig
      >[0]["pipelineV1"],
    });
    const nextConfig: Record<string, unknown> = {
      ...(rawConfig ?? {}),
      inputId,
    };

    if (resolvedConfig.parents.length > 0) {
      nextConfig.parents = resolvedConfig.parents.map((parent) => ({
        linkId: parent.linkId,
        inputId: parent.inputId,
        alias: parent.alias,
        scale: parent.scale,
        offset: parent.offset,
        enabled: parent.enabled,
        expression: parent.expression,
      }));
    }

    if (resolvedConfig.children.length > 0) {
      nextConfig.children = resolvedConfig.children.map((child) => ({
        linkId: child.linkId,
        childInputId: child.childInputId,
      }));
    }

    if (rawParentBlend || resolvedConfig.parents.length > 0) {
      nextConfig.parentBlend = {
        ...(rawParentBlend ?? {}),
        mode: resolvedConfig.parentBlend.mode,
        expression: resolvedConfig.parentBlend.expression,
      };
    }

    nextByInputId[inputId] = nextConfig;
  });

  return {
    ...pipelineMetadataV1,
    byInputId: nextByInputId,
  };
}
