import {
  bindingFromDefinition,
  bindingTargetFromComponent,
  bindingTargetFromInput,
  bindingToDefinition,
  type BindingMap,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import {
  createStandardRigInput,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  type AnimatableComponent,
  type RigBindingDefinition,
  type StandardRigInput,
} from "@vizij/utils";
import { remapBindingInputIds } from "./standardInputRemapApplication";

export type ShapeInputRenameAutoInputState = {
  input: StandardRigInput;
  metadata: {
    elementId: string;
    elementName: string;
    root: string;
  };
  generatedLabel: string;
  generatedDefaultValue: number;
  generatedRange: { min: number; max: number };
  sourcePath: string;
  sourceId?: string | null;
};

export type PersistedAutoStandardInputLike = {
  id: string;
  path: string;
  sourceId?: string;
  sourcePath?: string;
  group?: string;
  label?: string;
  defaultValue?: number;
  range?: {
    min?: number;
    max?: number;
  };
};

type RenameRecord<TAutoInputState extends ShapeInputRenameAutoInputState> = {
  updatedInput: StandardRigInput;
  kind: "auto" | "custom";
  autoKey?: string;
  originalAutoState?: TAutoInputState;
  updatedAutoState?: TAutoInputState;
};

export type ShapeInputRenamePlanOptions<
  TAutoInputState extends
    ShapeInputRenameAutoInputState = ShapeInputRenameAutoInputState,
  TPersistedAutoInput extends
    PersistedAutoStandardInputLike = PersistedAutoStandardInputLike,
> = {
  shapeId: string;
  oldSlug: string;
  newSlug: string;
  shapeName: string;
  previousName: string;
  autoInputs: ReadonlyMap<string, TAutoInputState>;
  customInputs: readonly StandardRigInput[];
  allStandardInputs: ReadonlyMap<string, StandardRigInput>;
  disabledInputIds: readonly string[];
  disabledInputBindingCache: ReadonlyMap<string, RigBindingDefinition>;
  inputValues: StandardInputValues;
  bindings: BindingMap;
  componentsById: ReadonlyMap<string, AnimatableComponent>;
  inputBindings: InputBindingMap;
  pendingInputBindingDefinitions: Record<string, RigBindingDefinition> | null;
  persistedAutoInputs: ReadonlyMap<string, TPersistedAutoInput>;
  selectedStandardInputRoots: readonly string[];
  selectedStandardInputSubgroups: readonly string[];
  featureLabelOverrides: Record<string, string>;
  resolvePersistedAutoKey: (
    sourceId?: string | null,
    sourcePath?: string | null,
  ) => string | null;
};

export type ShapeInputRenamePlan<
  TAutoInputState extends
    ShapeInputRenameAutoInputState = ShapeInputRenameAutoInputState,
  TPersistedAutoInput extends
    PersistedAutoStandardInputLike = PersistedAutoStandardInputLike,
> = {
  changed: boolean;
  shouldRefreshAutoMetadata: boolean;
  inputIdMap: Map<string, string>;
  autoInputs: Map<string, TAutoInputState>;
  autoInputUpdates: Array<{ key: string; state: TAutoInputState }>;
  customInputs: StandardRigInput[];
  allStandardInputs: Map<string, StandardRigInput>;
  disabledInputIds: string[];
  disabledInputBindingCache: Map<string, RigBindingDefinition>;
  inputValues: StandardInputValues;
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  pendingInputBindingDefinitions: Record<string, RigBindingDefinition> | null;
  persistedAutoInputs: Map<string, TPersistedAutoInput>;
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  featureLabelOverrides: Record<string, string>;
};

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

function remapInputValuesWithDefaults(
  values: StandardInputValues,
  idRemap: ReadonlyMap<string, string>,
  renameRecords: ReadonlyMap<
    string,
    RenameRecord<ShapeInputRenameAutoInputState>
  >,
): StandardInputValues {
  if (idRemap.size === 0) {
    return values;
  }
  let changed = false;
  const next: StandardInputValues = {};
  Object.entries(values).forEach(([inputId, value]) => {
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
  return changed ? next : values;
}

function remapPendingInputBindingDefinitions({
  pending,
  idRemap,
  updatedInputs,
}: {
  pending: Record<string, RigBindingDefinition> | null;
  idRemap: ReadonlyMap<string, string>;
  updatedInputs: ReadonlyMap<string, StandardRigInput>;
}): Record<string, RigBindingDefinition> | null {
  if (!pending || idRemap.size === 0) {
    return pending;
  }
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
  return nextDefinitions;
}

function remapSelectedRootTokens(
  values: readonly string[],
  oldSlug: string,
  newSlug: string,
): string[] {
  if (values.length === 0 || oldSlug === newSlug) {
    return [...values];
  }
  let changed = false;
  const next = values.map((token) => {
    if (token === oldSlug) {
      changed = true;
      return newSlug;
    }
    return token;
  });
  return changed ? Array.from(new Set(next)) : [...values];
}

function remapSelectedSubgroupTokens(
  values: readonly string[],
  oldSlug: string,
  newSlug: string,
): string[] {
  if (values.length === 0 || oldSlug === newSlug) {
    return [...values];
  }
  let changed = false;
  const next = values.map((token) => {
    if (token.startsWith(`${oldSlug}/`)) {
      changed = true;
      return `${newSlug}/${token.slice(oldSlug.length + 1)}`;
    }
    return token;
  });
  return changed ? Array.from(new Set(next)) : [...values];
}

function renameFeatureLabelOverrides({
  featureLabelOverrides,
  shapeId,
  previousName,
  shapeName,
}: {
  featureLabelOverrides: Record<string, string>;
  shapeId: string;
  previousName: string;
  shapeName: string;
}): Record<string, string> {
  if (Object.keys(featureLabelOverrides).length === 0) {
    return featureLabelOverrides;
  }
  let changed = false;
  const next = { ...featureLabelOverrides };
  Object.entries(featureLabelOverrides).forEach(([featureId, value]) => {
    if (!featureId.startsWith(`${shapeId}:`) || !value) {
      return;
    }
    const renamed = renameText(value, previousName, shapeName);
    if (renamed && renamed !== value) {
      next[featureId] = renamed;
      changed = true;
    }
  });
  return changed ? next : featureLabelOverrides;
}

export function planShapeInputRename<
  TAutoInputState extends
    ShapeInputRenameAutoInputState = ShapeInputRenameAutoInputState,
  TPersistedAutoInput extends
    PersistedAutoStandardInputLike = PersistedAutoStandardInputLike,
>({
  shapeId,
  oldSlug,
  newSlug,
  shapeName,
  previousName,
  autoInputs,
  customInputs,
  allStandardInputs,
  disabledInputIds,
  disabledInputBindingCache,
  inputValues,
  bindings,
  componentsById,
  inputBindings,
  pendingInputBindingDefinitions,
  persistedAutoInputs,
  selectedStandardInputRoots,
  selectedStandardInputSubgroups,
  featureLabelOverrides,
  resolvePersistedAutoKey,
}: ShapeInputRenamePlanOptions<
  TAutoInputState,
  TPersistedAutoInput
>): ShapeInputRenamePlan<TAutoInputState, TPersistedAutoInput> {
  const renameRecords = new Map<string, RenameRecord<TAutoInputState>>();

  autoInputs.forEach((state, key) => {
    if (state.metadata.elementId !== shapeId) {
      return;
    }
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
    const updatedAutoState = {
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
    } as TAutoInputState;
    renameRecords.set(state.input.id, {
      updatedInput,
      kind: "auto",
      autoKey: key,
      originalAutoState: state,
      updatedAutoState,
    });
  });

  customInputs.forEach((input) => {
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
    return {
      changed: false,
      shouldRefreshAutoMetadata: true,
      inputIdMap: new Map(),
      autoInputs: new Map(autoInputs),
      autoInputUpdates: [],
      customInputs: [...customInputs],
      allStandardInputs: new Map(allStandardInputs),
      disabledInputIds: [...disabledInputIds],
      disabledInputBindingCache: new Map(disabledInputBindingCache),
      inputValues,
      bindings,
      inputBindings,
      pendingInputBindingDefinitions,
      persistedAutoInputs: new Map(persistedAutoInputs),
      selectedStandardInputRoots: [...selectedStandardInputRoots],
      selectedStandardInputSubgroups: [...selectedStandardInputSubgroups],
      featureLabelOverrides,
    };
  }

  const inputIdMap = new Map<string, string>();
  renameRecords.forEach((record, oldId) => {
    if (record.updatedInput.id !== oldId) {
      inputIdMap.set(oldId, record.updatedInput.id);
    }
  });

  const nextCustomInputs = customInputs.map((input) => {
    const record = renameRecords.get(input.id);
    return record && record.kind === "custom" ? record.updatedInput : input;
  });

  const nextAutoInputs = new Map<string, TAutoInputState>();
  const autoInputUpdates: Array<{ key: string; state: TAutoInputState }> = [];
  autoInputs.forEach((entry, key) => {
    const record = renameRecords.get(entry.input.id);
    if (record?.kind === "auto" && record.updatedAutoState) {
      nextAutoInputs.set(record.updatedInput.path, record.updatedAutoState);
      autoInputUpdates.push({
        key: record.updatedInput.path,
        state: record.updatedAutoState,
      });
      return;
    }
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
              entry.metadata.root === oldSlug ? newSlug : entry.metadata.root,
          },
        } as TAutoInputState;
      }
    }
    nextAutoInputs.set(key, current);
  });

  const nextAllStandardInputs = new Map(allStandardInputs);
  renameRecords.forEach((record, oldId) => {
    nextAllStandardInputs.delete(oldId);
    nextAllStandardInputs.set(record.updatedInput.id, record.updatedInput);
  });

  const nextDisabledInputIds =
    inputIdMap.size === 0
      ? [...disabledInputIds]
      : disabledInputIds.map((inputId) => inputIdMap.get(inputId) ?? inputId);

  const nextDisabledInputBindingCache = new Map(disabledInputBindingCache);
  if (inputIdMap.size > 0) {
    inputIdMap.forEach((newId, oldId) => {
      const cached = nextDisabledInputBindingCache.get(oldId);
      if (cached) {
        nextDisabledInputBindingCache.delete(oldId);
        nextDisabledInputBindingCache.set(newId, cached);
      }
    });
  }

  const nextBindings: BindingMap =
    inputIdMap.size === 0
      ? bindings
      : Object.fromEntries(
          Object.entries(bindings).flatMap(([targetId, binding]) => {
            if (!binding) {
              return [];
            }
            const component = componentsById.get(targetId);
            if (!component) {
              return [[targetId, binding]];
            }
            const target = bindingTargetFromComponent(component);
            return [
              [targetId, remapBindingInputIds(binding, target, inputIdMap)],
            ];
          }),
        );

  const nextInputBindings: InputBindingMap =
    inputIdMap.size === 0
      ? inputBindings
      : Object.fromEntries(
          Object.entries(inputBindings).flatMap(([targetId, binding]) => {
            const remappedKey = inputIdMap.get(targetId) ?? targetId;
            const targetInput = nextAllStandardInputs.get(remappedKey);
            if (!targetInput) {
              return [];
            }
            const remapped = remapBindingInputIds(
              binding,
              bindingTargetFromInput(targetInput),
              inputIdMap,
            );
            return [[remappedKey, remapped]];
          }),
        );

  const nextPersistedAutoInputs = new Map(persistedAutoInputs);
  renameRecords.forEach((record) => {
    if (record.kind !== "auto" || !record.originalAutoState) {
      return;
    }
    const originalKey = resolvePersistedAutoKey(
      record.originalAutoState.sourceId,
      record.originalAutoState.sourcePath,
    );
    if (originalKey) {
      nextPersistedAutoInputs.delete(originalKey);
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
    nextPersistedAutoInputs.set(newKey, {
      id: record.updatedInput.id,
      path: record.updatedInput.path,
      sourcePath: record.updatedAutoState.sourcePath,
      sourceId: record.updatedAutoState.sourceId ?? undefined,
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
    } as TPersistedAutoInput);
  });

  return {
    changed: true,
    shouldRefreshAutoMetadata: false,
    inputIdMap,
    autoInputs: nextAutoInputs,
    autoInputUpdates,
    customInputs: nextCustomInputs,
    allStandardInputs: nextAllStandardInputs,
    disabledInputIds: nextDisabledInputIds,
    disabledInputBindingCache: nextDisabledInputBindingCache,
    inputValues: remapInputValuesWithDefaults(
      inputValues,
      inputIdMap,
      renameRecords,
    ),
    bindings: nextBindings,
    inputBindings: nextInputBindings,
    pendingInputBindingDefinitions: remapPendingInputBindingDefinitions({
      pending: pendingInputBindingDefinitions,
      idRemap: inputIdMap,
      updatedInputs: nextAllStandardInputs,
    }),
    persistedAutoInputs: nextPersistedAutoInputs,
    selectedStandardInputRoots: remapSelectedRootTokens(
      selectedStandardInputRoots,
      oldSlug,
      newSlug,
    ),
    selectedStandardInputSubgroups: remapSelectedSubgroupTokens(
      selectedStandardInputSubgroups,
      oldSlug,
      newSlug,
    ),
    featureLabelOverrides: renameFeatureLabelOverrides({
      featureLabelOverrides,
      shapeId,
      previousName,
      shapeName,
    }),
  };
}
