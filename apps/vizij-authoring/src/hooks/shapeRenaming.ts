import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  bindingFromDefinition,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  ensureBindingStructure,
  type AnimatableBinding,
  type BindingMap,
  type BindingTarget,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import {
  createStandardRigInput,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  type AnimatableComponent as AnimComponent,
  type RigBindingDefinition,
  type StandardRigInput,
} from "@vizij/utils";
import { remapPipelineMetadataInputIds } from "@vizij/studio-support";
import type { PersistedAutoStandardInput } from "../rig/persistence";
import type { AutoInputState } from "../types/autoInputs";
import type { VizijPipelineMetadataV1 } from "../utils/graphImport";

type AnimatableComponent = AnimComponent;

type RenameRecord = {
  updatedInput: StandardRigInput;
  kind: "auto" | "custom";
  autoKey?: string;
  originalAutoState?: AutoInputState;
  updatedAutoState?: AutoInputState;
};

export interface ShapeRenameParams {
  shapeId: string;
  oldSlug: string;
  newSlug: string;
  shapeName: string;
  previousName: string;
  autoInputsRef: MutableRefObject<Map<string, AutoInputState>>;
  customInputsRef: MutableRefObject<StandardRigInput[]>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  setAutoInputs: Dispatch<SetStateAction<Map<string, AutoInputState>>>;
  allStandardInputsRef: MutableRefObject<Map<string, StandardRigInput>>;
  setDisabledStandardInputIds: Dispatch<SetStateAction<string[]>>;
  disabledInputBindingCacheRef: MutableRefObject<
    Map<string, RigBindingDefinition>
  >;
  updateInputValues: (
    updater: (prev: StandardInputValues) => StandardInputValues,
  ) => void;
  setBindings: Dispatch<SetStateAction<BindingMap>>;
  componentsByIdRef: MutableRefObject<Map<string, AnimatableComponent>>;
  setInputBindings: Dispatch<SetStateAction<InputBindingMap>>;
  pendingInputBindingDefinitionsRef: MutableRefObject<Record<
    string,
    RigBindingDefinition
  > | null>;
  persistedAutoInputsRef: MutableRefObject<
    Map<string, PersistedAutoStandardInput>
  >;
  refreshAutoMetadataForShape: (shapeId: string, shapeName: string) => void;
  setSelectedStandardInputRoots: Dispatch<SetStateAction<string[]>>;
  setSelectedStandardInputSubgroups: Dispatch<SetStateAction<string[]>>;
  setFeatureLabelOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  resolvePersistedAutoKey: (
    sourceId?: string | null,
    sourcePath?: string | null,
  ) => string | null;
}

function renameText(
  value: string | undefined | null,
  previousName: string,
  shapeName: string,
): string | undefined {
  if (!value) {
    return value ?? undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return value ?? undefined;
  }
  if (trimmed === previousName) {
    return value.replace(trimmed, shapeName);
  }
  if (trimmed.startsWith(`${previousName} `)) {
    return value.replace(
      trimmed,
      `${shapeName}${trimmed.slice(previousName.length)}`,
    );
  }
  return value ?? undefined;
}

export function applyShapeInputRename({
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
}: ShapeRenameParams): Map<string, string> {
  const autoTargets = Array.from(autoInputsRef.current.entries()).filter(
    ([, entry]) => entry.metadata.elementId === shapeId,
  );
  const customTargets = customInputsRef.current.filter((input) => {
    const normalized = normalizeStandardRigInputPath(input.path);
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 0) {
      return false;
    }
    const offset = segments[0] === "standard" ? 1 : 0;
    if (offset >= segments.length) {
      return false;
    }
    return segments[offset] === oldSlug;
  });

  const renameRecords = new Map<string, RenameRecord>();

  autoTargets.forEach(([key, state]) => {
    const normalizedPath = normalizeStandardRigInputPath(state.input.path);
    const pathSegments = normalizedPath.split("/").filter(Boolean);
    if (pathSegments[0] === "standard") {
      return;
    }
    const renamedPath = replaceSlugInPath(normalizedPath, oldSlug, newSlug);
    if (renamedPath === normalizedPath) {
      return;
    }
    const generatedNewLabel = deriveLabelFromNormalizedPath(
      normalizeStandardRigInputPath(renamedPath),
    );
    const nextLabel =
      state.input.label === state.generatedLabel
        ? generatedNewLabel
        : (renameText(state.input.label, previousName, shapeName) ??
          state.input.label);
    const updatedInput = createStandardRigInput({
      path: renamedPath,
      label: nextLabel,
      group: deriveGroupFromNormalizedPath(renamedPath),
      defaultValue: state.input.defaultValue,
      range: {
        min: state.input.range.min,
        max: state.input.range.max,
      },
      sourceId: state.input.sourceId,
      parentBinding: state.input.parentBinding ?? undefined,
      derivedChildren: state.input.derivedChildren ?? undefined,
    });
    const updatedSourcePath = replaceSlugInPath(
      state.sourcePath,
      oldSlug,
      newSlug,
    );
    const updatedAutoState: AutoInputState = {
      ...state,
      input: updatedInput,
      metadata: {
        ...state.metadata,
        elementName: shapeName,
        root: state.metadata.root === oldSlug ? newSlug : state.metadata.root,
      },
      sourcePath: updatedSourcePath,
      generatedLabel: generatedNewLabel,
      sourceId: state.sourceId,
    };
    renameRecords.set(state.input.id, {
      updatedInput,
      kind: "auto",
      autoKey: key,
      originalAutoState: state,
      updatedAutoState,
    });
  });

  customTargets.forEach((input) => {
    const normalizedPath = normalizeStandardRigInputPath(input.path);
    const pathSegments = normalizedPath.split("/").filter(Boolean);
    if (pathSegments[0] === "standard") {
      return;
    }
    const renamedPath = replaceSlugInPath(normalizedPath, oldSlug, newSlug);
    if (renamedPath === normalizedPath) {
      return;
    }
    const generatedNewLabel = deriveLabelFromNormalizedPath(
      normalizeStandardRigInputPath(renamedPath),
    );
    const nextLabel =
      input.label === deriveLabelFromNormalizedPath(normalizedPath)
        ? generatedNewLabel
        : (renameText(input.label, previousName, shapeName) ?? input.label);
    const updatedInput = createStandardRigInput({
      path: renamedPath,
      label: nextLabel,
      group: deriveGroupFromNormalizedPath(renamedPath),
      defaultValue: input.defaultValue,
      range: {
        min: input.range.min,
        max: input.range.max,
      },
      sourceId: input.sourceId,
      parentBinding: input.parentBinding ?? undefined,
      derivedChildren: input.derivedChildren ?? undefined,
    });
    renameRecords.set(input.id, {
      updatedInput,
      kind: "custom",
    });
  });

  if (renameRecords.size === 0) {
    refreshAutoMetadataForShape(shapeId, shapeName);
    return new Map();
  }

  const idRemap = new Map<string, string>();
  renameRecords.forEach((record, oldId) => {
    if (record.updatedInput.id !== oldId) {
      idRemap.set(oldId, record.updatedInput.id);
    }
  });

  setCustomInputs((previous) => {
    let changed = false;
    const next = previous.map((input) => {
      const record = renameRecords.get(input.id);
      if (record && record.kind === "custom") {
        changed = true;
        return record.updatedInput;
      }
      return input;
    });
    return changed ? next : previous;
  });

  setAutoInputs((previous) => {
    let changed = false;
    const next = new Map<string, AutoInputState>();
    previous.forEach((entry, key) => {
      const record = renameRecords.get(entry.input.id);
      if (record && record.kind === "auto" && record.updatedAutoState) {
        changed = true;
        next.set(record.updatedInput.path, record.updatedAutoState);
      } else {
        let current = entry;
        if (entry.metadata.elementId === shapeId) {
          if (
            entry.metadata.elementName !== shapeName ||
            (entry.metadata.root === oldSlug && oldSlug !== newSlug)
          ) {
            current = {
              ...entry,
              metadata: {
                ...entry.metadata,
                elementName: shapeName,
                root:
                  entry.metadata.root === oldSlug
                    ? newSlug
                    : entry.metadata.root,
              },
            };
            changed = true;
          }
        }
        next.set(key, current);
      }
    });
    return changed ? next : previous;
  });

  const updatedInputs = new Map(allStandardInputsRef.current);
  renameRecords.forEach((record, oldId) => {
    updatedInputs.delete(oldId);
    updatedInputs.set(record.updatedInput.id, record.updatedInput);
  });
  allStandardInputsRef.current = updatedInputs;

  if (idRemap.size > 0) {
    setDisabledStandardInputIds((previous) =>
      previous.map((inputId) => idRemap.get(inputId) ?? inputId),
    );
    idRemap.forEach((newId, oldId) => {
      const cached = disabledInputBindingCacheRef.current.get(oldId);
      if (cached) {
        disabledInputBindingCacheRef.current.delete(oldId);
        disabledInputBindingCacheRef.current.set(newId, cached);
      }
    });
  }

  updateInputValues((previous) => {
    if (idRemap.size === 0) {
      return previous;
    }
    let changed = false;
    const next: StandardInputValues = {};
    Object.entries(previous).forEach(([inputId, value]) => {
      const remappedId = idRemap.get(inputId) ?? inputId;
      next[remappedId] = value;
      if (remappedId !== inputId) {
        changed = true;
      }
    });
    renameRecords.forEach((record) => {
      if (!Object.prototype.hasOwnProperty.call(next, record.updatedInput.id)) {
        next[record.updatedInput.id] = record.updatedInput.defaultValue;
        changed = true;
      }
    });
    return changed ? next : previous;
  });

  setBindings((previous) => {
    if (idRemap.size === 0) {
      return previous;
    }
    let changed = false;
    const next: BindingMap = {};
    Object.entries(previous).forEach(([targetId, binding]) => {
      if (!binding) {
        return;
      }
      const component = componentsByIdRef.current.get(targetId);
      if (!component) {
        next[targetId] = binding;
        return;
      }
      const target = bindingTargetFromComponent(component);
      const remapped = remapBindingInputIds(binding, target, idRemap);
      next[targetId] = remapped;
      if (remapped !== binding) {
        changed = true;
      }
    });
    return changed ? next : previous;
  });

  setInputBindings((previous) => {
    if (idRemap.size === 0) {
      return previous;
    }
    let changed = false;
    const next: InputBindingMap = {};
    Object.entries(previous).forEach(([targetId, binding]) => {
      const remappedKey = idRemap.get(targetId) ?? targetId;
      const targetInput = updatedInputs.get(remappedKey);
      if (!targetInput) {
        return;
      }
      const remapped = remapBindingInputIds(
        binding,
        bindingTargetFromInput(targetInput),
        idRemap,
      );
      if (remappedKey !== targetId || remapped !== binding) {
        changed = true;
      }
      next[remappedKey] = remapped;
    });
    return changed ? next : previous;
  });

  const pending = pendingInputBindingDefinitionsRef.current;
  if (pending && idRemap.size > 0) {
    const nextDefinitions: Record<string, RigBindingDefinition> = {};
    Object.entries(pending).forEach(([targetId, definition]) => {
      const remappedKey = idRemap.get(targetId) ?? targetId;
      const targetInput = updatedInputs.get(remappedKey);
      if (!targetInput) {
        return;
      }
      const target = bindingTargetFromInput(targetInput);
      const remapped = remapBindingInputIds(
        bindingFromDefinition(target, definition),
        target,
        idRemap,
      );
      nextDefinitions[remappedKey] = bindingToDefinition(remapped);
    });
    pendingInputBindingDefinitionsRef.current = nextDefinitions;
  }

  const persistedOverrides = persistedAutoInputsRef.current;
  renameRecords.forEach((record) => {
    if (record.kind !== "auto" || !record.originalAutoState) {
      return;
    }
    const originalKey = resolvePersistedAutoKey(
      record.originalAutoState.sourceId,
      record.originalAutoState.sourcePath,
    );
    if (originalKey) {
      persistedOverrides.delete(originalKey);
    }
    if (!record.updatedAutoState) {
      return;
    }
    const newKey = resolvePersistedAutoKey(
      record.updatedAutoState.sourceId,
      record.updatedAutoState.sourcePath,
    );
    if (!newKey) {
      return;
    }
    persistedOverrides.set(newKey, {
      id: record.updatedInput.id,
      path: record.updatedInput.path,
      sourcePath: record.updatedAutoState.sourcePath,
      sourceId: record.updatedAutoState.sourceId,
      group:
        record.updatedAutoState.input.group !==
        deriveGroupFromNormalizedPath(record.updatedAutoState.sourcePath)
          ? record.updatedAutoState.input.group
          : undefined,
      label:
        record.updatedAutoState.input.label !==
        record.updatedAutoState.generatedLabel
          ? record.updatedAutoState.input.label
          : undefined,
      defaultValue:
        record.updatedAutoState.input.defaultValue !==
        record.updatedAutoState.generatedDefaultValue
          ? record.updatedAutoState.input.defaultValue
          : undefined,
      range:
        record.updatedAutoState.input.range.min !==
          record.updatedAutoState.generatedRange.min ||
        record.updatedAutoState.input.range.max !==
          record.updatedAutoState.generatedRange.max
          ? {
              min: record.updatedAutoState.input.range.min,
              max: record.updatedAutoState.input.range.max,
            }
          : undefined,
    });
  });

  setSelectedStandardInputRoots((previous) => {
    if (previous.length === 0 || oldSlug === newSlug) {
      return previous;
    }
    let changed = false;
    const next = previous.map((token) => {
      if (token === oldSlug) {
        changed = true;
        return newSlug;
      }
      return token;
    });
    if (!changed) {
      return previous;
    }
    return Array.from(new Set(next));
  });

  setSelectedStandardInputSubgroups((previous) => {
    if (previous.length === 0 || oldSlug === newSlug) {
      return previous;
    }
    let changed = false;
    const next = previous.map((token) => {
      if (token.startsWith(`${oldSlug}/`)) {
        changed = true;
        return `${newSlug}/${token.slice(oldSlug.length + 1)}`;
      }
      return token;
    });
    if (!changed) {
      return previous;
    }
    return Array.from(new Set(next));
  });

  setFeatureLabelOverrides((previous) => {
    if (Object.keys(previous).length === 0) {
      return previous;
    }
    let changed = false;
    const next = { ...previous };
    Object.entries(previous).forEach(([featureId, value]) => {
      if (!featureId.startsWith(`${shapeId}:`)) {
        return;
      }
      if (!value) {
        return;
      }
      const trimmedValue = value.trim();
      let replacement: string | null = null;
      if (trimmedValue === previousName) {
        replacement = shapeName;
      } else if (trimmedValue.startsWith(`${previousName} `)) {
        replacement = `${shapeName}${trimmedValue.slice(previousName.length)}`;
      }
      if (replacement && replacement !== value) {
        next[featureId] = replacement;
        changed = true;
      }
    });
    return changed ? next : previous;
  });

  return idRemap;
}

function replaceSlugInPath(
  path: string,
  oldSlug: string,
  newSlug: string,
): string {
  if (!path) {
    return path;
  }
  const normalized = normalizeStandardRigInputPath(path);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return normalized;
  }
  const offset = segments[0] === "standard" ? 1 : 0;
  if (offset >= segments.length) {
    return normalized;
  }
  if (segments[offset] !== oldSlug) {
    return normalized;
  }
  segments[offset] = newSlug;
  return normalizeStandardRigInputPath(`/${segments.join("/")}`);
}

function remapBindingInputIds(
  binding: AnimatableBinding,
  target: BindingTarget,
  idRemap: Map<string, string>,
): AnimatableBinding {
  if (idRemap.size === 0) {
    return ensureBindingStructure(binding, target);
  }
  const ensured = ensureBindingStructure(binding, target);
  let changed = false;

  const remappedInputId =
    ensured.inputId && idRemap.has(ensured.inputId)
      ? (idRemap.get(ensured.inputId) ?? ensured.inputId)
      : ensured.inputId;
  if (remappedInputId !== ensured.inputId) {
    changed = true;
  }
  if (ensured.targetId !== target.id) {
    changed = true;
  }

  const remappedSlots = ensured.slots.map((slot) => {
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
      inputId: remappedInputId ?? null,
      slots: remappedSlots,
      metadata: remapBindingMetadataInputIds(ensured.metadata, idRemap),
      targetId: target.id,
    },
    target,
  );
}

function remapBindingMetadataInputIds(
  metadata: AnimatableBinding["metadata"],
  idRemap: ReadonlyMap<string, string>,
): AnimatableBinding["metadata"] {
  if (!metadata || idRemap.size === 0) {
    return metadata;
  }
  const metadataRecord =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  if (!metadataRecord) {
    return metadata;
  }
  const vizij =
    metadataRecord.vizij &&
    typeof metadataRecord.vizij === "object" &&
    !Array.isArray(metadataRecord.vizij)
      ? (metadataRecord.vizij as Record<string, unknown>)
      : null;
  const remappedPipeline = vizij
    ? remapPipelineMetadataInputIds(
        (vizij.pipelineV1 as VizijPipelineMetadataV1 | null | undefined) ??
          null,
        idRemap,
      )
    : null;
  if (!remappedPipeline || remappedPipeline === vizij?.pipelineV1) {
    return metadata;
  }
  return {
    ...metadataRecord,
    vizij: {
      ...(vizij ?? {}),
      pipelineV1: remappedPipeline,
    },
  };
}
