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
  loadRigState,
  saveRigState,
  type PersistedAutoStandardInput,
  type PersistedGraphInsight,
} from "../rig/persistence";
import { normalizePersistedStandardInputs } from "../rig/legacyMigration";
import type { AutoInputState } from "../types/autoInputs";
import type { VizijPipelineMetadataV1 } from "../utils/graphImport";
import {
  FEATURE_FLAG_DEFAULTS,
  type FeatureFlagState,
} from "./useFeatureLabels";

// The compatibility generation of a saved rig state. A restore is refused
// across generations (see the load gate below), so bump this whenever the
// persisted shape OR the meaning of what it stores changes — including
// bundle-side migrations that re-encode the values a save would re-apply
// (v5: the assets' embedded values moved to arora serde).
const RIG_STATE_SCHEMA_VERSION = 5;

interface UseRigPersistenceOptions {
  faceId: string | null;
  animatableComponents: AnimComponent[];
  autoInputs: Map<string, AutoInputState>;
  customInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  inputValues: StandardInputValues;
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  disabledStandardInputIds: string[];
  lockedInspectorTargetIds: Set<string>;
  hiddenDriverIds: Set<string>;
  featureLabelOverrides: Record<string, string>;
  featureFlags: FeatureFlagState;
  standardInputSchema: { id: string; version: string } | null;
  graphInsights: PersistedGraphInsight | null;
  pipelineMetadataV1: VizijPipelineMetadataV1 | null;
  setAutoInputs: Dispatch<SetStateAction<Map<string, AutoInputState>>>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  setBindings: Dispatch<SetStateAction<BindingMap>>;
  setInputBindings: Dispatch<SetStateAction<InputBindingMap>>;
  setSelectedStandardInputRoots: Dispatch<SetStateAction<string[]>>;
  setSelectedStandardInputSubgroups: Dispatch<SetStateAction<string[]>>;
  setDisabledStandardInputIds: Dispatch<SetStateAction<string[]>>;
  setLockedInspectorTargetIds: Dispatch<SetStateAction<Set<string>>>;
  setHiddenDriverIds: Dispatch<SetStateAction<Set<string>>>;
  setFeatureLabelOverrides: Dispatch<SetStateAction<Record<string, string>>>;
  setStandardInputSchema: Dispatch<
    SetStateAction<{ id: string; version: string } | null>
  >;
  setFeatureFlags: Dispatch<SetStateAction<FeatureFlagState>>;
  setGraphInsights: Dispatch<SetStateAction<PersistedGraphInsight | null>>;
  setPipelineMetadataV1: Dispatch<
    SetStateAction<VizijPipelineMetadataV1 | null>
  >;
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
  pipelineMetadataV1,
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
  setStandardInputSchema: _setStandardInputSchema,
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
}: UseRigPersistenceOptions & {
  pendingFaceRenameRef?: MutableRefObject<string | null>;
}) {
  const rigStateSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const localFaceRenameRef = useRef<string | null>(null);
  const renameRef = pendingFaceRenameRef ?? localFaceRenameRef;

  const persistRigState = useCallback(() => {
    if (
      !faceId ||
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

    saveRigState({
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
      lockedInspectorTargetIds:
        lockedInspectorTargetIds.size > 0
          ? Array.from(lockedInspectorTargetIds)
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
      pipelineMetadataV1: pipelineMetadataV1 ?? undefined,
      schemaVersion: RIG_STATE_SCHEMA_VERSION,
    });
  }, [
    animatableComponents,
    autoInputs,
    bindings,
    customInputs,
    disabledStandardInputIds,
    lockedInspectorTargetIds,
    hiddenDriverIds,
    faceId,
    featureLabelOverrides,
    standardInputSchema,
    featureFlags,
    graphInsights,
    pipelineMetadataV1,
    inputBindings,
    inputValues,
    selectedStandardInputRoots,
    selectedStandardInputSubgroups,
    skipPersistRef,
  ]);

  const handleClearCachedState = useCallback(() => {
    if (!faceId) {
      return;
    }
    deleteRigState(faceId);
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
    setLockedInspectorTargetIds(new Set());
    setFeatureLabelOverrides({});
    setPipelineMetadataV1(null);
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
    setInputBindings,
    setPipelineMetadataV1,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    setLockedInspectorTargetIds,
    skipPersistRef,
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

    let persisted = loadRigState(faceId);
    if (persisted && persisted.schemaVersion !== RIG_STATE_SCHEMA_VERSION) {
      // A save from another generation re-applies bindings and value
      // encodings the current bundle no longer speaks, corrupting the face
      // on every load. Start from the asset and forget the stale save.
      // eslint-disable-next-line no-console -- the drop must be visible
      console.warn(
        `[vizij-authoring] discarding the saved authoring state for ${faceId}: ` +
          `schema v${persisted.schemaVersion ?? 0} (current v${RIG_STATE_SCHEMA_VERSION})`,
      );
      deleteRigState(faceId);
      persisted = null;
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
      setLockedInspectorTargetIds(
        new Set(persisted.lockedInspectorTargetIds ?? []),
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
      setFeatureFlags({
        ...FEATURE_FLAG_DEFAULTS,
        ...(persisted.featureFlags ?? {}),
      });
      setGraphInsights(persisted.graphInsights ?? null);
      setPipelineMetadataV1(persisted.pipelineMetadataV1 ?? null);
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
      setLockedInspectorTargetIds(new Set());
      setBindings(createDefaultBindings(animatableComponents));
      setSelectedStandardInputRoots([]);
      setSelectedStandardInputSubgroups([]);
      setFeatureLabelOverrides({});
      setFeatureFlags({ ...FEATURE_FLAG_DEFAULTS });
      setGraphInsights(null);
      setPipelineMetadataV1(null);
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
    setGraphInsights,
    setLockedInspectorTargetIds,
    setPipelineMetadataV1,
    setInputBindings,
    setSelectedStandardInputRoots,
    setSelectedStandardInputSubgroups,
    skipPersistRef,
    rebuildAutoInputs,
    updateInputValues,
  ]);

  useEffect(() => {
    if (
      !faceId ||
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
    lockedInspectorTargetIds,
    hiddenDriverIds,
    featureFlags,
    graphInsights,
    pipelineMetadataV1,
    persistRigState,
    skipPersistRef,
  ]);

  useEffect(() => {
    return () => {
      if (rigStateSaveTimeoutRef.current) {
        clearTimeout(rigStateSaveTimeoutRef.current);
        rigStateSaveTimeoutRef.current = null;
        persistRigState();
      }
    };
  }, [persistRigState]);

  return { handleClearCachedState };
}
