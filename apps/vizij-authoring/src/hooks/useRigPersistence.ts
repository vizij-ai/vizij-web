import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  bindingToDefinition,
  createDefaultBindings,
  reconcileBindings,
  type BindingMap,
  type InputBindingMap,
  type StandardInputValues,
} from "@vizij/node-graph-authoring";
import {
  createStandardRigInput,
  SELF_BINDING_ID,
  deriveGroupFromNormalizedPath,
  normalizeStandardRigInputPath,
  type AnimatableComponent as AnimComponent,
  type RigBindingDefinition,
  type StandardRigInput,
} from "@vizij/utils";
import {
  deleteRigState,
  formatRigPersistenceError,
  loadRigState,
  RIG_STATE_SCHEMA_VERSION,
  saveRigState,
  type PersistedAutoStandardInput,
  type PersistedGraphInsight,
  type RigPersistenceError,
} from "../rig/persistence";
import { normalizePersistedStandardInputs } from "../rig/legacyMigration";
import type { AutoInputState } from "../types/autoInputs";
import {
  FEATURE_FLAG_DEFAULTS,
  type FeatureFlagState,
} from "./useFeatureLabels";

interface UseRigPersistenceOptions {
  faceId: string | null;
  rigAutosaveEnabled: boolean;
  animatableComponents: AnimComponent[];
  autoInputs: Map<string, AutoInputState>;
  customInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  inputValues: StandardInputValues;
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  disabledStandardInputIds: string[];
  hiddenDriverIds: Set<string>;
  featureLabelOverrides: Record<string, string>;
  featureFlags: FeatureFlagState;
  standardInputSchema: { id: string; version: string } | null;
  graphInsights: PersistedGraphInsight | null;
  setAutoInputs: Dispatch<SetStateAction<Map<string, AutoInputState>>>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  setBindings: Dispatch<SetStateAction<BindingMap>>;
  setInputBindings: Dispatch<SetStateAction<InputBindingMap>>;
  setSelectedStandardInputRoots: Dispatch<SetStateAction<string[]>>;
  setSelectedStandardInputSubgroups: Dispatch<SetStateAction<string[]>>;
  setDisabledStandardInputIds: Dispatch<SetStateAction<string[]>>;
  setHiddenDriverIds: Dispatch<SetStateAction<Set<string>>>;
  setFeatureLabelOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setStandardInputSchema: Dispatch<
    SetStateAction<{ id: string; version: string } | null>
  >;
  setFeatureFlags: Dispatch<SetStateAction<FeatureFlagState>>;
  setGraphInsights: Dispatch<SetStateAction<PersistedGraphInsight | null>>;
  updateInputValues: (
    updater: (prev: StandardInputValues) => StandardInputValues,
  ) => void;
  pendingInputBindingDefinitionsRef: MutableRefObject<Record<
    string,
    RigBindingDefinition
  > | null>;
  persistedAutoInputsRef: MutableRefObject<
    Map<string, PersistedAutoStandardInput>
  >;
  skipPersistRef: MutableRefObject<boolean>;
  lastLoadedFaceIdRef: MutableRefObject<string | null>;
  rebuildAutoInputs: () => void;
  alertDialog: (message: string) => void;
}

export function useRigPersistence({
  faceId,
  rigAutosaveEnabled,
  animatableComponents,
  autoInputs,
  customInputs,
  bindings,
  inputBindings,
  inputValues,
  selectedStandardInputRoots,
  selectedStandardInputSubgroups,
  disabledStandardInputIds,
  hiddenDriverIds,
  featureLabelOverrides,
  featureFlags,
  standardInputSchema,
  graphInsights,
  setAutoInputs,
  setCustomInputs,
  setBindings,
  setInputBindings,
  setSelectedStandardInputRoots,
  setSelectedStandardInputSubgroups,
  setDisabledStandardInputIds,
  setHiddenDriverIds,
  setFeatureLabelOverrides,
  setStandardInputSchema,
  setFeatureFlags,
  setGraphInsights,
  updateInputValues,
  pendingInputBindingDefinitionsRef,
  persistedAutoInputsRef,
  skipPersistRef,
  lastLoadedFaceIdRef,
  rebuildAutoInputs,
  alertDialog,
  pendingFaceRenameRef,
}: UseRigPersistenceOptions & {
  pendingFaceRenameRef?: MutableRefObject<string | null>;
}) {
  const rigStateSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPersistenceErrorRef = useRef<string | null>(null);
  const localFaceRenameRef = useRef<string | null>(null);
  const renameRef = pendingFaceRenameRef ?? localFaceRenameRef;

  const reportPersistenceError = useCallback(
    (error: RigPersistenceError, prefix: string) => {
      const message = `${prefix}\n${formatRigPersistenceError(error)}`;
      if (lastPersistenceErrorRef.current === message) {
        return;
      }
      lastPersistenceErrorRef.current = message;
      alertDialog(message);
    },
    [alertDialog],
  );

  const clearPersistenceError = useCallback(() => {
    lastPersistenceErrorRef.current = null;
  }, []);

  const persistRigState = useCallback(() => {
    if (
      !faceId ||
      !rigAutosaveEnabled ||
      skipPersistRef.current ||
      animatableComponents.length === 0
    ) {
      return;
    }
    const persistedAuto: PersistedAutoStandardInput[] = [];
    autoInputs.forEach((entry) => {
      const sourceNormalized = normalizeStandardRigInputPath(entry.sourcePath);
      const sourceGroup = deriveGroupFromNormalizedPath(sourceNormalized);
      persistedAuto.push({
        id: entry.input.id,
        path: entry.input.path,
        sourceId: entry.sourceId,
        sourcePath: entry.sourcePath,
        group:
          entry.input.group !== sourceGroup ? entry.input.group : undefined,
        label:
          entry.input.label !== entry.generatedLabel
            ? entry.input.label
            : undefined,
        defaultValue:
          entry.input.defaultValue !== entry.generatedDefaultValue
            ? entry.input.defaultValue
            : undefined,
        range:
          entry.input.range.min !== entry.generatedRange.min ||
          entry.input.range.max !== entry.generatedRange.max
            ? {
                min: entry.input.range.min,
                max: entry.input.range.max,
              }
            : undefined,
      });
    });

    const bindingDefinitions: Record<string, RigBindingDefinition> = {};
    Object.entries(inputBindings).forEach(([id, binding]) => {
      const hasParents =
        (binding.inputId && binding.inputId !== SELF_BINDING_ID) ||
        binding.slots.some(
          (slot) => slot.inputId && slot.inputId !== SELF_BINDING_ID,
        );
      if (!hasParents) {
        return;
      }
      bindingDefinitions[id] = bindingToDefinition(binding);
    });

    const saveResult = saveRigState({
      faceId,
      bindings,
      inputValues,
      standardInputs: persistedAuto,
      customStandardInputs: customInputs,
      selectedStandardInputRoots,
      selectedStandardInputSubgroups:
        selectedStandardInputSubgroups.length > 0
          ? selectedStandardInputSubgroups
          : undefined,
      disabledStandardInputIds:
        disabledStandardInputIds.length > 0
          ? disabledStandardInputIds
          : undefined,
      hiddenDriverIds:
        hiddenDriverIds.size > 0 ? Array.from(hiddenDriverIds) : undefined,
      featureLabels:
        Object.keys(featureLabelOverrides).length > 0
          ? featureLabelOverrides
          : undefined,
      standardInputSchema: standardInputSchema ?? undefined,
      derivedStandardInputs:
        Object.keys(bindingDefinitions).length > 0
          ? bindingDefinitions
          : undefined,
      inputBindingDefinitions:
        Object.keys(bindingDefinitions).length > 0
          ? bindingDefinitions
          : undefined,
      featureFlags,
      graphInsights: graphInsights ?? undefined,
      schemaVersion: RIG_STATE_SCHEMA_VERSION,
    });
    if (!saveResult.ok) {
      reportPersistenceError(saveResult.error, "Could not save rig state.");
      return;
    }
    clearPersistenceError();
  }, [
    animatableComponents,
    autoInputs,
    bindings,
    customInputs,
    disabledStandardInputIds,
    hiddenDriverIds,
    faceId,
    rigAutosaveEnabled,
    featureLabelOverrides,
    standardInputSchema,
    featureFlags,
    graphInsights,
    inputBindings,
    inputValues,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    skipPersistRef,
    clearPersistenceError,
    reportPersistenceError,
  ]);

  const handleClearCachedState = useCallback(() => {
    if (!faceId) {
      return;
    }
    const deleteResult = deleteRigState(faceId);
    if (!deleteResult.ok) {
      reportPersistenceError(
        deleteResult.error,
        "Could not clear saved rig state.",
      );
    } else {
      clearPersistenceError();
    }
    persistedAutoInputsRef.current = new Map();
    pendingInputBindingDefinitionsRef.current = null;
    skipPersistRef.current = true;
    setCustomInputs([]);
    setAutoInputs(new Map());
    setInputBindings({});
    setBindings(createDefaultBindings(animatableComponents));
    updateInputValues(() => ({}));
    setSelectedStandardInputRoots([]);
    setSelectedStandardInputSubgroups([]);
    setFeatureLabelOverrides({});
    setStandardInputSchema(null);
    setTimeout(() => {
      skipPersistRef.current = false;
      rebuildAutoInputs();
    }, 0);
  }, [
    animatableComponents,
    faceId,
    pendingInputBindingDefinitionsRef,
    persistedAutoInputsRef,
    rebuildAutoInputs,
    setAutoInputs,
    setBindings,
    setCustomInputs,
    setFeatureLabelOverrides,
    setStandardInputSchema,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    skipPersistRef,
    clearPersistenceError,
    reportPersistenceError,
    updateInputValues,
  ]);

  useEffect(() => {
    if (!faceId) {
      return;
    }
    const isRename = renameRef.current === faceId;
    if (lastLoadedFaceIdRef.current === faceId && !isRename) {
      return;
    }

    if (isRename) {
      // This is a rename of the active face: preserve the current in-memory
      // state instead of reloading (which would wipe shapes/poses because no
      // persisted state exists yet for the new id). Save under the new face id
      // and mark it as loaded so downstream effects continue as normal.
      renameRef.current = null;
      skipPersistRef.current = false;
      persistRigState();
      lastLoadedFaceIdRef.current = faceId;
      return;
    }

    const persistedResult = loadRigState(faceId);
    const persisted = persistedResult.ok ? persistedResult.value : null;
    if (!persistedResult.ok) {
      reportPersistenceError(
        persistedResult.error,
        "Could not load saved rig state. Resetting to defaults.",
      );
    } else {
      clearPersistenceError();
    }
    skipPersistRef.current = true;
    if (persisted) {
      const { autoEntries, legacyCustomInputs, idMismatches } =
        normalizePersistedStandardInputs(persisted.standardInputs);
      persistedAutoInputsRef.current = autoEntries;
      const persistedCustom =
        persisted.customStandardInputs?.map((input) =>
          createStandardRigInput(input),
        ) ?? [];
      persisted.customStandardInputs?.forEach((input, index) => {
        if (input.id && input.id !== persistedCustom[index]?.id) {
          const resolved = persistedCustom[index];
          if (resolved) {
            idMismatches.push(
              `${input.id} → ${resolved.id} (${resolved.path})`,
            );
          }
        }
      });
      setCustomInputs([...persistedCustom, ...legacyCustomInputs]);
      setAutoInputs(new Map());
      updateInputValues(() => persisted.inputValues ?? {});
      setDisabledStandardInputIds(
        Array.isArray(persisted.disabledStandardInputIds)
          ? persisted.disabledStandardInputIds
          : [],
      );
      setHiddenDriverIds(new Set(persisted.hiddenDriverIds ?? []));

      const persistedBindings: BindingMap = {};
      Object.entries(persisted.bindings).forEach(([key, binding]) => {
        if (!binding) {
          return;
        }
        persistedBindings[key] = binding;
      });
      setBindings(reconcileBindings(persistedBindings, animatableComponents));
      setSelectedStandardInputRoots(
        Array.isArray(persisted.selectedStandardInputRoots)
          ? persisted.selectedStandardInputRoots
          : [],
      );
      setSelectedStandardInputSubgroups(
        Array.isArray(persisted.selectedStandardInputSubgroups)
          ? persisted.selectedStandardInputSubgroups
          : [],
      );
      setFeatureLabelOverrides(persisted.featureLabels ?? {});
      setStandardInputSchema(persisted.standardInputSchema ?? null);
      setFeatureFlags({
        ...FEATURE_FLAG_DEFAULTS,
        ...(persisted.featureFlags ?? {}),
      });
      setGraphInsights(persisted.graphInsights ?? null);
      pendingInputBindingDefinitionsRef.current =
        persisted.inputBindingDefinitions ??
        persisted.derivedStandardInputs ??
        null;
      setInputBindings({});
      if (idMismatches.length > 0) {
        alertDialog(
          `Some standard input identifiers were normalised to keep them consistent:\n${idMismatches.join("\n")}`,
        );
      }
    } else {
      persistedAutoInputsRef.current = new Map();
      setCustomInputs([]);
      setAutoInputs(new Map());
      updateInputValues(() => ({}));
      setDisabledStandardInputIds([]);
      setBindings(createDefaultBindings(animatableComponents));
      setSelectedStandardInputRoots([]);
      setSelectedStandardInputSubgroups([]);
      setFeatureLabelOverrides({});
      setStandardInputSchema(null);
      setFeatureFlags({ ...FEATURE_FLAG_DEFAULTS });
      setGraphInsights(null);
      pendingInputBindingDefinitionsRef.current = null;
      setInputBindings({});
      setHiddenDriverIds(new Set());
    }
    setTimeout(() => {
      skipPersistRef.current = false;
      rebuildAutoInputs();
    }, 0);
    lastLoadedFaceIdRef.current = faceId;
  }, [
    alertDialog,
    animatableComponents,
    faceId,
    lastLoadedFaceIdRef,
    pendingInputBindingDefinitionsRef,
    persistedAutoInputsRef,
    setAutoInputs,
    setBindings,
    setCustomInputs,
    setDisabledStandardInputIds,
    setFeatureFlags,
    setFeatureLabelOverrides,
    setStandardInputSchema,
    setGraphInsights,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    skipPersistRef,
    clearPersistenceError,
    reportPersistenceError,
    rebuildAutoInputs,
    updateInputValues,
  ]);

  useEffect(() => {
    if (
      !faceId ||
      !rigAutosaveEnabled ||
      skipPersistRef.current ||
      animatableComponents.length === 0
    ) {
      return;
    }
    if (rigStateSaveTimeoutRef.current) {
      clearTimeout(rigStateSaveTimeoutRef.current);
    }
    rigStateSaveTimeoutRef.current = setTimeout(() => {
      rigStateSaveTimeoutRef.current = null;
      persistRigState();
    }, 1000);

    return () => {
      if (rigStateSaveTimeoutRef.current) {
        clearTimeout(rigStateSaveTimeoutRef.current);
        rigStateSaveTimeoutRef.current = null;
      }
    };
  }, [
    animatableComponents,
    autoInputs,
    bindings,
    customInputs,
    inputBindings,
    faceId,
    featureLabelOverrides,
    standardInputSchema,
    inputValues,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    disabledStandardInputIds,
    hiddenDriverIds,
    featureFlags,
    graphInsights,
    rigAutosaveEnabled,
    persistRigState,
    skipPersistRef,
  ]);

  useEffect(() => {
    return () => {
      if (rigStateSaveTimeoutRef.current) {
        clearTimeout(rigStateSaveTimeoutRef.current);
        rigStateSaveTimeoutRef.current = null;
        if (rigAutosaveEnabled) {
          persistRigState();
        }
      }
    };
  }, [persistRigState, rigAutosaveEnabled]);

  return { handleClearCachedState };
}
