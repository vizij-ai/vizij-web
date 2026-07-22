import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { SetStateAction } from "react";
import {
  addBindingSlot,
  bindingFromDefinition,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  createDefaultBinding,
  createDefaultInputValues,
  createDefaultParentBinding,
  ensureBindingStructure,
  reconcileBindings,
  updateBindingSlotAlias,
  updateBindingWithInput,
  type AnimatableBinding,
  type BindingMap,
  type BindingTarget,
  type BuildGraphResult,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import {
  useVizijStore,
  useVizijStoreSetter,
  type AnimatedFeature,
  type Feature,
  type Group,
  type VizijData,
  type World,
} from "@vizij/render";
import {
  SELF_BINDING_ID,
  buildRigPipelineV1LinkId,
  buildAnimatableValue,
  createStandardRigInput,
  extractAnimatableComponents,
  getLookup,
  createStandardRigInputFromPath,
  normalizeStandardRigGroup,
  normalizeStandardRigInputPath,
  resolveStandardRigInputId,
  type AnimatableComponent as AnimComponent,
  type AnimatableValue,
  type RigPipelineV1LinkConfig,
  type RigPipelineV1InputConfig,
  type RigBindingDefinition,
  type RigBindingSlot,
  type StandardRigInput,
} from "@vizij/utils";
import { buildRigInputPath } from "../poseRig/utils";
import { buildSceneGraphData } from "../scene/sceneGraph";
import {
  buildAutoRigInputBlueprints,
  type AutoRigInputBlueprintMetadata,
} from "../rig/autoInputs";
import type {
  PersistedAutoStandardInput,
  PersistedGraphInsight,
} from "../rig/persistence";
import { alertDialog } from "../utils/dialogs";
import { deriveAutoFaceId, sanitizeFaceId } from "../utils/faceId";
import { normalizeGraphPath } from "../utils/graphPaths";
import { resolveRigMetadataInputId } from "../utils/rigElementInputs";
import {
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineLinksMapFromMetadata,
  normalizeVizijPipelineConfigMap,
  normalizeVizijPipelineLinkMap,
  type VizijPipelineMetadataV1,
} from "../utils/graphImport";
import {
  buildStandardInputIdRemap,
  remapPipelineMetadataInputIds,
} from "../utils/standardInputRemap";
import type { AutoInputState } from "../types/autoInputs";
import type { GraphRuntimeStore } from "../state/graphRuntimeStore";
import type { BindingAuthoringStore } from "../state/bindingAuthoringStore";
import type { SelectionStore } from "../state/selectionStore";
import { useAnimationStore } from "../state/animationStore";
import {
  assessLegacyBindingMigration,
  buildLegacyMigrationLinkUpserts,
  mergePipelineMetadata,
} from "../components/inspector/pipelineStages";
import { ensureLinkedSlotActiveInExpression } from "../utils/bindingExpressions";
import {
  deriveAliasFromInputDescriptor,
  syncBindingParentAliasReferences,
} from "../utils/rigPipelineAliases";
import { useBindingManager } from "./useBindingManager";
import { useDiscrepancyReview } from "./useDiscrepancyReview";
import { FEATURE_FLAG_DEFAULTS, useFeatureLabels } from "./useFeatureLabels";
import { useManagedStandardInputs } from "./useManagedStandardInputs";
import { useStandardInputCollections } from "./useStandardInputCollections";
import { useStandardInputSelectionSync } from "./useStandardInputSelectionSync";
import { applyShapeInputRename } from "./shapeRenaming";
import {
  createCustomStandardInputEntry,
  updateStandardInputEntry,
} from "./standardInputMutations";
import { linkChildInput, unlinkChildInput } from "./standardInputLinks";
import { subscribeRuntimeInputBridgeAvailable } from "./graphRuntime";
import type { RuntimeGraphSpec } from "./runtimeGraphSpec";
import { useRigGraphImport } from "./useRigGraphImport";
import type { FaceLoadPhaseUpdate } from "./useVizijAssetLoader";
import { useRigPersistence } from "./useRigPersistence";
import { useRigHistoryScope } from "./useRigHistoryScope";
import {
  buildBindingIssuesMap,
  buildGraphMachineReport,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
  resolveRuntimeGraphSpecWithCache,
} from "./rigController/rigGraphCompiler";
import {
  buildRuntimeInputRouteSnapshot,
  createEmptyRuntimeInputRouteSnapshot,
  type RuntimeInputRoute,
} from "./rigController/runtimeInputRoutes";
import {
  flushQueuedRuntimeInputs,
  queueRuntimeInputWrite,
  queueRuntimeInputsFromState,
} from "./rigController/runtimeInputStaging";

const __DEV__ = process.env.NODE_ENV !== "production";

function resolvePersistedAutoKey(
  sourceId?: string | null,
  sourcePath?: string | null,
): string | null {
  if (sourceId && sourceId.length > 0) {
    return sourceId;
  }
  if (sourcePath && sourcePath.length > 0) {
    return normalizeStandardRigInputPath(sourcePath);
  }
  return null;
}

function extractComponentIdFromInputSourceId(
  sourceId: string | null | undefined,
): string | null {
  if (!sourceId) {
    return null;
  }
  const parts = sourceId.split(":");
  if (parts[0] !== "component" || parts.length < 5) {
    return null;
  }
  try {
    return decodeURIComponent(parts[4] ?? "");
  } catch {
    return parts[4] ?? null;
  }
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
  binding:
    | {
        inputId?: string | null;
        slots?: ReadonlyArray<{ inputId?: string | null }>;
      }
    | null
    | undefined,
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
  binding.slots?.forEach((slot) => {
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

export function appendStandardInputPathSuffix(
  path: string,
  suffix: string,
): string {
  const trimmed = path.trim();
  if (trimmed === "/") {
    return `/${suffix.replace(/^_*/, "")}`;
  }
  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 0) {
    return `/${suffix.replace(/^_*/, "")}`;
  }
  const targetIndex = segments.length - 1;
  segments[targetIndex] = `${segments[targetIndex]}${suffix}`;
  return `/${segments.join("/")}`;
}

function remapInputIdList(
  values: readonly string[],
  idRemap: ReadonlyMap<string, string>,
): string[] {
  if (idRemap.size === 0 || values.length === 0) {
    return [...values];
  }
  const next: string[] = [];
  const seen = new Set<string>();
  values.forEach((value) => {
    const mapped = idRemap.get(value) ?? value;
    if (seen.has(mapped)) {
      return;
    }
    seen.add(mapped);
    next.push(mapped);
  });
  return next;
}

function remapInputIdSet(
  values: ReadonlySet<string>,
  idRemap: ReadonlyMap<string, string>,
): Set<string> {
  if (idRemap.size === 0 || values.size === 0) {
    return new Set(values);
  }
  const next = new Set<string>();
  values.forEach((value) => {
    next.add(idRemap.get(value) ?? value);
  });
  return next;
}

function remapStandardInputValues(
  values: StandardInputValues,
  idRemap: ReadonlyMap<string, string>,
): StandardInputValues {
  if (idRemap.size === 0) {
    return values;
  }
  let changed = false;
  const next: StandardInputValues = {};
  Object.entries(values).forEach(([rawInputId, value]) => {
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    if (mappedInputId !== rawInputId) {
      changed = true;
    }
    if (
      mappedInputId !== rawInputId &&
      Object.prototype.hasOwnProperty.call(values, mappedInputId)
    ) {
      return;
    }
    next[mappedInputId] = value;
  });
  return changed ? next : values;
}

function remapBindingMetadataInputIds(
  metadata: AnimatableBinding["metadata"],
  idRemap: ReadonlyMap<string, string>,
): AnimatableBinding["metadata"] {
  if (!metadata || idRemap.size === 0) {
    return metadata;
  }
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) {
    return metadata;
  }
  const vizij = asRecord(metadataRecord.vizij);
  const pipeline = vizij
    ? remapPipelineMetadataInputIds(
        asRecord(vizij.pipelineV1) as VizijPipelineMetadataV1 | null,
        idRemap,
      )
    : null;
  if (!pipeline || pipeline === vizij?.pipelineV1) {
    return metadata;
  }
  return {
    ...metadataRecord,
    vizij: {
      ...(vizij ?? {}),
      pipelineV1: pipeline,
    },
  };
}

function remapBindingInputIds(
  binding: AnimatableBinding,
  target: BindingTarget,
  idRemap: ReadonlyMap<string, string>,
): AnimatableBinding {
  if (idRemap.size === 0) {
    return ensureBindingStructure(binding, target);
  }
  const ensured = ensureBindingStructure(binding, target);
  let changed = false;

  const nextInputId =
    ensured.inputId && idRemap.has(ensured.inputId)
      ? (idRemap.get(ensured.inputId) ?? ensured.inputId)
      : ensured.inputId;
  if (nextInputId !== ensured.inputId) {
    changed = true;
  }
  if (ensured.targetId !== target.id) {
    changed = true;
  }

  const nextSlots = ensured.slots.map((slot) => {
    if (!slot.inputId) {
      return slot;
    }
    const mapped = idRemap.get(slot.inputId);
    if (!mapped || mapped === slot.inputId) {
      return slot;
    }
    changed = true;
    return {
      ...slot,
      inputId: mapped,
    };
  });

  if (!changed) {
    const remappedMetadata = remapBindingMetadataInputIds(
      ensured.metadata,
      idRemap,
    );
    if (remappedMetadata === ensured.metadata) {
      return ensured;
    }
    return {
      ...ensured,
      metadata: remappedMetadata,
      targetId: target.id,
    };
  }

  return ensureBindingStructure(
    {
      ...ensured,
      inputId: nextInputId ?? null,
      slots: nextSlots,
      metadata: remapBindingMetadataInputIds(ensured.metadata, idRemap),
      targetId: target.id,
    },
    target,
  );
}

function remapAnimatableBindings(
  bindings: BindingMap,
  componentsById: ReadonlyMap<string, AnimComponent>,
  idRemap: ReadonlyMap<string, string>,
): BindingMap {
  if (idRemap.size === 0) {
    return bindings;
  }
  let changed = false;
  const next: BindingMap = {};
  Object.entries(bindings).forEach(([targetId, binding]) => {
    if (!binding) {
      return;
    }
    const component = componentsById.get(targetId);
    if (!component) {
      next[targetId] = binding;
      return;
    }
    const remapped = remapBindingInputIds(
      binding,
      bindingTargetFromComponent(component),
      idRemap,
    );
    if (remapped !== binding) {
      changed = true;
    }
    next[targetId] = remapped;
  });
  return changed ? next : bindings;
}

function remapInputBindings(
  inputBindings: InputBindingMap,
  standardInputsById: ReadonlyMap<string, StandardRigInput>,
  idRemap: ReadonlyMap<string, string>,
): InputBindingMap {
  if (idRemap.size === 0) {
    return inputBindings;
  }
  let changed = false;
  const next: InputBindingMap = {};
  Object.entries(inputBindings).forEach(([rawInputId, binding]) => {
    if (!binding) {
      return;
    }
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    const input = standardInputsById.get(mappedInputId);
    if (!input) {
      changed = true;
      return;
    }
    const remappedBinding = remapBindingInputIds(
      binding,
      bindingTargetFromInput(input),
      idRemap,
    );
    if (mappedInputId !== rawInputId || remappedBinding !== binding) {
      changed = true;
    }
    next[mappedInputId] = remappedBinding;
  });
  return changed ? next : inputBindings;
}

function remapBindingDefinition(
  definition: RigBindingDefinition,
  idRemap: ReadonlyMap<string, string>,
): RigBindingDefinition {
  if (idRemap.size === 0) {
    return definition;
  }
  let changed = false;
  const nextInputId =
    definition.inputId && idRemap.has(definition.inputId)
      ? (idRemap.get(definition.inputId) ?? definition.inputId)
      : definition.inputId;
  if (nextInputId !== definition.inputId) {
    changed = true;
  }
  const nextSlots = definition.slots.map((slot) => {
    if (!slot.inputId) {
      return slot;
    }
    const mapped = idRemap.get(slot.inputId);
    if (!mapped || mapped === slot.inputId) {
      return slot;
    }
    changed = true;
    return {
      ...slot,
      inputId: mapped,
    };
  });
  if (!changed) {
    const remappedMetadata = remapBindingMetadataInputIds(
      definition.metadata,
      idRemap,
    );
    if (remappedMetadata === definition.metadata) {
      return definition;
    }
    return {
      ...definition,
      metadata: remappedMetadata,
    };
  }
  return {
    ...definition,
    inputId: nextInputId ?? null,
    slots: nextSlots,
    metadata: remapBindingMetadataInputIds(definition.metadata, idRemap),
  };
}

function remapBindingDefinitionRecord(
  record: Record<string, RigBindingDefinition> | null,
  idRemap: ReadonlyMap<string, string>,
): Record<string, RigBindingDefinition> | null {
  if (!record || idRemap.size === 0) {
    return record;
  }
  let changed = false;
  const next: Record<string, RigBindingDefinition> = {};
  Object.entries(record).forEach(([rawInputId, definition]) => {
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    const remappedDefinition = remapBindingDefinition(definition, idRemap);
    if (mappedInputId !== rawInputId || remappedDefinition !== definition) {
      changed = true;
    }
    next[mappedInputId] = remappedDefinition;
  });
  return changed ? next : record;
}

function remapBindingDefinitionCache(
  cache: ReadonlyMap<string, RigBindingDefinition>,
  idRemap: ReadonlyMap<string, string>,
): Map<string, RigBindingDefinition> {
  if (idRemap.size === 0 || cache.size === 0) {
    return new Map(cache);
  }
  const next = new Map<string, RigBindingDefinition>();
  cache.forEach((definition, rawInputId) => {
    const mappedInputId = idRemap.get(rawInputId) ?? rawInputId;
    next.set(mappedInputId, remapBindingDefinition(definition, idRemap));
  });
  return next;
}

function isDefaultSlotAlias(slot: RigBindingSlot, index: number): boolean {
  if (slot.inputId === SELF_BINDING_ID) {
    return false;
  }
  const alias = slot.alias?.trim();
  if (!alias) {
    return true;
  }
  const normalizedAlias = alias.toLowerCase();
  if (normalizedAlias === "self") {
    return false;
  }
  const defaultAlias = `s${index + 1}`;
  if (normalizedAlias === defaultAlias) {
    return true;
  }
  const slotIdNormalized = slot.id?.trim().toLowerCase();
  if (slotIdNormalized && slotIdNormalized === normalizedAlias) {
    return true;
  }
  return false;
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

  const normalized = [
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
  return normalized;
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

interface DerivedPipelineEdits {
  byInputId: Record<string, RigPipelineV1InputConfig>;
  links: Record<string, RigPipelineV1LinkConfig>;
}

function derivePipelineConfigFromInputBindings(
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

function sanitizePipelineConfigAndLinksForAvailableInputs(params: {
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

function buildUpdatedStandardInputSnapshot(
  inputsById: ReadonlyMap<string, StandardRigInput>,
  options?: {
    deleteIds?: readonly string[];
    upserts?: readonly StandardRigInput[];
  },
): Map<string, StandardRigInput> {
  const next = new Map(inputsById);
  options?.deleteIds?.forEach((inputId) => {
    next.delete(inputId);
  });
  options?.upserts?.forEach((input) => {
    next.set(input.id, input);
  });
  return next;
}

function readPipelineLinkPatch(
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

function upsertParentLinkBinding(params: {
  binding: AnimatableBinding | null | undefined;
  childInput: StandardRigInput;
  parentInput: StandardRigInput;
  scale?: number;
  offset?: number;
  enabled?: boolean;
  expression?: string | null;
}): AnimatableBinding {
  const target = bindingTargetFromInput(params.childInput);
  let next = ensureBindingStructure(
    params.binding ?? createDefaultParentBinding(target),
    target,
  );

  let targetSlotId =
    next.slots.find((slot) => slot.inputId === params.parentInput.id)?.id ??
    null;
  if (!targetSlotId) {
    const reusableSlot = next.slots.find(
      (slot, index) =>
        index > 0 && (slot.inputId === null || slot.inputId === undefined),
    );
    if (reusableSlot) {
      targetSlotId = reusableSlot.id;
    } else {
      next = addBindingSlot(next, target);
      targetSlotId = next.slots[next.slots.length - 1]?.id ?? null;
    }
  }

  next = updateBindingWithInput(
    next,
    target,
    params.parentInput,
    targetSlotId ?? undefined,
  );
  next = ensureLinkedSlotActiveInExpression(next, targetSlotId);

  const linkId = buildRigPipelineV1LinkId(
    params.parentInput.id,
    params.childInput.id,
  );
  return {
    ...next,
    metadata: mergePipelineMetadata(
      (next.metadata ?? undefined) as Record<string, unknown> | undefined,
      {
        directInputEnabled: true,
        linkUpserts: {
          [linkId]: {
            parentInputId: params.parentInput.id,
            childInputId: params.childInput.id,
            ...(params.scale !== undefined ? { scale: params.scale } : {}),
            ...(params.offset !== undefined ? { offset: params.offset } : {}),
            ...(params.enabled !== undefined
              ? { enabled: params.enabled }
              : {}),
            ...(params.expression !== undefined
              ? { expression: params.expression }
              : {}),
          },
        },
      },
    ),
  };
}

type AnimatableComponent = AnimComponent;

type StandardInputId = StandardRigInput["id"];

interface UseRigControllerOptions {
  namespace: string;
  rootId: string | null;
  sourceName: string | null;
  onLoadPhaseChange?: (update: FaceLoadPhaseUpdate) => void;
}

interface UseRigControllerStores {
  graphRuntimeStore: GraphRuntimeStore;
  bindingAuthoringStore: BindingAuthoringStore;
  selectionStore: SelectionStore;
}

export type RigController = void;

export function useRigController(
  { namespace, rootId, sourceName, onLoadPhaseChange }: UseRigControllerOptions,
  stores: UseRigControllerStores,
): RigController {
  const { graphRuntimeStore, bindingAuthoringStore, selectionStore } = stores;
  const poseConfigSnapshot = useSyncExternalStore(
    graphRuntimeStore.subscribe,
    () => graphRuntimeStore.getState().poseConfig,
    () => graphRuntimeStore.getState().poseConfig,
  );
  const world = useVizijStore((state) => state.world) as World;
  const animatables = useVizijStore((state) => state.animatables);
  const setValue = useVizijStore((state) => state.setValue);
  const values = useVizijStore((state) => state.values);

  useEffect(() => {
    graphRuntimeStore.setState({
      world: world as World,
      animatables: animatables as Record<string, AnimatableValue>,
      values,
    });
  }, [animatables, graphRuntimeStore, values, world]);
  const elementSelection = useVizijStore((state) => state.elementSelection);
  const clearSelection = useVizijStore((state) => state.clearSelection);
  const setStoreState = useVizijStoreSetter();

  useEffect(() => {
    graphRuntimeStore.setState({ setStoreState });
  }, [graphRuntimeStore, setStoreState]);

  const getStageRuntimeInput = useCallback(
    () => graphRuntimeStore.getState().stageRuntimeInput,
    [graphRuntimeStore],
  );

  const [graphStatus, setGraphStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [graphPlaybackState, setGraphPlaybackState] = useState<
    "playing" | "paused"
  >("playing");
  const [graphTimeSeconds, setGraphTimeSeconds] = useState(0);
  const [graphFrameRate, setGraphFrameRate] = useState(0);
  const [runtimeInputBridgeEpoch, setRuntimeInputBridgeEpoch] = useState(0);
  const [runtimeInputMapRevision, setRuntimeInputMapRevision] = useState(0);
  const [runtimeInputStageQueueRevision, setRuntimeInputStageQueueRevision] =
    useState(0);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphWarning, setGraphWarning] = useState<string | null>(null);
  const [runtimeViewReadyForPlayback, setRuntimeViewReadyForPlayback] =
    useState(() => graphRuntimeStore.getState().runtimeViewReady);
  const pendingFaceRenameRef = useRef<string | null>(null);
  const faceRenameTokenRef = useRef<string | null>(null);
  const graphPlaybackStateRef = useRef<"playing" | "paused">(
    graphPlaybackState,
  );
  const graphPlaybackFrameRef = useRef<number | null>(null);
  const graphPlaybackStepTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const graphPlaybackLastFrameTimeRef = useRef<number | null>(null);

  useEffect(() => {
    graphRuntimeStore.setState({ graphStatus });
  }, [graphRuntimeStore, graphStatus]);

  useEffect(() => {
    graphRuntimeStore.setState({ graphError });
  }, [graphRuntimeStore, graphError]);
  useEffect(() => {
    graphRuntimeStore.setState({ graphWarning });
  }, [graphRuntimeStore, graphWarning]);
  useEffect(() => {
    graphPlaybackStateRef.current = graphPlaybackState;
  }, [graphPlaybackState]);
  useEffect(
    () =>
      graphRuntimeStore.subscribe(() => {
        const nextReady = graphRuntimeStore.getState().runtimeViewReady;
        setRuntimeViewReadyForPlayback((previous) =>
          previous === nextReady ? previous : nextReady,
        );
      }),
    [graphRuntimeStore],
  );

  useEffect(
    () =>
      subscribeRuntimeInputBridgeAvailable(graphRuntimeStore, () => {
        setRuntimeInputBridgeEpoch((prev) => prev + 1);
      }),
    [graphRuntimeStore],
  );

  const [faceId, setFaceIdState] = useState<string>("robot");
  const clearFaceRenameToken = useCallback(
    (token: string) => {
      graphRuntimeStore.setState((state) => {
        if (state.faceRenameToken !== token) {
          return;
        }
        return { ...state, faceRenameToken: null };
      });
      if (faceRenameTokenRef.current === token) {
        faceRenameTokenRef.current = null;
      }
      if (pendingFaceRenameRef.current === token) {
        pendingFaceRenameRef.current = null;
      }
    },
    [graphRuntimeStore],
  );

  const updateFaceId = useCallback(
    (value: SetStateAction<string>, { rename = false } = {}) => {
      setFaceIdState((previous) => {
        const nextValue = typeof value === "function" ? value(previous) : value;
        const trimmed = nextValue.trim();
        if (trimmed.length === 0) {
          return "";
        }
        const sanitized = sanitizeFaceId(trimmed);
        if (sanitized === previous && !rename) {
          return previous;
        }
        const faceRenameToken = rename ? sanitized : null;
        faceRenameTokenRef.current = faceRenameToken;
        pendingFaceRenameRef.current = faceRenameToken;
        if (rename) {
          // Clear the rename marker after the rename is applied so later face/root
          // changes trigger a full pose reset.
          setTimeout(() => clearFaceRenameToken(sanitized), 0);
        }
        return sanitized;
      });
    },
    [clearFaceRenameToken],
  );

  const setFaceId = useCallback(
    (value: SetStateAction<string>) => updateFaceId(value),
    [updateFaceId],
  );

  const renameFaceId = useCallback(
    (value: SetStateAction<string>) => updateFaceId(value, { rename: true }),
    [updateFaceId],
  );
  const [autoInputs, setAutoInputs] = useState<Map<string, AutoInputState>>(
    () => new Map(),
  );
  const GROUP_FALLBACK = "custom";

  const autoInputsRef = useRef(autoInputs);
  const [customInputs, setCustomInputs] = useState<StandardRigInput[]>([]);
  const customInputsRef = useRef(customInputs);
  const [selectedStandardInputRoots, setSelectedStandardInputRoots] = useState<
    string[]
  >([]);
  const [selectedStandardInputSubgroups, setSelectedStandardInputSubgroups] =
    useState<string[]>([]);
  const [disabledStandardInputIds, setDisabledStandardInputIds] = useState<
    string[]
  >([]);
  const [lockedInspectorTargetIds, setLockedInspectorTargetIds] = useState<
    Set<string>
  >(() => new Set());
  const lockedInspectorTargetIdsRef = useRef<Set<string>>(new Set());
  const [standardInputSchema, setStandardInputSchema] = useState<{
    id: string;
    version: string;
  } | null>({ id: "vizij-standard-face", version: "v1" });
  const [hiddenDriverIds, setHiddenDriverIds] = useState<Set<string>>(
    () => new Set(),
  );
  const viewerSelectionActiveRef = useRef(false);
  const [inputValues, setInputValues] = useState<StandardInputValues>({});
  const inputValuesRef = useRef<StandardInputValues>(inputValues);
  const timelineLockedInputIdsRef = useRef<Set<string>>(new Set());
  const timelineInputLockActiveRef = useRef(false);
  const updateInputValues = useCallback(
    (updater: (prev: StandardInputValues) => StandardInputValues) => {
      setInputValues((previous) => {
        const next = updater(previous);
        if (next !== previous) {
          inputValuesRef.current = next;
        }
        return next;
      });
    },
    [],
  );
  const isDev = process.env.NODE_ENV !== "production";
  const debugLog = (...args: unknown[]) => {
    if (isDev) {
      // eslint-disable-next-line no-console -- debug logger
      console.debug("[rig-controller]", ...args);
    }
  };
  const {
    featureLabelOverrides,
    setFeatureLabelOverrides,
    featureFlags,
    setFeatureFlags,
    handleFeatureFlagChange,
    handleUpdateFeatureLabel,
  } = useFeatureLabels();

  const handleSetStandardInputSchema = useCallback(
    (
      schema:
        | { id: string; version: string }
        | null
        | ((
            prev: { id: string; version: string } | null,
          ) => { id: string; version: string } | null),
    ) => {
      setStandardInputSchema((prev) =>
        typeof schema === "function" ? schema(prev) : schema,
      );
    },
    [],
  );

  const handleHideDriver = useCallback((inputId: string) => {
    setHiddenDriverIds((previous) => {
      if (previous.has(inputId)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(inputId);
      return next;
    });
  }, []);

  const handleShowDriver = useCallback((inputId: string) => {
    setHiddenDriverIds((previous) => {
      if (!previous.has(inputId)) {
        return previous;
      }
      const next = new Set(previous);
      next.delete(inputId);
      return next;
    });
  }, []);

  const handleShowAllDrivers = useCallback(() => {
    setHiddenDriverIds((previous) => {
      if (previous.size === 0) {
        return previous;
      }
      return new Set();
    });
  }, []);

  const setInspectorTargetLockedState = useCallback(
    (targetId: string, locked: boolean) => {
      const normalized = targetId.trim();
      if (!normalized) {
        return;
      }
      setLockedInspectorTargetIds((previous) => {
        const alreadyLocked = previous.has(normalized);
        if (locked ? alreadyLocked : !alreadyLocked) {
          return previous;
        }
        const next = new Set(previous);
        if (locked) {
          next.add(normalized);
        } else {
          next.delete(normalized);
        }
        return next;
      });
    },
    [],
  );
  const [graphInsights, setGraphInsights] =
    useState<PersistedGraphInsight | null>(null);
  const [pipelineMetadataV1, setPipelineMetadataV1] =
    useState<VizijPipelineMetadataV1 | null>(null);

  useEffect(() => {
    graphRuntimeStore.setState({ graphInsights });
  }, [graphInsights, graphRuntimeStore]);
  const { discrepancyReview, openDiscrepancyReview, resolveDiscrepancyReview } =
    useDiscrepancyReview();

  useEffect(() => {
    graphRuntimeStore.setState({ discrepancyReview, resolveDiscrepancyReview });
  }, [discrepancyReview, graphRuntimeStore, resolveDiscrepancyReview]);

  const persistedAutoInputsRef = useRef<
    Map<string, PersistedAutoStandardInput>
  >(new Map());
  const pendingInputBindingDefinitionsRef = useRef<Record<
    string,
    RigBindingDefinition
  > | null>(null);
  const disabledInputBindingCacheRef = useRef<
    Map<string, RigBindingDefinition>
  >(new Map());
  const allStandardInputsRef = useRef<Map<string, StandardRigInput>>(new Map());
  const standardInputsByIdRef = useRef<Map<string, StandardRigInput>>(
    new Map(),
  );
  const disabledStandardInputIdsRef = useRef<Set<string>>(new Set());

  const drivenAnimatablesRef = useRef<Set<string>>(new Set());
  const graphSummaryRef = useRef<BuildGraphResult["summary"] | null>(null);
  const graphIrRef = useRef<BuildGraphResult["ir"] | null>(null);
  const lastGraphSummaryLogSignatureRef = useRef<string | null>(null);
  const lastKnownGoodRuntimeSpecRef = useRef<RuntimeGraphSpec | null>(null);
  const skipRuntimeUnloadRef = useRef(false);
  const runtimeInputRoutesByCanonicalIdRef = useRef<
    Map<string, RuntimeInputRoute>
  >(new Map());
  const runtimeInputGraphPathLookupRef = useRef<Map<string, string>>(new Map());
  const stagedRuntimeInputValuesRef = useRef<Map<string, number>>(new Map());
  const queuedRuntimeInputValuesRef = useRef<Map<string, number>>(new Map());
  const runtimeInputIdResolutionCacheRef = useRef<{
    sourceMap: Map<string, StandardRigInput> | null;
    cache: Map<string, string>;
  }>({
    sourceMap: null,
    cache: new Map(),
  });
  const autoPlayTokenRef = useRef<string | null>(null);

  const [graphInputDefaults, setGraphInputDefaults] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    graphRuntimeStore.setState({ graphInputDefaults });
  }, [graphInputDefaults, graphRuntimeStore]);
  const lastAutoFaceIdRef = useRef<string | null>(null);
  const lastLoadedFaceIdRef = useRef<string | null>(null);
  const skipPersistRef = useRef(false);

  const resolveRuntimeInputId = useCallback((inputId: string): string => {
    const normalized = inputId.trim();
    if (!normalized) {
      return inputId;
    }
    const sourceMap = standardInputsByIdRef.current;
    const cacheState = runtimeInputIdResolutionCacheRef.current;
    if (cacheState.sourceMap !== sourceMap) {
      cacheState.sourceMap = sourceMap;
      cacheState.cache = new Map();
    }
    const cached = cacheState.cache.get(normalized);
    if (cached) {
      return cached;
    }
    const resolved = resolveStandardRigInputId(normalized, sourceMap);
    cacheState.cache.set(normalized, resolved);
    return resolved;
  }, []);

  useEffect(() => {
    const syncTimelineLocks = () => {
      const animationState = useAnimationStore.getState();
      const timelineDriving =
        animationState.transportEnabled &&
        animationState.transportPlaybackState === "playing";
      const nextLockedInputIds = new Set<string>();
      if (timelineDriving) {
        animationState.tracks.forEach((track) => {
          const normalizedTrackId = track.variableId?.trim();
          if (!normalizedTrackId) {
            return;
          }
          nextLockedInputIds.add(normalizedTrackId);
          nextLockedInputIds.add(resolveRuntimeInputId(normalizedTrackId));
        });
      }
      timelineLockedInputIdsRef.current = nextLockedInputIds;
      timelineInputLockActiveRef.current = timelineDriving;
      bindingAuthoringStore.setState({
        timelineInputLockActive: timelineDriving,
        timelineLockedInputIds: nextLockedInputIds,
      });
    };
    syncTimelineLocks();
    const unsubscribe = useAnimationStore.subscribe(syncTimelineLocks);
    return unsubscribe;
  }, [bindingAuthoringStore, resolveRuntimeInputId]);

  const isTimelineInputLocked = useCallback(
    (inputId: string): boolean => {
      if (!timelineInputLockActiveRef.current) {
        return false;
      }
      const normalizedInputId = inputId.trim();
      if (!normalizedInputId) {
        return false;
      }
      const lockedIds = timelineLockedInputIdsRef.current;
      if (lockedIds.has(normalizedInputId)) {
        return true;
      }
      return lockedIds.has(resolveRuntimeInputId(normalizedInputId));
    },
    [resolveRuntimeInputId],
  );

  const animatableComponents = useMemo(
    () => extractAnimatableComponents(animatables),
    [animatables],
  );

  const componentsById = useMemo(
    () =>
      new Map<string, AnimatableComponent>(
        animatableComponents.map((component) => [component.id, component]),
      ),
    [animatableComponents],
  );

  const maybeAutoAliasSlot = useCallback(
    (
      binding: AnimatableBinding,
      target: BindingTarget,
      slotId: string,
      input: StandardRigInput | undefined,
    ): AnimatableBinding => {
      if (!input) {
        return binding;
      }
      const slotIndex = binding.slots.findIndex((slot) => slot.id === slotId);
      if (slotIndex < 0) {
        return binding;
      }
      const slot = binding.slots[slotIndex]!;
      if (!isDefaultSlotAlias(slot, slotIndex)) {
        return binding;
      }
      const aliasCandidate = deriveAliasFromInputDescriptor(input);
      if (!aliasCandidate) {
        return binding;
      }
      return updateBindingSlotAlias(binding, target, slotId, aliasCandidate);
    },
    [],
  );
  const {
    bindings,
    setBindings,
    applyBindingPatch,
    applyInputBindingPatch,
    inputBindings,
    setInputBindings,
    inputBindingsRef,
    updateInputBinding,
    handleBindingInputChange,
    handleAddBindingSlot,
    handleRemoveBindingSlot,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleBindingSlotValueTypeChange,
    handleResetBinding,
    handleEnsureParentBinding,
    handleParentBindingInputChange,
    handleParentAddBindingSlot,
    handleParentRemoveBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentResetBinding,
    handleEnableParentLocalControl,
    handleCreateParentDriverBinding,
  } = useBindingManager({
    componentsById,
    standardInputsByIdRef,
    allStandardInputsRef,
    maybeAutoAliasSlot,
    debugLog,
  });
  useEffect(() => {
    if (rootId) {
      return;
    }
    const emptyLockedInspectorIds = new Set<string>();
    setAutoInputs(new Map());
    setCustomInputs([]);
    setSelectedStandardInputRoots([]);
    setSelectedStandardInputSubgroups([]);
    setDisabledStandardInputIds([]);
    setLockedInspectorTargetIds(emptyLockedInspectorIds);
    lockedInspectorTargetIdsRef.current = emptyLockedInspectorIds;
    setStandardInputSchema({ id: "vizij-standard-face", version: "v1" });
    setHiddenDriverIds(new Set());
    updateInputValues(() => ({}));
    setFeatureLabelOverrides({});
    setFeatureFlags({ ...FEATURE_FLAG_DEFAULTS });
    setBindings({});
    setInputBindings({});
    bindingAuthoringStore.setState({
      bindingIssues: new Map(),
      featureLabelOverrides: {},
      featureFlags: { ...FEATURE_FLAG_DEFAULTS },
      standardInputSchema: { id: "vizij-standard-face", version: "v1" },
      managedStandardInputs: [],
      standardInputRoots: [],
      selectedStandardInputRoots: [],
      selectedStandardInputSubgroups: [],
      standardInputs: [],
      standardInputsById: new Map(),
      standardInputsByPath: new Map(),
      rigOutputLookup: new Map(),
      validOutputTargets: new Set(),
      pipelineMetadataV1: null,
      pipelineConfigByInputId: {},
      inputValues: {},
      timelineInputLockActive: false,
      timelineLockedInputIds: new Set(),
      bindings: {},
      inputBindings: {},
      animatableComponents: [],
      lockedInspectorTargetIds: emptyLockedInspectorIds,
      lockedPropsRigInputIds: new Set(),
      sceneObjects: [],
      sceneObjectRoots: [],
      hiddenDriverIds: new Set(),
      selectedRigId: null,
      selectedMaterialId: null,
    });
  }, [
    bindingAuthoringStore,
    rootId,
    setBindings,
    setFeatureFlags,
    setFeatureLabelOverrides,
    setInputBindings,
    updateInputValues,
  ]);

  const availablePipelineInputIds = useMemo(() => {
    const next = new Set<string>();
    autoInputs.forEach((entry) => {
      const normalizedId = normalizeStringValue(entry.input.id);
      if (normalizedId) {
        next.add(normalizedId);
      }
    });
    customInputs.forEach((input) => {
      const normalizedId = normalizeStringValue(input.id);
      if (normalizedId) {
        next.add(normalizedId);
      }
    });
    return next;
  }, [autoInputs, customInputs]);

  const derivedPipelineEdits = useMemo(
    () => derivePipelineConfigFromInputBindings(inputBindings),
    [inputBindings],
  );

  const mergedPipelineConfigByInputId: Record<
    string,
    Record<string, unknown>
  > = useMemo(() => {
    const imported =
      extractVizijPipelineConfigMapFromMetadata(pipelineMetadataV1);
    const localEdits = normalizeVizijPipelineConfigMap(
      derivedPipelineEdits.byInputId,
    );
    return mergeImportedAndLocalPipelineConfigByInputId(imported, localEdits);
  }, [derivedPipelineEdits.byInputId, pipelineMetadataV1]);

  const mergedPipelineLinksById: Record<
    string,
    Record<string, unknown>
  > = useMemo(() => {
    const imported =
      extractVizijPipelineLinksMapFromMetadata(pipelineMetadataV1);
    const localEdits = normalizeVizijPipelineLinkMap(
      derivedPipelineEdits.links,
    );
    return mergeImportedAndLocalPipelineLinksById(imported, localEdits);
  }, [derivedPipelineEdits.links, pipelineMetadataV1]);

  const {
    byInputId: basePipelineConfigByInputId,
    linksById: pipelineLinksById,
  } = useMemo(
    () =>
      sanitizePipelineConfigAndLinksForAvailableInputs({
        byInputId: mergedPipelineConfigByInputId,
        linksById: mergedPipelineLinksById,
        availableInputIds: availablePipelineInputIds,
      }),
    [
      availablePipelineInputIds,
      mergedPipelineConfigByInputId,
      mergedPipelineLinksById,
    ],
  );

  const mergedPipelineMetadataV1 = useMemo(() => {
    const hasBase =
      Boolean(pipelineMetadataV1) &&
      typeof pipelineMetadataV1 === "object" &&
      !Array.isArray(pipelineMetadataV1);
    const hasByInput = Object.keys(basePipelineConfigByInputId).length > 0;
    const hasLinks = Object.keys(pipelineLinksById).length > 0;
    if (!hasBase && !hasByInput && !hasLinks) {
      return null;
    }
    const next: VizijPipelineMetadataV1 = hasBase
      ? ({
          ...(pipelineMetadataV1 as Record<string, unknown>),
        } as VizijPipelineMetadataV1)
      : {};
    if (hasByInput) {
      next.byInputId = basePipelineConfigByInputId;
    } else {
      delete next.byInputId;
    }
    if (hasLinks) {
      next.links = pipelineLinksById;
    } else {
      delete next.links;
    }
    return next;
  }, [basePipelineConfigByInputId, pipelineLinksById, pipelineMetadataV1]);

  useEffect(() => {
    const validTargets = new Set(
      animatableComponents.map((component) => component.id),
    );
    applyBindingPatch((previous) => {
      let changed = false;
      const next: BindingMap = {};
      Object.entries(previous).forEach(([targetId, binding]) => {
        if (!validTargets.has(targetId)) {
          changed = true;
          return;
        }
        next[targetId] = binding;
      });
      return changed ? next : previous;
    });
  }, [animatableComponents, applyBindingPatch]);

  const explicitStandardInputIdRemapRevisionRef = useRef(0);
  const lastSkippedExplicitStandardInputIdRemapRevisionRef = useRef(0);

  const syncStandardInputSnapshotRefs = useCallback(
    (options: {
      deleteIds?: readonly string[];
      upserts?: readonly StandardRigInput[];
    }) => {
      allStandardInputsRef.current = buildUpdatedStandardInputSnapshot(
        allStandardInputsRef.current,
        options,
      );
      standardInputsByIdRef.current = buildUpdatedStandardInputSnapshot(
        standardInputsByIdRef.current,
        options,
      );
      runtimeInputIdResolutionCacheRef.current = {
        sourceMap: null,
        cache: new Map(),
      };
    },
    [],
  );

  const publishStandardInputIdRemap = useCallback(
    (idRemap: ReadonlyMap<string, string>) => {
      if (idRemap.size === 0) {
        return 0;
      }
      explicitStandardInputIdRemapRevisionRef.current += 1;
      const revision = explicitStandardInputIdRemapRevisionRef.current;
      bindingAuthoringStore.setState({
        standardInputIdRemap: new Map(idRemap),
        standardInputIdRemapRevision: revision,
      });
      return revision;
    },
    [bindingAuthoringStore],
  );

  const applyStandardInputIdRemapSideEffects = useCallback(
    (idRemap: ReadonlyMap<string, string>) => {
      if (idRemap.size === 0) {
        return;
      }

      setHiddenDriverIds((previous) => {
        const next = remapInputIdSet(previous, idRemap);
        if (
          next.size === previous.size &&
          Array.from(next).every((value) => previous.has(value))
        ) {
          return previous;
        }
        return next;
      });
      setPipelineMetadataV1((previous) =>
        remapPipelineMetadataInputIds(previous, idRemap),
      );

      const remappedTimelineLockedInputIds = remapInputIdSet(
        timelineLockedInputIdsRef.current,
        idRemap,
      );
      timelineLockedInputIdsRef.current = remappedTimelineLockedInputIds;

      bindingAuthoringStore.setState((state) => {
        const mappedSelectedRigId = state.selectedRigId
          ? (idRemap.get(state.selectedRigId) ?? state.selectedRigId)
          : state.selectedRigId;
        const timelineLockedInputIds = remappedTimelineLockedInputIds;
        const selectedRigChanged = mappedSelectedRigId !== state.selectedRigId;
        const timelineChanged =
          timelineLockedInputIds !== state.timelineLockedInputIds;
        if (!selectedRigChanged && !timelineChanged) {
          return;
        }
        return {
          ...(selectedRigChanged ? { selectedRigId: mappedSelectedRigId } : {}),
          ...(timelineChanged
            ? { timelineLockedInputIds: timelineLockedInputIds }
            : {}),
        };
      });

      const animationState = useAnimationStore.getState();
      let animationTracksChanged = false;
      const remappedAnimationTracks = animationState.tracks.map((track) => {
        const mappedVariableId =
          idRemap.get(track.variableId) ?? track.variableId;
        if (mappedVariableId === track.variableId) {
          return track;
        }
        animationTracksChanged = true;
        return {
          ...track,
          variableId: mappedVariableId,
          channel:
            track.channel === track.variableId
              ? mappedVariableId
              : track.channel,
          label:
            track.label === track.variableId ? mappedVariableId : track.label,
        };
      });
      if (animationTracksChanged) {
        useAnimationStore.setState({ tracks: remappedAnimationTracks });
      }

      publishStandardInputIdRemap(idRemap);
    },
    [
      bindingAuthoringStore,
      publishStandardInputIdRemap,
      setHiddenDriverIds,
      setPipelineMetadataV1,
    ],
  );

  const applyStandardInputIdRemap = useCallback(
    (
      idRemap: ReadonlyMap<string, string>,
      nextInputsById: ReadonlyMap<string, StandardRigInput>,
    ) => {
      if (idRemap.size === 0) {
        return;
      }
      updateInputValues((previous) =>
        remapStandardInputValues(previous, idRemap),
      );
      setBindings((previous) =>
        remapAnimatableBindings(previous, componentsByIdRef.current, idRemap),
      );
      setInputBindings((previous) =>
        remapInputBindings(previous, nextInputsById, idRemap),
      );
      setDisabledStandardInputIds((previous) => {
        const next = remapInputIdList(previous, idRemap);
        return next.length === previous.length &&
          next.every((value, index) => value === previous[index])
          ? previous
          : next;
      });
      pendingInputBindingDefinitionsRef.current = remapBindingDefinitionRecord(
        pendingInputBindingDefinitionsRef.current,
        idRemap,
      );
      disabledInputBindingCacheRef.current = remapBindingDefinitionCache(
        disabledInputBindingCacheRef.current,
        idRemap,
      );
      applyStandardInputIdRemapSideEffects(idRemap);
    },
    [
      applyStandardInputIdRemapSideEffects,
      setBindings,
      setDisabledStandardInputIds,
      setInputBindings,
      updateInputValues,
    ],
  );

  const handleCreateCustomStandardInput = useCallback(
    (path: string): StandardRigInput | null =>
      createCustomStandardInputEntry({
        path,
        autoInputsRef,
        setCustomInputs,
        updateInputValues,
      }),
    [setCustomInputs, updateInputValues],
  );

  const handleUpdateStandardInput = useCallback(
    (
      inputId: string,
      updates: {
        path?: string;
        label?: string;
        sourceId?: string | null;
        defaultValue?: number;
        range?: { min?: number; max?: number };
      },
    ) => {
      const previousInput = standardInputsByIdRef.current.get(inputId) ?? null;
      const result = updateStandardInputEntry({
        inputId,
        updates,
        autoInputsRef,
        customInputsRef,
        setAutoInputs,
        setCustomInputs,
        persistedAutoInputsRef,
        resolvePersistedAutoKey,
        groupFallback: GROUP_FALLBACK,
      });
      if (!result) {
        return;
      }
      syncStandardInputSnapshotRefs({
        deleteIds:
          result.previousId !== result.nextId ? [result.previousId] : undefined,
        upserts: [result.updatedInput],
      });
      if (result.previousId === result.nextId) {
        setInputBindings((previous) => {
          if (!previousInput) {
            return previous;
          }
          let changed = false;
          const next: InputBindingMap = {};
          Object.entries(previous).forEach(([childInputId, binding]) => {
            if (!binding) {
              return;
            }
            const childInput = standardInputsByIdRef.current.get(childInputId);
            if (!childInput) {
              next[childInputId] = binding;
              return;
            }
            const updatedBinding = syncBindingParentAliasReferences({
              binding,
              childInput,
              standardInputsById: standardInputsByIdRef.current,
              parentInputBefore: previousInput,
              parentInputAfter: result.updatedInput,
            });
            if (updatedBinding !== binding) {
              changed = true;
            }
            next[childInputId] = updatedBinding;
          });
          return changed ? next : previous;
        });
        return;
      }
      applyStandardInputIdRemap(
        new Map([[result.previousId, result.nextId]]),
        standardInputsByIdRef.current,
      );
      setInputBindings((previous) => {
        if (!previousInput) {
          return previous;
        }
        let changed = false;
        const next: InputBindingMap = {};
        Object.entries(previous).forEach(([childInputId, binding]) => {
          if (!binding) {
            return;
          }
          const childInput = standardInputsByIdRef.current.get(childInputId);
          if (!childInput) {
            next[childInputId] = binding;
            return;
          }
          const updatedBinding = syncBindingParentAliasReferences({
            binding,
            childInput,
            standardInputsById: standardInputsByIdRef.current,
            parentInputBefore: previousInput,
            parentInputAfter: result.updatedInput,
          });
          if (updatedBinding !== binding) {
            changed = true;
          }
          next[childInputId] = updatedBinding;
        });
        return changed ? next : previous;
      });
    },
    [
      applyStandardInputIdRemap,
      autoInputsRef,
      customInputsRef,
      setInputBindings,
      setAutoInputs,
      setCustomInputs,
      syncStandardInputSnapshotRefs,
    ],
  );

  const handleCloneStandardInputs = useCallback(
    (
      inputIds: readonly string[],
      options?: {
        labelSuffix?: string;
        pathSuffix?: string;
        cloneRelationships?: boolean;
      },
    ) => {
      const mapping = new Map<string, string>();
      const labelSuffix = options?.labelSuffix ?? " Copy";
      const pathSuffix = options?.pathSuffix ?? "_copy";
      const cloneRelationships = options?.cloneRelationships === true;
      const existingIds = new Set<string>(
        Array.from(allStandardInputsRef.current.keys()),
      );
      const existingPaths = new Set<string>(
        Array.from(allStandardInputsRef.current.values()).map((input) =>
          normalizeStandardRigInputPath(input.path),
        ),
      );
      const clonedInputs: StandardRigInput[] = [];

      inputIds.forEach((sourceId) => {
        if (mapping.has(sourceId)) {
          return;
        }
        const source = standardInputsByIdRef.current.get(sourceId);
        if (!source) {
          return;
        }
        let attempt = 1;
        let candidatePath = normalizeStandardRigInputPath(
          appendStandardInputPathSuffix(source.path, pathSuffix),
        );
        let candidateId = createStandardRigInputFromPath(candidatePath).id;
        while (
          existingIds.has(candidateId) ||
          existingPaths.has(candidatePath)
        ) {
          const suffix = attempt === 1 ? pathSuffix : `${pathSuffix}${attempt}`;
          candidatePath = normalizeStandardRigInputPath(
            appendStandardInputPathSuffix(source.path, suffix),
          );
          candidateId = createStandardRigInputFromPath(candidatePath).id;
          attempt += 1;
        }

        const cloned: StandardRigInput = {
          ...source,
          id: candidateId,
          path: candidatePath,
          label: `${source.label}${labelSuffix}`,
          parentBinding: source.parentBinding ?? undefined,
          derivedChildren: source.derivedChildren
            ? [...source.derivedChildren]
            : [],
        };
        clonedInputs.push(cloned);
        existingIds.add(candidateId);
        existingPaths.add(candidatePath);
        mapping.set(source.id, cloned.id);
      });

      if (clonedInputs.length === 0) {
        return mapping;
      }

      setCustomInputs((previous) => {
        const next = [...previous, ...clonedInputs];
        customInputsRef.current = next;
        return next;
      });
      syncStandardInputSnapshotRefs({ upserts: clonedInputs });

      updateInputValues((prev) => {
        const next = { ...prev };
        mapping.forEach((newId, oldId) => {
          const src = standardInputsByIdRef.current.get(oldId);
          if (src) {
            next[newId] = src.defaultValue ?? 0;
          }
        });
        return next;
      });

      if (cloneRelationships) {
        const nextInputsById = standardInputsByIdRef.current;
        setInputBindings((previous) => {
          let changed = false;
          const next: InputBindingMap = { ...previous };

          mapping.forEach((clonedInputId, sourceInputId) => {
            const sourceBinding = previous[sourceInputId];
            const clonedInput = nextInputsById.get(clonedInputId);
            if (!sourceBinding || !clonedInput) {
              return;
            }
            next[clonedInputId] = bindingFromDefinition(
              bindingTargetFromInput(clonedInput),
              remapBindingDefinition(
                bindingToDefinition(sourceBinding),
                mapping,
              ),
            );
            changed = true;
          });

          Object.entries(previous).forEach(([childInputId, binding]) => {
            if (!binding || mapping.has(childInputId)) {
              return;
            }
            const childInput = nextInputsById.get(childInputId);
            if (!childInput) {
              return;
            }
            mapping.forEach((clonedInputId, sourceInputId) => {
              const parentIds = collectBindingInputIds(binding);
              if (!parentIds.includes(sourceInputId)) {
                return;
              }
              const clonedParentInput = nextInputsById.get(clonedInputId);
              if (!clonedParentInput) {
                return;
              }
              const linkPatch = readPipelineLinkPatch(
                binding,
                sourceInputId,
                childInputId,
              );
              const updatedBinding = upsertParentLinkBinding({
                binding: next[childInputId] ?? binding,
                childInput,
                parentInput: clonedParentInput,
                scale: linkPatch.scale ?? 1,
                offset:
                  linkPatch.offset ??
                  (Number.isFinite(childInput.defaultValue)
                    ? childInput.defaultValue
                    : 0),
                enabled: linkPatch.enabled ?? true,
                expression: linkPatch.expression,
              });
              const previousDefinition = bindingToDefinition(
                next[childInputId] ?? binding,
              );
              const nextDefinition = bindingToDefinition(updatedBinding);
              if (
                JSON.stringify(previousDefinition) ===
                JSON.stringify(nextDefinition)
              ) {
                return;
              }
              next[childInputId] = updatedBinding;
              changed = true;
            });
          });

          return changed ? next : previous;
        });
      }

      return mapping;
    },
    [
      setCustomInputs,
      setInputBindings,
      syncStandardInputSnapshotRefs,
      updateInputValues,
    ],
  );

  const pruneInputBindings = useCallback(
    (removedInputId: string, snapshot?: Map<string, StandardRigInput>) => {
      const inputsSnapshot =
        snapshot ?? new Map(standardInputsByIdRef.current.entries());
      setInputBindings((previous) => {
        let changed = false;
        const next: InputBindingMap = {};
        Object.entries(previous).forEach(([targetId, binding]) => {
          if (targetId === removedInputId) {
            changed = true;
            return;
          }
          const targetInput = inputsSnapshot.get(targetId);
          if (!targetInput) {
            next[targetId] = binding;
            return;
          }
          const target = bindingTargetFromInput(targetInput);
          const ensured = ensureBindingStructure(binding, target);
          let updated = ensured;
          if (ensured.inputId === removedInputId) {
            updated = updateBindingWithInput(updated, target, undefined);
          }
          ensured.slots.forEach((slot) => {
            if (slot.inputId === removedInputId) {
              updated = updateBindingWithInput(
                updated,
                target,
                undefined,
                slot.id,
              );
            }
          });
          const normalized = ensureBindingStructure(updated, target);
          const hasParents =
            (normalized.inputId && normalized.inputId !== SELF_BINDING_ID) ||
            normalized.slots.some(
              (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
            );
          if (!hasParents) {
            changed = true;
            return;
          }
          const previousDefinition = bindingToDefinition(ensured);
          const nextDefinition = bindingToDefinition(normalized);
          if (
            JSON.stringify(previousDefinition) !==
            JSON.stringify(nextDefinition)
          ) {
            changed = true;
          }
          next[targetId] = normalized;
        });
        return changed ? next : previous;
      });
    },
    [],
  );

  const removeInputFromAnimatableBindings = useCallback(
    (inputId: string) => {
      setBindings((previous) => {
        let changed = false;
        const next: BindingMap = {};
        Object.entries(previous).forEach(([key, binding]) => {
          if (!binding) {
            return;
          }
          const component = componentsByIdRef.current.get(key);
          if (!component) {
            next[key] = binding;
            return;
          }
          const target = bindingTargetFromComponent(component);
          const ensured = ensureBindingStructure(binding, target);
          let updated = ensured;
          ensured.slots.forEach((slot) => {
            if (slot.inputId === inputId) {
              updated = updateBindingWithInput(
                updated,
                target,
                undefined,
                slot.id,
              );
            }
          });
          if (updated !== binding) {
            changed = true;
          }
          next[key] = updated;
        });
        return changed ? next : previous;
      });
    },
    [setBindings],
  );

  const handleDeleteCustomStandardInput = useCallback(
    (inputId: string) => {
      const isAuto = Array.from(autoInputsRef.current.values()).some(
        (entry) => entry.input.id === inputId,
      );
      if (isAuto) {
        return;
      }
      const snapshot = new Map(standardInputsByIdRef.current.entries());
      setCustomInputs((previous) =>
        previous.filter((input) => input.id !== inputId),
      );
      updateInputValues((previous) => {
        if (!Object.prototype.hasOwnProperty.call(previous, inputId)) {
          return previous;
        }
        const next = { ...previous };
        delete next[inputId];
        return next;
      });
      removeInputFromAnimatableBindings(inputId);
      pruneInputBindings(inputId, snapshot);
    },
    [pruneInputBindings, removeInputFromAnimatableBindings, updateInputValues],
  );

  const handleDisableStandardInput = useCallback(
    (inputId: string) => {
      setDisabledStandardInputIds((previous) => {
        if (previous.includes(inputId)) {
          return previous;
        }
        return [...previous, inputId];
      });
      const snapshot = new Map(standardInputsByIdRef.current.entries());
      const existingParentBinding = inputBindingsRef.current[inputId];
      if (existingParentBinding) {
        disabledInputBindingCacheRef.current.set(
          inputId,
          bindingToDefinition(existingParentBinding),
        );
      }
      pruneInputBindings(inputId, snapshot);
      removeInputFromAnimatableBindings(inputId);
    },
    [pruneInputBindings, removeInputFromAnimatableBindings],
  );

  const handleEnableStandardInput = useCallback((inputId: string) => {
    setDisabledStandardInputIds((previous) =>
      previous.filter((value) => value !== inputId),
    );
    const cachedDefinition = disabledInputBindingCacheRef.current.get(inputId);
    if (!cachedDefinition) {
      return;
    }
    const input = standardInputsByIdRef.current.get(inputId);
    if (!input) {
      disabledInputBindingCacheRef.current.delete(inputId);
      return;
    }
    const target = bindingTargetFromInput(input);
    const restored = ensureBindingStructure(
      bindingFromDefinition(target, cachedDefinition),
      target,
    );
    setInputBindings((previous) => ({
      ...previous,
      [inputId]: restored,
    }));
    disabledInputBindingCacheRef.current.delete(inputId);
  }, []);

  const autoBlueprintResult = useMemo(() => {
    return buildAutoRigInputBlueprints(
      world,
      animatables,
      animatableComponents,
      featureLabelOverrides,
    );
  }, [animatableComponents, animatables, featureLabelOverrides, world]);

  const autoBlueprints = autoBlueprintResult.blueprints;
  const blueprintRoots = autoBlueprintResult.roots;

  const componentsByIdRef = useRef(componentsById);

  useEffect(() => {
    componentsByIdRef.current = componentsById;
  }, [componentsById]);

  useEffect(() => {
    inputBindingsRef.current = inputBindings;
  }, [inputBindings]);

  useEffect(() => {
    const validTargetIds = new Set(
      animatableComponents.map((component) => component.id),
    );
    setLockedInspectorTargetIds((previous) => {
      let changed = false;
      const next = new Set<string>();
      previous.forEach((targetId) => {
        if (validTargetIds.has(targetId)) {
          next.add(targetId);
          return;
        }
        changed = true;
      });
      return changed ? next : previous;
    });
  }, [animatableComponents]);

  useEffect(() => {
    lockedInspectorTargetIdsRef.current = lockedInspectorTargetIds;
  }, [lockedInspectorTargetIds]);

  useEffect(() => {
    disabledStandardInputIdsRef.current = new Set(disabledStandardInputIds);
  }, [disabledStandardInputIds]);

  const rebuildAutoInputs = useCallback(() => {
    setAutoInputs((previous) => {
      const next = new Map<string, AutoInputState>();
      const persisted = persistedAutoInputsRef.current;
      const nextPersisted = new Map<string, PersistedAutoStandardInput>();

      autoBlueprints.forEach((blueprint) => {
        let existingEntry: AutoInputState | undefined;
        previous.forEach((value) => {
          if (
            (blueprint.sourceId && value.sourceId === blueprint.sourceId) ||
            value.sourcePath === blueprint.path
          ) {
            existingEntry = value;
          }
        });

        const persistedKey = resolvePersistedAutoKey(
          blueprint.sourceId,
          blueprint.path,
        );
        const persistedEntry = persistedKey
          ? persisted.get(persistedKey)
          : undefined;
        const generatedLabel = blueprint.input.label;
        const generatedDefault = blueprint.input.defaultValue;
        const generatedRange = {
          min: blueprint.input.range.min,
          max: blueprint.input.range.max,
        };

        const existingHasCustomPath =
          existingEntry &&
          normalizeStandardRigInputPath(existingEntry.input.path) !==
            normalizeStandardRigInputPath(existingEntry.sourcePath);
        const existingPathOverride = existingHasCustomPath
          ? existingEntry?.input.path
          : undefined;
        const pathOverride =
          persistedEntry?.path ?? existingPathOverride ?? blueprint.input.path;

        const blueprintRoot =
          blueprint.metadata.root ?? blueprint.input.group ?? GROUP_FALLBACK;
        const existingRoot =
          existingEntry?.metadata.root ??
          existingEntry?.input.group ??
          GROUP_FALLBACK;
        const existingGroupValue = existingEntry?.input.group ?? GROUP_FALLBACK;
        const existingHasCustomGroup =
          existingEntry && existingGroupValue !== existingRoot;
        const existingGroupOverride = existingHasCustomGroup
          ? existingEntry?.input.group
          : undefined;
        const groupOverride =
          persistedEntry?.group ?? existingGroupOverride ?? blueprintRoot;

        const labelMatchesGenerated = existingEntry
          ? existingEntry.input.label === existingEntry.generatedLabel
          : true;
        const rangeMatchesGenerated = existingEntry
          ? existingEntry.input.range.min ===
              existingEntry.generatedRange.min &&
            existingEntry.input.range.max === existingEntry.generatedRange.max
          : true;
        const defaultMatchesGenerated = existingEntry
          ? existingEntry.input.defaultValue ===
            existingEntry.generatedDefaultValue
          : true;

        const nextLabel = labelMatchesGenerated
          ? (persistedEntry?.label ?? generatedLabel)
          : (existingEntry?.input.label ?? generatedLabel);
        const persistedRangeMin =
          persistedEntry?.range?.min ?? generatedRange.min;
        const persistedRangeMax =
          persistedEntry?.range?.max ?? generatedRange.max;
        const nextRangeMin = rangeMatchesGenerated
          ? persistedRangeMin
          : (existingEntry?.input.range.min ?? persistedRangeMin);
        const nextRangeMax = rangeMatchesGenerated
          ? persistedRangeMax
          : (existingEntry?.input.range.max ?? persistedRangeMax);
        const nextDefaultValue = defaultMatchesGenerated
          ? (persistedEntry?.defaultValue ?? generatedDefault)
          : (existingEntry?.input.defaultValue ?? generatedDefault);

        const resolvedSourceId =
          persistedEntry?.sourceId ??
          existingEntry?.input.sourceId ??
          blueprint.sourceId;

        const updatedInput = createStandardRigInput({
          id:
            existingEntry?.input.id ?? persistedEntry?.id ?? blueprint.input.id,
          path: pathOverride,
          label: nextLabel,
          group: groupOverride,
          defaultValue: nextDefaultValue,
          range: {
            min: nextRangeMin,
            max: nextRangeMax,
          },
          sourceId: resolvedSourceId,
        });

        const updatedMetadata: AutoRigInputBlueprintMetadata = {
          ...blueprint.metadata,
          root: groupOverride,
        };

        next.set(updatedInput.path, {
          input: updatedInput,
          metadata: updatedMetadata,
          generatedLabel,
          generatedDefaultValue: generatedDefault,
          generatedRange,
          sourcePath: blueprint.path,
          sourceId: resolvedSourceId ?? blueprint.sourceId,
        });

        const nextPersistedKey = resolvePersistedAutoKey(
          resolvedSourceId ?? blueprint.sourceId,
          blueprint.path,
        );
        if (nextPersistedKey) {
          nextPersisted.set(nextPersistedKey, {
            id: updatedInput.id,
            path: updatedInput.path,
            sourcePath: blueprint.path,
            sourceId: resolvedSourceId ?? blueprint.sourceId,
            group:
              updatedInput.group !== blueprint.input.group
                ? updatedInput.group
                : undefined,
            label:
              updatedInput.label !== generatedLabel
                ? updatedInput.label
                : undefined,
            defaultValue:
              updatedInput.defaultValue !== generatedDefault
                ? updatedInput.defaultValue
                : undefined,
            range:
              updatedInput.range.min !== generatedRange.min ||
              updatedInput.range.max !== generatedRange.max
                ? {
                    min: updatedInput.range.min,
                    max: updatedInput.range.max,
                  }
                : undefined,
          });
        }
      });

      persistedAutoInputsRef.current = nextPersisted;
      return next;
    });
  }, [autoBlueprints]);

  useEffect(() => {
    rebuildAutoInputs();
  }, [autoBlueprints, rebuildAutoInputs]);

  const { handleClearCachedState } = useRigPersistence({
    faceId,
    animatableComponents,
    autoInputs,
    customInputs,
    bindings,
    inputBindings,
    inputValues,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    disabledStandardInputIds,
    lockedInspectorTargetIds,
    hiddenDriverIds,
    featureLabelOverrides,
    featureFlags,
    standardInputSchema,
    graphInsights,
    pipelineMetadataV1: mergedPipelineMetadataV1,
    setAutoInputs,
    setCustomInputs,
    setBindings,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    setDisabledStandardInputIds,
    setLockedInspectorTargetIds,
    setHiddenDriverIds,
    setFeatureLabelOverrides,
    setStandardInputSchema: handleSetStandardInputSchema,
    setFeatureFlags,
    setGraphInsights,
    setPipelineMetadataV1,
    updateInputValues,
    pendingInputBindingDefinitionsRef,
    persistedAutoInputsRef,
    skipPersistRef,
    lastLoadedFaceIdRef,
    rebuildAutoInputs,
    alertDialog,
    pendingFaceRenameRef,
  });

  useRigHistoryScope({
    autoInputs,
    customInputs,
    bindings,
    inputBindings,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    disabledStandardInputIds,
    lockedInspectorTargetIds,
    hiddenDriverIds,
    featureLabelOverrides,
    featureFlags,
    standardInputSchema,
    setAutoInputs,
    setCustomInputs,
    setBindings,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    setDisabledStandardInputIds,
    setLockedInspectorTargetIds,
    setHiddenDriverIds,
    setFeatureLabelOverrides,
    setFeatureFlags,
    setStandardInputSchema: handleSetStandardInputSchema,
  });

  const refreshAutoMetadataForShape = useCallback(
    (shapeId: string, shapeName: string) => {
      setAutoInputs((previous) => {
        let changed = false;
        const next = new Map<string, AutoInputState>();
        previous.forEach((entry, key) => {
          if (entry.metadata.elementId === shapeId) {
            const updatedEntry: AutoInputState = {
              ...entry,
              metadata: {
                ...entry.metadata,
                elementName: shapeName,
              },
            };
            next.set(key, updatedEntry);
            if (updatedEntry !== entry) {
              changed = true;
            }
          } else {
            next.set(key, entry);
          }
        });
        return changed ? next : previous;
      });
    },
    [],
  );

  const renameInputsForShape = useCallback(
    (
      shapeId: string,
      oldSlug: string,
      newSlug: string,
      shapeName: string,
      previousName: string,
    ) => {
      const idRemap = applyShapeInputRename({
        shapeId,
        oldSlug,
        newSlug,
        shapeName,
        previousName,
        autoInputsRef,
        customInputsRef,
        setCustomInputs,
        setAutoInputs,
        allStandardInputsRef,
        setDisabledStandardInputIds,
        disabledInputBindingCacheRef,
        updateInputValues,
        setBindings,
        componentsByIdRef,
        setInputBindings,
        pendingInputBindingDefinitionsRef,
        persistedAutoInputsRef,
        refreshAutoMetadataForShape,
        setSelectedStandardInputRoots,
        setSelectedStandardInputSubgroups,
        setFeatureLabelOverrides,
        resolvePersistedAutoKey,
      });
      applyStandardInputIdRemapSideEffects(idRemap);
    },
    [
      applyStandardInputIdRemapSideEffects,
      componentsByIdRef,
      pendingInputBindingDefinitionsRef,
      persistedAutoInputsRef,
      refreshAutoMetadataForShape,
      setAutoInputs,
      setBindings,
      setCustomInputs,
      setDisabledStandardInputIds,
      setInputBindings,
      updateInputValues,
      setSelectedStandardInputRoots,
      setFeatureLabelOverrides,
      setSelectedStandardInputSubgroups,
    ],
  );

  const managedStandardInputs = useManagedStandardInputs({
    autoBlueprints,
    autoInputs,
    customInputs,
    inputBindings,
    disabledStandardInputIds,
    resolvePersistedAutoKey,
  });

  const {
    standardInputs,
    standardInputsById,
    standardInputsByPath,
    standardInputMetadataById,
    elementRootLookup,
    allStandardInputSubgroups,
  } = useStandardInputCollections({
    managedStandardInputs,
    groupFallback: GROUP_FALLBACK,
    allStandardInputsRef,
    standardInputsByIdRef,
  });
  const previousStandardInputsRef = useRef<StandardRigInput[] | null>(null);

  const propsrigInputIdByComponentId = useMemo(() => {
    type Candidate = {
      inputId: string;
      resolvedInputId: string;
      rank: number;
    };
    const candidatesByComponentId = new Map<string, Candidate[]>();
    managedStandardInputs.forEach((entry) => {
      const componentId =
        entry.metadata?.componentId ??
        extractComponentIdFromInputSourceId(entry.input.sourceId);
      if (!componentId) {
        return;
      }
      const resolvedInputId = resolveStandardRigInputId(
        entry.input.id,
        standardInputsById,
      );
      const resolvedInput =
        standardInputsById.get(resolvedInputId) ??
        standardInputsById.get(entry.input.id) ??
        entry.input;
      const rank =
        (isCanonicalPropsRigInputPath(resolvedInput.path) ? 10 : 0) +
        (entry.source === "auto" ? 1 : 0);
      const candidate: Candidate = {
        inputId: entry.input.id,
        resolvedInputId,
        rank,
      };
      const existing = candidatesByComponentId.get(componentId);
      if (existing) {
        existing.push(candidate);
      } else {
        candidatesByComponentId.set(componentId, [candidate]);
      }
    });
    const next = new Map<string, string>();
    candidatesByComponentId.forEach((candidates, componentId) => {
      const selected = [...candidates].sort((left, right) => {
        if (right.rank !== left.rank) {
          return right.rank - left.rank;
        }
        return left.resolvedInputId.localeCompare(right.resolvedInputId);
      })[0];
      if (!selected) {
        return;
      }
      next.set(componentId, selected.resolvedInputId);
    });
    return next;
  }, [managedStandardInputs, standardInputsById]);

  const lockedPropsRigInputIds = useMemo(() => {
    if (lockedInspectorTargetIds.size === 0) {
      return new Set<string>();
    }
    const next = new Set<string>();
    lockedInspectorTargetIds.forEach((targetId) => {
      const mappedPropsRigId = propsrigInputIdByComponentId.get(targetId);
      if (mappedPropsRigId) {
        next.add(mappedPropsRigId);
        return;
      }
      const bindingInputIds = collectBindingInputIds(bindings[targetId]);
      const resolvedIds = bindingInputIds
        .map((inputId) =>
          resolveStandardRigInputId(inputId, standardInputsById),
        )
        .filter((inputId) => standardInputsById.has(inputId));
      const preferredId =
        resolvedIds.find((inputId) =>
          isCanonicalPropsRigInputPath(standardInputsById.get(inputId)?.path),
        ) ?? resolvedIds[0];
      if (preferredId) {
        next.add(preferredId);
      }
    });
    return next;
  }, [
    propsrigInputIdByComponentId,
    bindings,
    lockedInspectorTargetIds,
    standardInputsById,
  ]);

  const pipelineConfigByInputId: Record<
    string,
    Record<string, unknown>
  > = useMemo(() => {
    if (lockedPropsRigInputIds.size === 0) {
      return basePipelineConfigByInputId;
    }
    const next: Record<string, Record<string, unknown>> = {
      ...basePipelineConfigByInputId,
    };
    lockedPropsRigInputIds.forEach((inputId) => {
      const existingConfig =
        asRecord(basePipelineConfigByInputId[inputId]) ?? {};
      const directInputConfig = asRecord(existingConfig.directInput) ?? {};
      next[inputId] = {
        ...existingConfig,
        directInput: {
          ...directInputConfig,
          enabled: false,
        },
      };
    });
    return next;
  }, [basePipelineConfigByInputId, lockedPropsRigInputIds]);

  const resolveLockSyncInputIdsForTarget = useCallback(
    (targetId: string): string[] => {
      const normalizedTargetId = targetId.trim();
      if (!normalizedTargetId) {
        return [];
      }
      const mappedPropsRigId =
        propsrigInputIdByComponentId.get(normalizedTargetId) ?? null;
      if (mappedPropsRigId) {
        return [mappedPropsRigId];
      }
      const resolvedIds = collectBindingInputIds(bindings[normalizedTargetId])
        .map((inputId) =>
          resolveStandardRigInputId(inputId, standardInputsById),
        )
        .filter((inputId) => standardInputsById.has(inputId));
      const preferredId =
        resolvedIds.find((inputId) =>
          isCanonicalPropsRigInputPath(standardInputsById.get(inputId)?.path),
        ) ?? resolvedIds[0];
      return preferredId ? [preferredId] : [];
    },
    [bindings, propsrigInputIdByComponentId, standardInputsById],
  );

  const applyDirectInputEnabledForInputIds = useCallback(
    (inputIds: readonly string[], enabled: boolean) => {
      if (inputIds.length === 0) {
        return;
      }
      applyInputBindingPatch((previous) => {
        let changed = false;
        const next = { ...previous };
        inputIds.forEach((inputId) => {
          const sourceInput = standardInputsById.get(inputId);
          if (!sourceInput) {
            return;
          }
          const existingBinding =
            next[inputId] ??
            createDefaultParentBinding(bindingTargetFromInput(sourceInput));
          const nextMetadata = mergePipelineMetadata(
            (existingBinding.metadata ?? undefined) as
              | Record<string, unknown>
              | undefined,
            {
              directInputEnabled: enabled,
            },
          );
          const previousMetadataSignature = JSON.stringify(
            existingBinding.metadata ?? null,
          );
          const nextMetadataSignature = JSON.stringify(nextMetadata);
          if (previousMetadataSignature === nextMetadataSignature) {
            return;
          }
          next[inputId] = {
            ...existingBinding,
            metadata: nextMetadata,
          };
          changed = true;
        });
        return changed ? next : previous;
      });
    },
    [applyInputBindingPatch, standardInputsById],
  );

  const handleSetInspectorTargetLocked = useCallback(
    (targetId: string, locked: boolean) => {
      const normalized = targetId.trim();
      if (!normalized) {
        return;
      }
      setInspectorTargetLockedState(normalized, locked);
      const syncInputIds = resolveLockSyncInputIdsForTarget(normalized);
      applyDirectInputEnabledForInputIds(syncInputIds, !locked);
    },
    [
      applyDirectInputEnabledForInputIds,
      resolveLockSyncInputIdsForTarget,
      setInspectorTargetLockedState,
    ],
  );

  const handleToggleInspectorTargetLock = useCallback(
    (targetId: string) => {
      const normalized = targetId.trim();
      if (!normalized) {
        return;
      }
      const nextLocked = !lockedInspectorTargetIdsRef.current.has(normalized);
      handleSetInspectorTargetLocked(normalized, nextLocked);
    },
    [handleSetInspectorTargetLocked],
  );

  const handleMigrateAllLegacyBindings = useCallback((): number => {
    let migratedCount = 0;
    applyInputBindingPatch((previous) => {
      let changed = false;
      const next: typeof previous = { ...previous };
      Object.entries(previous).forEach(([targetInputId, binding]) => {
        const assessment = assessLegacyBindingMigration(binding ?? null);
        if (assessment.kind !== "convertible") {
          return;
        }
        const sourceInput = standardInputsById.get(targetInputId);
        if (!sourceInput) {
          return;
        }
        const existingBinding =
          next[targetInputId] ??
          createDefaultParentBinding(bindingTargetFromInput(sourceInput));
        const linkUpserts = buildLegacyMigrationLinkUpserts({
          binding: existingBinding,
          childInputId: targetInputId,
          factorsByInputId: assessment.parentFactorsByInputId ?? {},
          defaultOffset: sourceInput.defaultValue,
          resolveInputId: (rawInputId) =>
            resolveRigMetadataInputId(rawInputId, standardInputsById),
        });
        const nextMetadata = mergePipelineMetadata(
          (existingBinding.metadata ?? undefined) as
            | Record<string, unknown>
            | undefined,
          {
            directInputEnabled: true,
            overrideEnabled: false,
            overrideValue: sourceInput.defaultValue,
            clampEnabled: true,
            ...(Object.keys(linkUpserts).length > 0 ? { linkUpserts } : {}),
            migrationStatus: "migrated",
            migrationSource: "canonical-self-parent",
            migrationExpression: assessment.expression,
          },
        );
        const previousMetadataSignature = JSON.stringify(
          existingBinding.metadata ?? null,
        );
        const nextMetadataSignature = JSON.stringify(nextMetadata);
        if (previousMetadataSignature === nextMetadataSignature) {
          return;
        }
        changed = true;
        migratedCount += 1;
        next[targetInputId] = {
          ...existingBinding,
          metadata: nextMetadata,
        };
      });
      return changed ? next : previous;
    });
    return migratedCount;
  }, [applyInputBindingPatch, standardInputsById]);

  const faceSegment = useMemo(
    () => (faceId && faceId.length > 0 ? faceId : "face"),
    [faceId],
  );

  useEffect(() => {
    const faceRenameToken = faceRenameTokenRef.current;
    graphRuntimeStore.setState({
      faceId,
      faceSegment,
      faceRenameToken:
        faceRenameToken && faceRenameToken === faceId ? faceRenameToken : null,
    });
  }, [faceId, faceSegment, graphRuntimeStore]);

  const rigOutputLookup = useMemo(() => {
    const map = new Map<string, StandardRigInput>();
    standardInputs.forEach((input) => {
      const rigPath = buildRigInputPath(faceSegment, input.path);
      const normalizedRig = normalizeGraphPath(rigPath);
      if (normalizedRig) {
        map.set(normalizedRig, input);
      }
    });
    return map;
  }, [faceSegment, standardInputs]);

  const validOutputTargets = useMemo(() => {
    const targets = new Set<string>(rigOutputLookup.keys());
    Object.keys(animatables).forEach((animatableId) => {
      const normalized = normalizeGraphPath(animatableId);
      if (normalized) {
        targets.add(normalized);
      }
    });
    return targets;
  }, [animatables, rigOutputLookup]);

  const sceneGraph = useMemo(
    () =>
      buildSceneGraphData({
        world,
        animatables,
        bindings,
        animatableComponents,
        standardInputsById,
        featureLabelOverrides,
      }),
    [
      animatableComponents,
      animatables,
      bindings,
      featureLabelOverrides,
      standardInputsById,
      world,
    ],
  );

  useEffect(() => {
    bindingAuthoringStore.setState({
      sceneObjects: sceneGraph.nodes,
      sceneObjectRoots: sceneGraph.rootIds,
    });
  }, [bindingAuthoringStore, sceneGraph]);

  const standardInputRoots = useMemo(() => {
    const rootSet = new Set<string>();
    managedStandardInputs.forEach((entry) => {
      const root = entry.metadata?.root ?? entry.input.group ?? GROUP_FALLBACK;
      if (root) {
        rootSet.add(root);
      }
    });
    if (rootSet.size === 0) {
      blueprintRoots.forEach((root) => rootSet.add(root));
    }
    return Array.from(rootSet).sort((a, b) => a.localeCompare(b));
  }, [blueprintRoots, managedStandardInputs]);

  useStandardInputSelectionSync({
    elementSelection,
    namespace,
    world,
    standardInputRoots,
    elementRootLookup,
    selectedRoots: selectedStandardInputRoots,
    setSelectedRoots: setSelectedStandardInputRoots,
    selectedSubgroups: selectedStandardInputSubgroups,
    setSelectedSubgroups: setSelectedStandardInputSubgroups,
    allStandardInputSubgroups,
    viewerSelectionActiveRef,
  });

  useEffect(() => {
    const pending = pendingInputBindingDefinitionsRef.current;
    if (!pending || standardInputsById.size === 0) {
      return;
    }
    const next: InputBindingMap = {};
    Object.entries(pending).forEach(([inputId, definition]) => {
      const input = standardInputsById.get(inputId);
      if (!input) {
        return;
      }
      const target = bindingTargetFromInput(input);
      const binding = bindingFromDefinition(target, definition);
      const hasParents =
        (binding.inputId && binding.inputId !== SELF_BINDING_ID) ||
        binding.slots.some(
          (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
        );
      if (!hasParents) {
        return;
      }
      next[inputId] = binding;
    });
    setInputBindings(next);
    pendingInputBindingDefinitionsRef.current = null;
  }, [standardInputsById]);

  const rigGraphBuild = useMemo<BuildGraphResult | null>(
    () =>
      buildRigGraphCompile({
        faceId,
        animatables,
        components: animatableComponents,
        bindings,
        inputsById: standardInputsById,
        inputBindings,
        inputMetadata: standardInputMetadataById,
        poseConfig: poseConfigSnapshot ?? null,
        pipelineConfigByInputId,
        pipelineMetadataV1: mergedPipelineMetadataV1,
      }),
    [
      animatableComponents,
      animatables,
      bindings,
      faceId,
      inputBindings,
      pipelineConfigByInputId,
      mergedPipelineMetadataV1,
      poseConfigSnapshot,
      standardInputMetadataById,
      standardInputsById,
    ],
  );

  const runtimeGraphSpec = useMemo(() => {
    const resolution = resolveRuntimeGraphSpecWithCache(
      rigGraphBuild,
      lastKnownGoodRuntimeSpecRef.current,
    );
    lastKnownGoodRuntimeSpecRef.current = resolution.nextLastKnownGood;
    return resolution.resolved;
  }, [rigGraphBuild]);

  skipRuntimeUnloadRef.current =
    runtimeGraphSpec.blocked && Boolean(lastKnownGoodRuntimeSpecRef.current);

  const bindingIssues = useMemo(
    () => buildBindingIssuesMap(rigGraphBuild),
    [rigGraphBuild],
  );

  useEffect(() => {
    graphRuntimeStore.setState({
      graphSpec: runtimeGraphSpec.runtimeSpec?.spec ?? null,
    });
  }, [graphRuntimeStore, runtimeGraphSpec.runtimeSpec]);

  useEffect(() => {
    const previousInputs = previousStandardInputsRef.current;
    previousStandardInputsRef.current = standardInputs;
    if (
      !previousInputs ||
      previousInputs.length === 0 ||
      standardInputs.length === 0
    ) {
      return;
    }
    if (
      explicitStandardInputIdRemapRevisionRef.current !== 0 &&
      lastSkippedExplicitStandardInputIdRemapRevisionRef.current !==
        explicitStandardInputIdRemapRevisionRef.current
    ) {
      lastSkippedExplicitStandardInputIdRemapRevisionRef.current =
        explicitStandardInputIdRemapRevisionRef.current;
      return;
    }
    if (explicitStandardInputIdRemapRevisionRef.current !== 0) {
      lastSkippedExplicitStandardInputIdRemapRevisionRef.current =
        explicitStandardInputIdRemapRevisionRef.current;
    }
    const idRemap = buildStandardInputIdRemap(previousInputs, standardInputs);
    if (idRemap.size === 0) {
      return;
    }
    applyStandardInputIdRemap(idRemap, standardInputsById);
  }, [applyStandardInputIdRemap, standardInputs, standardInputsById]);

  const graphMachineReport = useMemo(
    () => buildGraphMachineReport(rigGraphBuild),
    [rigGraphBuild],
  );

  useEffect(() => {
    graphRuntimeStore.setState({ graphMachineReport });
  }, [graphMachineReport, graphRuntimeStore]);

  const getGraphIr = useCallback(() => graphIrRef.current, []);

  useEffect(() => {
    graphRuntimeStore.setState({ getGraphIr });
  }, [getGraphIr, graphRuntimeStore]);

  useEffect(() => {
    if (!rigGraphBuild) {
      return;
    }
    setGraphInsights(createGraphInsightSnapshot(rigGraphBuild));
  }, [rigGraphBuild]);

  const resetDrivenAnimatables = useCallback(() => {
    if (drivenAnimatablesRef.current.size === 0) {
      return;
    }
    const next = drivenAnimatablesRef.current;
    drivenAnimatablesRef.current = new Set();
    next.forEach((animId) => {
      const animatable = animatables[animId];
      if (!animatable) {
        return;
      }
      const resetValue = buildAnimatableValue(animatable, undefined);
      setValue(animId, namespace, resetValue);
    });
  }, [animatables, namespace, setValue]);

  const stageInputsFromState = useCallback(() => {
    if (graphStatus !== "ready" || graphError) {
      return;
    }
    const routesByCanonicalId = runtimeInputRoutesByCanonicalIdRef.current;
    if (routesByCanonicalId.size === 0) {
      return;
    }
    const queuedCount = queueRuntimeInputsFromState({
      routesByCanonicalId,
      inputValues: inputValuesRef.current,
      queueByGraphPath: queuedRuntimeInputValuesRef.current,
    });
    if (queuedCount > 0) {
      setRuntimeInputStageQueueRevision((previous) => previous + 1);
    }
  }, [graphError, graphStatus]);

  const graphPlaybackAvailable = Boolean(rootId) && runtimeViewReadyForPlayback;
  const cancelGraphPlaybackLoop = useCallback(() => {
    if (graphPlaybackFrameRef.current !== null) {
      cancelAnimationFrame(graphPlaybackFrameRef.current);
      graphPlaybackFrameRef.current = null;
    }
    graphPlaybackLastFrameTimeRef.current = null;
  }, []);
  const playGraph = useCallback(() => {
    if (!graphPlaybackAvailable) {
      return;
    }
    setGraphPlaybackState("playing");
  }, [graphPlaybackAvailable]);
  const pauseGraph = useCallback(() => {
    setGraphPlaybackState("paused");
  }, []);
  const stopGraph = useCallback(() => {
    setGraphPlaybackState("paused");
    setGraphTimeSeconds(0);
    setGraphFrameRate(0);
  }, []);
  const stepGraph = useCallback(() => {
    if (!graphPlaybackAvailable) {
      return;
    }
    if (graphPlaybackStepTimeoutRef.current !== null) {
      clearTimeout(graphPlaybackStepTimeoutRef.current);
      graphPlaybackStepTimeoutRef.current = null;
    }
    setGraphTimeSeconds((previous) => previous + 1 / 60);
    setGraphFrameRate((previous) => (previous === 0 ? 60 : previous));
    setGraphPlaybackState("playing");
    graphPlaybackStepTimeoutRef.current = setTimeout(() => {
      graphPlaybackStepTimeoutRef.current = null;
      setGraphPlaybackState("paused");
    }, 48);
  }, [graphPlaybackAvailable]);
  const setGraphPlaybackStateAction = useCallback(
    (state: "playing" | "paused") => {
      setGraphPlaybackState(state);
    },
    [],
  );

  useEffect(() => {
    if (graphPlaybackState !== "playing" || !graphPlaybackAvailable) {
      cancelGraphPlaybackLoop();
      setGraphFrameRate(0);
      return;
    }
    const tick = (timestamp: number) => {
      if (graphPlaybackStateRef.current !== "playing") {
        graphPlaybackFrameRef.current = null;
        return;
      }
      const previousTimestamp =
        graphPlaybackLastFrameTimeRef.current ?? timestamp;
      graphPlaybackLastFrameTimeRef.current = timestamp;
      const deltaSeconds = Math.max((timestamp - previousTimestamp) / 1000, 0);
      if (deltaSeconds > 0) {
        setGraphTimeSeconds((previous) => previous + deltaSeconds);
        const instantaneous = Math.min(240, 1 / deltaSeconds);
        if (Number.isFinite(instantaneous)) {
          setGraphFrameRate((previous) =>
            previous === 0
              ? instantaneous
              : previous * 0.85 + instantaneous * 0.15,
          );
        }
      }
      graphPlaybackFrameRef.current = requestAnimationFrame(tick);
    };

    graphPlaybackLastFrameTimeRef.current = performance.now();
    graphPlaybackFrameRef.current = requestAnimationFrame(tick);
    return cancelGraphPlaybackLoop;
  }, [cancelGraphPlaybackLoop, graphPlaybackAvailable, graphPlaybackState]);

  useEffect(
    () => () => {
      cancelGraphPlaybackLoop();
      if (graphPlaybackStepTimeoutRef.current !== null) {
        clearTimeout(graphPlaybackStepTimeoutRef.current);
        graphPlaybackStepTimeoutRef.current = null;
      }
    },
    [cancelGraphPlaybackLoop],
  );

  useEffect(() => {
    graphRuntimeStore.setState({
      graphTimeSeconds,
      graphPlaybackState,
      graphPlaybackAvailable,
      graphFrameRate,
      playGraph,
      pauseGraph,
      stopGraph,
      stepGraph,
      setGraphPlaybackState: setGraphPlaybackStateAction,
    });
  }, [
    graphFrameRate,
    graphPlaybackAvailable,
    graphPlaybackState,
    graphRuntimeStore,
    graphTimeSeconds,
    pauseGraph,
    playGraph,
    setGraphPlaybackStateAction,
    stepGraph,
    stopGraph,
  ]);

  useEffect(() => {
    if (graphStatus !== "ready" || graphError) {
      return;
    }
    if (!rootId) {
      return;
    }
    const faceToken = faceId && faceId.length > 0 ? faceId : "default";
    const token = `${rootId}::${faceToken}`;
    if (autoPlayTokenRef.current === token) {
      return;
    }
    autoPlayTokenRef.current = token;
  }, [faceId, graphStatus, graphError, rootId]);

  useEffect(() => {
    if (graphStatus === "ready") {
      return;
    }
    autoPlayTokenRef.current = null;
  }, [graphStatus]);

  const rootRenderable = useMemo(() => {
    return rootId ? (world[rootId] as Group | undefined) : undefined;
  }, [rootId, world]);

  useEffect(() => {
    autoInputsRef.current = autoInputs;
  }, [autoInputs]);

  useEffect(() => {
    customInputsRef.current = customInputs;
  }, [customInputs]);

  useEffect(() => {
    const activeInputsById = standardInputsByIdRef.current;
    setBindings((previous) => {
      let changed = false;
      const next: BindingMap = { ...previous };
      const autoInputsBySourceId = new Map<string, AutoInputState>();

      autoInputs.forEach((entry) => {
        if (entry.sourceId) {
          autoInputsBySourceId.set(entry.sourceId, entry);
        }
      });

      autoBlueprints.forEach((blueprint) => {
        const entry =
          (blueprint.sourceId
            ? autoInputsBySourceId.get(blueprint.sourceId)
            : undefined) ?? autoInputs.get(blueprint.path);
        const resolvedInput = entry?.input ?? blueprint.input;
        const componentId = blueprint.metadata.componentId;
        const component = componentsByIdRef.current.get(componentId);
        if (!component) {
          return;
        }
        const target = bindingTargetFromComponent(component);
        const currentBinding = next[componentId];
        const ensured =
          currentBinding !== undefined
            ? ensureBindingStructure(currentBinding, target)
            : createDefaultBinding(target);
        if (ensured !== currentBinding) {
          next[componentId] = ensured;
        }
        if (ensured.inputId && activeInputsById.has(ensured.inputId)) {
          return;
        }
        const updated = updateBindingWithInput(ensured, target, resolvedInput);
        if (updated !== ensured) {
          next[componentId] = updated;
          changed = true;
        } else if (!Object.prototype.hasOwnProperty.call(next, componentId)) {
          next[componentId] = ensured;
        }
      });

      return changed ? next : previous;
    });
  }, [autoBlueprints, autoInputs, standardInputsByIdRef]);

  useEffect(() => {
    updateInputValues((previous) => {
      const next: StandardInputValues = { ...previous };
      let changed = false;
      const validIds = new Set<string>();

      managedStandardInputs.forEach((entry) => {
        const inputId = entry.input.id;
        validIds.add(inputId);
        if (!Object.prototype.hasOwnProperty.call(next, inputId)) {
          next[inputId] = entry.input.defaultValue;
          changed = true;
        }
      });

      Object.keys(next).forEach((inputId) => {
        if (!validIds.has(inputId)) {
          delete next[inputId];
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [managedStandardInputs, updateInputValues]);

  useEffect(() => {
    const validIds = new Set(standardInputs.map((input) => input.id));
    setBindings((previous) => {
      let changed = false;
      const next: BindingMap = {};
      Object.entries(previous).forEach(([key, binding]) => {
        if (!binding) {
          return;
        }
        const component = componentsById.get(key);
        const ensured =
          component !== undefined
            ? ensureBindingStructure(
                binding,
                bindingTargetFromComponent(component),
              )
            : binding;
        next[key] = ensured;
        if (ensured !== binding) {
          changed = true;
        }
        if (ensured.inputId && !validIds.has(ensured.inputId)) {
          if (component) {
            next[key] = updateBindingWithInput(
              ensured,
              bindingTargetFromComponent(component),
              undefined,
            );
          } else {
            next[key] = {
              ...ensured,
              inputId: null,
            };
          }
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [componentsById, standardInputs]);

  const queueGraphInputValue = useCallback(
    (inputId: string, value: number) => {
      if (graphStatus !== "ready" || graphError) {
        if (__DEV__) {
          console.warn(
            "[vizij] skipped staging input while graph not ready",
            inputId,
            value,
          );
        }
        return false;
      }
      const trimmedInputId = inputId.trim();
      const resolvedInputId = resolveRuntimeInputId(trimmedInputId);
      const graphPath =
        runtimeInputGraphPathLookupRef.current.get(resolvedInputId) ??
        runtimeInputGraphPathLookupRef.current.get(trimmedInputId) ??
        null;
      if (!graphPath) {
        if (__DEV__) {
          console.warn("[vizij] no graph input binding for", inputId, value);
        }
        return false;
      }
      return queueRuntimeInputWrite(
        queuedRuntimeInputValuesRef.current,
        graphPath,
        value,
      );
    },
    [graphError, graphStatus, resolveRuntimeInputId],
  );

  const handleInputValueChange = useCallback(
    (
      inputId: string,
      value: number,
      options?: { source?: "manual" | "timeline" },
    ) => {
      const resolvedInputId = resolveRuntimeInputId(inputId);
      const source = options?.source ?? "manual";
      if (source === "manual" && isTimelineInputLocked(resolvedInputId)) {
        return;
      }
      if (Object.is(inputValuesRef.current[resolvedInputId], value)) {
        return;
      }
      updateInputValues((previous) => ({
        ...previous,
        [resolvedInputId]: value,
      }));
      if (queueGraphInputValue(resolvedInputId, value)) {
        setRuntimeInputStageQueueRevision((previous) => previous + 1);
      }
    },
    [
      isTimelineInputLocked,
      queueGraphInputValue,
      resolveRuntimeInputId,
      updateInputValues,
    ],
  );

  const stageRuntimeGraphPathValue = useCallback(
    (graphPath: string, value: number) => {
      if (graphStatus !== "ready" || graphError) {
        return;
      }
      if (!Number.isFinite(value)) {
        return;
      }
      const normalizedPath = normalizeGraphPath(graphPath) ?? graphPath.trim();
      if (!normalizedPath) {
        return;
      }
      if (
        queueRuntimeInputWrite(
          queuedRuntimeInputValuesRef.current,
          normalizedPath,
          value,
        )
      ) {
        setRuntimeInputStageQueueRevision((previous) => previous + 1);
      }
    },
    [graphError, graphStatus],
  );

  const applyStandardInputBatch = useCallback(
    (
      updates: Record<StandardInputId, number>,
      options?: { replace?: boolean; source?: "manual" | "timeline" },
    ) => {
      if (!updates || typeof updates !== "object") {
        return;
      }
      const source = options?.source ?? "manual";
      const candidateEntries = Object.entries(updates) as Array<
        [StandardInputId, number]
      >;
      const entries =
        source === "manual"
          ? candidateEntries.filter(
              ([inputId]) => !isTimelineInputLocked(inputId),
            )
          : candidateEntries;

      if (entries.length === 0) {
        return;
      }
      updateInputValues((previous) => {
        if (options?.replace) {
          const next: StandardInputValues = {};
          if (source === "manual" && timelineInputLockActiveRef.current) {
            Object.entries(previous).forEach(([inputId, previousValue]) => {
              if (!isTimelineInputLocked(inputId)) {
                return;
              }
              if (typeof previousValue === "number") {
                next[inputId] = previousValue;
              }
            });
          }
          const entryIds = new Set<StandardInputId>();
          let changed = false;
          entries.forEach(([inputId, value]) => {
            const resolvedInputId = resolveRuntimeInputId(inputId);
            entryIds.add(resolvedInputId);
            next[resolvedInputId] = value;
            if (!changed && previous[resolvedInputId] !== value) {
              changed = true;
            }
          });
          if (!changed) {
            const previousKeys = Object.keys(previous);
            if (previousKeys.length !== entryIds.size) {
              changed = true;
            } else if (
              previousKeys.some((key) => !entryIds.has(key as StandardInputId))
            ) {
              changed = true;
            }
          }
          return changed ? next : previous;
        }
        let changed = false;
        const next: StandardInputValues = { ...previous };
        entries.forEach(([inputId, value]) => {
          const resolvedInputId = resolveRuntimeInputId(inputId);
          if (next[resolvedInputId] !== value) {
            next[resolvedInputId] = value;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
      let queued = false;
      entries.forEach(([inputId, value]) => {
        const resolvedInputId = resolveRuntimeInputId(inputId);
        if (queueGraphInputValue(resolvedInputId, value)) {
          queued = true;
        }
      });
      if (queued) {
        setRuntimeInputStageQueueRevision((previous) => previous + 1);
      }
    },
    [
      isTimelineInputLocked,
      queueGraphInputValue,
      resolveRuntimeInputId,
      updateInputValues,
    ],
  );

  const handleResetAllInputValues = useCallback(() => {
    updateInputValues((previous) => {
      const defaults = createDefaultInputValues(
        managedStandardInputs.map((entry) => entry.input),
      );
      const previousKeys = Object.keys(previous);
      const defaultKeys = Object.keys(defaults);
      if (
        previousKeys.length === defaultKeys.length &&
        defaultKeys.every((key) => previous[key] === defaults[key])
      ) {
        return previous;
      }
      return defaults;
    });
  }, [managedStandardInputs, updateInputValues]);

  const handleSelectStandardInputRoots = useCallback(
    (nextRoots: string[]) => {
      const validRoots = new Set<string>(standardInputRoots);
      const normalized = Array.from(
        new Set(nextRoots.filter((root) => validRoots.has(root))),
      );
      setSelectedStandardInputRoots(normalized);
    },
    [standardInputRoots],
  );

  const handleSelectStandardInputSubgroups = useCallback(
    (nextSubgroups: string[]) => {
      const filtered = nextSubgroups.filter((token) =>
        allStandardInputSubgroups.has(token),
      );
      const normalized = Array.from(new Set(filtered));
      setSelectedStandardInputSubgroups(normalized);
    },
    [allStandardInputSubgroups],
  );

  const handleRenameShape = useCallback(
    (shapeId: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed) {
        return;
      }
      const renderable = world[shapeId];
      if (!renderable) {
        return;
      }
      const currentName = renderable.name ?? "";
      const shapeKind = renderable.type === "group" ? "group" : "shape";
      if (currentName === trimmed) {
        return;
      }
      const oldSlug = normalizeStandardRigGroup(currentName, shapeKind);
      const newSlug = normalizeStandardRigGroup(trimmed, shapeKind);

      setStoreState((state: VizijData) => {
        const current = state.world[shapeId];
        if (!current || current.name === trimmed) {
          return state;
        }

        const featureMap = current.features as Record<
          string,
          Feature | undefined
        >;
        const updatedFeatures: Record<string, Feature | undefined> = {
          ...featureMap,
        };
        const updatedAnimatables = { ...state.animatables };
        let featureChanged = false;
        let animatableChanged = false;

        const renameText = (
          value: string | undefined | null,
        ): string | undefined => {
          if (!value) {
            return value ?? undefined;
          }
          const trimmedValue = value.trim();
          if (trimmedValue === currentName) {
            return value.replace(trimmedValue, trimmed);
          }
          if (trimmedValue.startsWith(`${currentName} `)) {
            const suffix = trimmedValue.slice(currentName.length);
            return value.replace(trimmedValue, `${trimmed}${suffix}`);
          }
          return value;
        };

        Object.entries(featureMap).forEach(([featureKey, featureValue]) => {
          const feature = featureValue as Feature;
          if (!feature) {
            return;
          }
          if ("label" in feature) {
            const existingLabel = feature.label;
            const replacement = renameText(existingLabel);
            if (replacement && replacement !== existingLabel) {
              updatedFeatures[featureKey] = {
                ...feature,
                label: replacement,
              } as Feature;
              featureChanged = true;
            }
          }

          if (feature.animated) {
            const animId = (feature as AnimatedFeature).value;
            const descriptor = updatedAnimatables[animId];
            if (descriptor) {
              const renamedName = renameText(descriptor.name);
              const renamedOutput = renameText(descriptor.pub?.output);
              if (
                (renamedName && renamedName !== descriptor.name) ||
                (descriptor.pub?.output &&
                  renamedOutput !== descriptor.pub.output)
              ) {
                updatedAnimatables[animId] = {
                  ...descriptor,
                  name: renamedName ?? descriptor.name,
                  pub: descriptor.pub
                    ? {
                        ...descriptor.pub,
                        output: renamedOutput ?? descriptor.pub.output,
                      }
                    : descriptor.pub,
                } as typeof descriptor;
                animatableChanged = true;
              }
            }
          }
        });

        return {
          world: {
            ...state.world,
            [shapeId]: {
              ...current,
              name: trimmed,
              features: featureChanged
                ? (updatedFeatures as typeof current.features)
                : current.features,
            },
          },
          animatables: animatableChanged
            ? updatedAnimatables
            : state.animatables,
        } as Partial<VizijData>;
      });

      if (oldSlug !== newSlug) {
        renameInputsForShape(shapeId, oldSlug, newSlug, trimmed, currentName);
      } else {
        refreshAutoMetadataForShape(shapeId, trimmed);
      }
    },
    [renameInputsForShape, refreshAutoMetadataForShape, setStoreState, world],
  );

  const emitLoadPhase = useCallback(
    (update: FaceLoadPhaseUpdate) => {
      const operationId =
        update.operationId ??
        (update.substepId ? `${update.stepId}:${update.substepId}` : undefined);
      onLoadPhaseChange?.({
        ...update,
        operationId,
      });
    },
    [onLoadPhaseChange],
  );

  const handleImportGraphSpec = useRigGraphImport({
    faceId,
    animatables,
    animatableComponents,
    world,
    featureLabelOverrides,
    setAutoInputs,
    setCustomInputs,
    updateInputValues,
    setBindings,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    setLockedInspectorTargetIds,
    setFaceId: renameFaceId,
    skipPersistRef,
    persistedAutoInputsRef,
    lastLoadedFaceIdRef,
    poseConfig: poseConfigSnapshot ?? null,
    openDiscrepancyReview,
    alertDialog,
    debugLog,
    pendingFaceRenameRef,
    setPipelineMetadataV1,
    onImportPhaseChange: emitLoadPhase,
  });

  useEffect(() => {
    graphRuntimeStore.setState({ handleImportGraphSpec });
  }, [graphRuntimeStore, handleImportGraphSpec]);

  const handleLinkChildInput = useCallback(
    (
      parentId: string,
      childId: string,
      options?: { scale?: number; offset?: number },
    ) => {
      linkChildInput({
        parentId,
        childId,
        updateInputBinding,
        standardInputsByIdRef,
        allStandardInputsRef,
      });
      applyInputBindingPatch((previous) => {
        const childInput =
          standardInputsByIdRef.current.get(childId) ??
          allStandardInputsRef.current.get(childId);
        if (!childInput) {
          return previous;
        }
        const resolvedScale =
          typeof options?.scale === "number" && Number.isFinite(options.scale)
            ? options.scale
            : 1;
        const resolvedOffset =
          typeof options?.offset === "number" && Number.isFinite(options.offset)
            ? options.offset
            : Number.isFinite(childInput.defaultValue)
              ? childInput.defaultValue
              : 0;
        const linkId = buildRigPipelineV1LinkId(parentId, childId);
        const existingBinding =
          previous[childId] ??
          createDefaultParentBinding(bindingTargetFromInput(childInput));
        const nextMetadata = mergePipelineMetadata(
          (existingBinding.metadata ?? undefined) as
            | Record<string, unknown>
            | undefined,
          {
            directInputEnabled: true,
            linkUpserts: {
              [linkId]: {
                parentInputId: parentId,
                childInputId: childId,
                scale: resolvedScale,
                offset: resolvedOffset,
                enabled: true,
              },
            },
          },
        );
        const previousMetadataSignature = JSON.stringify(
          existingBinding.metadata ?? null,
        );
        const nextMetadataSignature = JSON.stringify(nextMetadata);
        if (previousMetadataSignature === nextMetadataSignature) {
          return previous;
        }
        return {
          ...previous,
          [childId]: {
            ...existingBinding,
            metadata: nextMetadata,
          },
        };
      });
    },
    [
      allStandardInputsRef,
      applyInputBindingPatch,
      standardInputsByIdRef,
      updateInputBinding,
    ],
  );

  const handleUnlinkChildInput = useCallback(
    (parentId: string, childId: string) => {
      unlinkChildInput({
        parentId,
        childId,
        updateInputBinding,
        standardInputsByIdRef,
        allStandardInputsRef,
      });
    },
    [allStandardInputsRef, standardInputsByIdRef, updateInputBinding],
  );

  const handleFaceIdChange = renameFaceId;

  useEffect(() => {
    graphRuntimeStore.setState({ handleFaceIdChange });
  }, [graphRuntimeStore, handleFaceIdChange]);

  const handleFocusSelectionIndex = useCallback(
    (index: number) => {
      setStoreState((state: VizijData) => {
        const current = state.elementSelection ?? [];
        if (index <= 0 || index >= current.length) {
          return {};
        }
        const next = current.slice();
        const [selected] = next.splice(index, 1);
        next.unshift(selected);
        return { elementSelection: next };
      });
    },
    [setStoreState],
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    selectionStore.setState({
      selectionStack: elementSelection,
      handleFocusSelectionIndex,
      handleClearSelection,
    });
  }, [
    elementSelection,
    handleClearSelection,
    handleFocusSelectionIndex,
    selectionStore,
  ]);

  useEffect(() => {
    setBindings((previous) =>
      reconcileBindings(previous, animatableComponents),
    );
  }, [animatableComponents]);

  useEffect(() => {
    const auto = deriveAutoFaceId(sourceName, rootRenderable);
    if (!auto) {
      return;
    }
    if (
      lastAutoFaceIdRef.current === null ||
      faceId === lastAutoFaceIdRef.current ||
      !faceId
    ) {
      setFaceId(auto);
    }
    lastAutoFaceIdRef.current = auto;
  }, [faceId, rootRenderable, setFaceId, sourceName]);

  useEffect(() => {
    if (!rigGraphBuild) {
      setGraphStatus("idle");
      setGraphError(null);
      setGraphWarning(null);
      emitLoadPhase({
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
        status: "pending",
      });
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      return;
    }

    emitLoadPhase({
      stepId: "runtime-stabilization",
      substepId: "settle-recompiles",
      status: "active",
    });

    const fatalIssues = rigGraphBuild.issues.fatal;
    if (fatalIssues.length > 0) {
      graphSummaryRef.current = null;
      graphIrRef.current = null;
      resetDrivenAnimatables();
      setGraphStatus("error");
      setGraphError(
        fatalIssues.length === 1 ? fatalIssues[0] : fatalIssues.join("; "),
      );
      setGraphWarning(null);
      emitLoadPhase({
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
        status: "error",
      });
      return;
    }

    if (runtimeGraphSpec.blocked || !runtimeGraphSpec.runtimeSpec) {
      if (!skipRuntimeUnloadRef.current) {
        graphSummaryRef.current = null;
        graphIrRef.current = null;
        resetDrivenAnimatables();
        setGraphStatus("error");
      } else {
        setGraphStatus("ready");
      }
      setGraphError(
        runtimeGraphSpec.warning ?? "IR compile failed. Runtime apply blocked.",
      );
      setGraphWarning(null);
      emitLoadPhase({
        stepId: "runtime-stabilization",
        substepId: "settle-recompiles",
        status: "error",
      });
      return;
    }

    graphSummaryRef.current = rigGraphBuild.summary;
    graphIrRef.current = rigGraphBuild.ir ?? null;
    if (__DEV__) {
      const signature = JSON.stringify({
        faceId,
        inputs: rigGraphBuild.summary.inputs.length,
        outputs: rigGraphBuild.summary.outputs.length,
        sampleInput: rigGraphBuild.summary.inputs[0] ?? null,
        sampleOutput: rigGraphBuild.summary.outputs[0] ?? null,
      });
      if (signature !== lastGraphSummaryLogSignatureRef.current) {
        lastGraphSummaryLogSignatureRef.current = signature;
        console.log("[rig-controller] graph summary", {
          faceId,
          inputs: rigGraphBuild.summary.inputs.length,
          outputs: rigGraphBuild.summary.outputs.length,
          sampleInput: rigGraphBuild.summary.inputs[0],
          sampleOutput: rigGraphBuild.summary.outputs[0],
          sampleOutputInAnimatables: rigGraphBuild.summary.outputs[0]
            ? Boolean(animatables[rigGraphBuild.summary.outputs[0]])
            : false,
        });
      }
    }
    setGraphStatus("ready");
    setGraphError(null);
    setGraphWarning(runtimeGraphSpec.warning ?? null);
    emitLoadPhase({
      stepId: "runtime-stabilization",
      substepId: "settle-recompiles",
      status: "complete",
    });
  }, [
    faceId,
    emitLoadPhase,
    resetDrivenAnimatables,
    rigGraphBuild,
    runtimeGraphSpec,
  ]);

  useEffect(() => {
    const summary = graphSummaryRef.current;
    if (graphStatus !== "ready" || !summary) {
      const emptySnapshot = createEmptyRuntimeInputRouteSnapshot();
      runtimeInputRoutesByCanonicalIdRef.current =
        emptySnapshot.routesByCanonicalId;
      runtimeInputGraphPathLookupRef.current =
        emptySnapshot.graphPathLookupByInputId;
      stagedRuntimeInputValuesRef.current = new Map();
      queuedRuntimeInputValuesRef.current = new Map();
      setGraphInputDefaults(emptySnapshot.defaults);
      setRuntimeInputMapRevision((previous) => previous + 1);
      resetDrivenAnimatables();
      return;
    }

    const routeSnapshot = buildRuntimeInputRouteSnapshot({
      faceId,
      graphSummary: summary,
      rigOutputLookup,
      standardInputsByPath,
      standardInputsById,
      managedStandardInputs: faceId ? managedStandardInputs : [],
      resolveRuntimeInputId,
    });

    runtimeInputRoutesByCanonicalIdRef.current =
      routeSnapshot.routesByCanonicalId;
    runtimeInputGraphPathLookupRef.current =
      routeSnapshot.graphPathLookupByInputId;
    setGraphInputDefaults(routeSnapshot.defaults);
    setRuntimeInputMapRevision((previous) => previous + 1);
  }, [
    faceId,
    graphStatus,
    managedStandardInputs,
    resetDrivenAnimatables,
    resolveRuntimeInputId,
    standardInputsById,
    standardInputsByPath,
    rigOutputLookup,
  ]);

  useEffect(() => {
    stagedRuntimeInputValuesRef.current = new Map();
    queuedRuntimeInputValuesRef.current = new Map();
  }, [runtimeInputBridgeEpoch]);

  useEffect(() => {
    stageInputsFromState();
  }, [
    graphStatus,
    runtimeInputBridgeEpoch,
    runtimeInputMapRevision,
    stageInputsFromState,
  ]);

  useEffect(() => {
    if (graphStatus !== "ready" || graphError) {
      queuedRuntimeInputValuesRef.current.clear();
      return;
    }
    const stageRuntimeInput = getStageRuntimeInput();
    if (!stageRuntimeInput) {
      return;
    }
    flushQueuedRuntimeInputs({
      queueByGraphPath: queuedRuntimeInputValuesRef.current,
      stagedByGraphPath: stagedRuntimeInputValuesRef.current,
      stageRuntimeInput,
    });
  }, [
    getStageRuntimeInput,
    graphError,
    graphStatus,
    runtimeInputBridgeEpoch,
    runtimeInputStageQueueRevision,
  ]);

  const collectAnimatableExportState = useCallback(() => {
    const nextAnimatables = { ...animatables };
    const nextValues = new Map(values);
    let appliedOverrides = false;

    for (const [animId, animatable] of Object.entries(animatables)) {
      const lookupKey = getLookup(namespace, animId);
      if (!nextValues.has(lookupKey)) {
        continue;
      }
      appliedOverrides = true;
      nextValues.delete(lookupKey);
      nextAnimatables[animId] = animatable;
    }

    return {
      appliedOverrides,
      nextAnimatables,
      nextValues,
      effectiveAnimatables: appliedOverrides ? nextAnimatables : animatables,
    };
  }, [animatables, namespace, values]);

  useEffect(() => {
    bindingAuthoringStore.setState({
      bindingIssues,
      featureLabelOverrides,
      featureFlags,
      standardInputSchema,
      managedStandardInputs,
      standardInputRoots,
      selectedStandardInputRoots,
      selectedStandardInputSubgroups,
      standardInputs,
      standardInputsById,
      standardInputsByPath,
      rigOutputLookup,
      validOutputTargets,
      pipelineMetadataV1: mergedPipelineMetadataV1,
      pipelineConfigByInputId,
      inputValues,
      timelineInputLockActive: timelineInputLockActiveRef.current,
      timelineLockedInputIds: timelineLockedInputIdsRef.current,
      bindings,
      inputBindings,
      animatableComponents,
      handleInputValueChange,
      stageRuntimeGraphPathValue,
      applyStandardInputBatch,
      handleResetAllInputValues,
      handleClearCachedState,
      handleBindingInputChange,
      handleResetBinding,
      applyBindingPatch,
      applyInputBindingPatch,
      handleCreateCustomStandardInput,
      handleLinkChildInput,
      handleUnlinkChildInput,
      handleRenameShape,
      handleUpdateStandardInput,
      handleDisableStandardInput,
      handleEnableStandardInput,
      handleDeleteCustomStandardInput,
      handleAddBindingSlot,
      handleRemoveBindingSlot,
      handleUpdateBindingExpression,
      handleUpdateBindingSlotAlias,
      handleEnsureParentBinding,
      handleBindingSlotValueTypeChange,
      handleParentBindingInputChange,
      handleParentAddBindingSlot,
      handleParentRemoveBindingSlot,
      handleParentBindingExpressionChange,
      handleParentBindingSlotAliasChange,
      handleParentBindingSlotValueTypeChange,
      handleParentResetBinding,
      handleEnableParentLocalControl,
      handleUpdateFeatureLabel,
      setFeatureLabelOverrides,
      setStandardInputSchema: handleSetStandardInputSchema,
      handleFeatureFlagChange,
      handleSelectStandardInputRoots,
      handleSelectStandardInputSubgroups,
      lockedInspectorTargetIds,
      lockedPropsRigInputIds,
      handleSetInspectorTargetLocked,
      handleToggleInspectorTargetLock,
      handleMigrateAllLegacyBindings,
      collectAnimatableExportState,
      hiddenDriverIds,
      handleHideDriver,
      handleShowDriver,
      handleShowAllDrivers,
      handleCreateParentDriverBinding,
      handleCloneStandardInputs,
    });
  }, [
    animatableComponents,
    applyStandardInputBatch,
    bindingAuthoringStore,
    bindingIssues,
    bindings,
    collectAnimatableExportState,
    featureFlags,
    featureLabelOverrides,
    handleAddBindingSlot,
    handleBindingInputChange,
    applyBindingPatch,
    applyInputBindingPatch,
    handleBindingSlotValueTypeChange,
    handleClearCachedState,
    handleCreateCustomStandardInput,
    handleDeleteCustomStandardInput,
    handleDisableStandardInput,
    handleEnableStandardInput,
    handleEnsureParentBinding,
    handleFeatureFlagChange,
    handleSetInspectorTargetLocked,
    handleToggleInspectorTargetLock,
    handleMigrateAllLegacyBindings,
    handleHideDriver,
    handleInputValueChange,
    stageRuntimeGraphPathValue,
    handleLinkChildInput,
    handleCloneStandardInputs,
    handleParentAddBindingSlot,
    handleParentBindingExpressionChange,
    handleParentBindingInputChange,
    handleParentBindingSlotAliasChange,
    handleParentBindingSlotValueTypeChange,
    handleParentRemoveBindingSlot,
    handleParentResetBinding,
    handleEnableParentLocalControl,
    handleShowAllDrivers,
    handleShowDriver,
    setFeatureLabelOverrides,
    handleRenameShape,
    handleResetAllInputValues,
    handleResetBinding,
    handleSelectStandardInputRoots,
    handleSelectStandardInputSubgroups,
    handleUnlinkChildInput,
    handleUpdateBindingExpression,
    handleUpdateBindingSlotAlias,
    handleUpdateFeatureLabel,
    handleUpdateStandardInput,
    inputBindings,
    inputValues,
    managedStandardInputs,
    hiddenDriverIds,
    handleCreateParentDriverBinding,
    handleEnableParentLocalControl,
    lockedInspectorTargetIds,
    lockedPropsRigInputIds,
    pipelineConfigByInputId,
    mergedPipelineMetadataV1,
    rigOutputLookup,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    standardInputRoots,
    standardInputs,
    standardInputsById,
    standardInputsByPath,
    validOutputTargets,
  ]);
}
