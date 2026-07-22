import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { BindingMap, InputBindingMap } from "@vizij/node-graph-authoring";
import type { StandardRigInput } from "@vizij/utils";
import { appHistory } from "../state/history/historyStore";
import type { HistorySnapshot } from "../state/history/historyStore";
import type { AutoInputState } from "../types/autoInputs";
import type { FeatureFlagState } from "./useFeatureLabels";

export const RIG_HISTORY_SCOPE_ID = "rig";

type StandardInputSchema = { id: string; version: string } | null;

export interface UseRigHistoryScopeOptions {
  autoInputs: Map<string, AutoInputState>;
  customInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  disabledStandardInputIds: string[];
  lockedInspectorTargetIds: Set<string>;
  hiddenDriverIds: Set<string>;
  featureLabelOverrides: Record<string, string>;
  featureFlags: FeatureFlagState;
  standardInputSchema: StandardInputSchema;
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
  setFeatureFlags: Dispatch<SetStateAction<FeatureFlagState>>;
  setStandardInputSchema: Dispatch<SetStateAction<StandardInputSchema>>;
}

interface RigHistorySnapshot extends HistorySnapshot {
  autoInputs: Map<string, AutoInputState>;
  customInputs: StandardRigInput[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  selectedStandardInputRoots: string[];
  selectedStandardInputSubgroups: string[];
  disabledStandardInputIds: string[];
  lockedInspectorTargetIds: Set<string>;
  hiddenDriverIds: Set<string>;
  featureLabelOverrides: Record<string, string>;
  featureFlags: FeatureFlagState;
  standardInputSchema: StandardInputSchema;
}

/**
 * Registers the rig authoring document (bindings, standard inputs, labels,
 * locks, feature flags) as an undo/redo scope. Mirrors the field set that
 * useRigPersistence serializes, minus live input values — playback writes
 * those every frame and they are not document edits.
 *
 * Restores go through the same React setters the persistence loader uses, so
 * downstream graph recompiles and store mirrors react exactly as they do for
 * a persisted-state load.
 */
export function useRigHistoryScope(options: UseRigHistoryScopeOptions): void {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const unregister = appHistory.registerScope({
      id: RIG_HISTORY_SCOPE_ID,
      capture: (): RigHistorySnapshot => {
        const current = optionsRef.current;
        return {
          autoInputs: current.autoInputs,
          customInputs: current.customInputs,
          bindings: current.bindings,
          inputBindings: current.inputBindings,
          selectedStandardInputRoots: current.selectedStandardInputRoots,
          selectedStandardInputSubgroups:
            current.selectedStandardInputSubgroups,
          disabledStandardInputIds: current.disabledStandardInputIds,
          lockedInspectorTargetIds: current.lockedInspectorTargetIds,
          hiddenDriverIds: current.hiddenDriverIds,
          featureLabelOverrides: current.featureLabelOverrides,
          featureFlags: current.featureFlags,
          standardInputSchema: current.standardInputSchema,
        };
      },
      restore: (snapshot) => {
        const typed = snapshot as RigHistorySnapshot;
        const current = optionsRef.current;
        current.setAutoInputs(typed.autoInputs);
        current.setCustomInputs(typed.customInputs);
        current.setBindings(typed.bindings);
        current.setInputBindings(typed.inputBindings);
        current.setSelectedStandardInputRoots(typed.selectedStandardInputRoots);
        current.setSelectedStandardInputSubgroups(
          typed.selectedStandardInputSubgroups,
        );
        current.setDisabledStandardInputIds(typed.disabledStandardInputIds);
        current.setLockedInspectorTargetIds(typed.lockedInspectorTargetIds);
        current.setHiddenDriverIds(typed.hiddenDriverIds);
        current.setFeatureLabelOverrides(typed.featureLabelOverrides);
        current.setFeatureFlags(typed.featureFlags);
        current.setStandardInputSchema(typed.standardInputSchema);
      },
    });
    return unregister;
  }, []);

  useEffect(() => {
    appHistory.notifyChange();
  }, [
    options.autoInputs,
    options.customInputs,
    options.bindings,
    options.inputBindings,
    options.selectedStandardInputRoots,
    options.selectedStandardInputSubgroups,
    options.disabledStandardInputIds,
    options.lockedInspectorTargetIds,
    options.hiddenDriverIds,
    options.featureLabelOverrides,
    options.featureFlags,
    options.standardInputSchema,
  ]);
}
