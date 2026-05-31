import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StandardInputValues } from "@vizij/node-graph-authoring";
import {
  deriveGroupFromNormalizedPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import {
  planStandardInputCreation,
  planStandardInputUpdate,
} from "@vizij/studio-support";
import type { PersistedAutoStandardInput } from "../rig/persistence";
import { alertDialog } from "../utils/dialogs";
import type { AutoInputState } from "../types/autoInputs";

export { resolveUpdatedStandardInputId } from "@vizij/studio-support";

export interface CreateCustomStandardInputParams {
  path: string;
  autoInputsRef: MutableRefObject<Map<string, AutoInputState>>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  updateInputValues: (
    updater: (prev: StandardInputValues) => StandardInputValues,
  ) => void;
}

export function createCustomStandardInputEntry({
  path,
  autoInputsRef,
  setCustomInputs,
  updateInputValues,
}: CreateCustomStandardInputParams): StandardRigInput | null {
  let createdInput: StandardRigInput | null = null;
  setCustomInputs((previous) => {
    const plan = planStandardInputCreation({
      path,
      existingInputs: [
        ...previous,
        ...Array.from(autoInputsRef.current.values(), (entry) => entry.input),
      ],
    });
    createdInput = plan.updatedInput;
    return [...previous, plan.updatedInput];
  });
  if (createdInput === null) {
    return null;
  }
  const created: StandardRigInput = createdInput;
  updateInputValues((previous) => ({
    ...previous,
    [created.id]: created.defaultValue,
  }));
  return created;
}

export interface UpdateStandardInputParams {
  inputId: string;
  updates: {
    path?: string;
    label?: string;
    sourceId?: string | null;
    defaultValue?: number;
    range?: { min?: number; max?: number };
  };
  autoInputsRef: MutableRefObject<Map<string, AutoInputState>>;
  customInputsRef: MutableRefObject<StandardRigInput[]>;
  setAutoInputs: Dispatch<SetStateAction<Map<string, AutoInputState>>>;
  setCustomInputs: Dispatch<SetStateAction<StandardRigInput[]>>;
  persistedAutoInputsRef: MutableRefObject<
    Map<string, PersistedAutoStandardInput>
  >;
  resolvePersistedAutoKey: (
    sourceId?: string | null,
    sourcePath?: string | null,
  ) => string | null;
  groupFallback: string;
}

export interface UpdateStandardInputEntryResult {
  previousId: string;
  nextId: string;
  updatedInput: StandardRigInput;
}

export function updateStandardInputEntry({
  inputId,
  updates,
  autoInputsRef,
  customInputsRef,
  setAutoInputs,
  setCustomInputs,
  persistedAutoInputsRef,
  resolvePersistedAutoKey,
  groupFallback,
}: UpdateStandardInputParams): UpdateStandardInputEntryResult | null {
  let remapResult: UpdateStandardInputEntryResult | null = null;
  const autoEntry = Array.from(autoInputsRef.current.entries()).find(
    ([, entry]) => entry.input.id === inputId,
  );
  if (autoEntry) {
    const [entryKey, entryState] = autoEntry;
    const updatePlan = planStandardInputUpdate({
      currentInput: entryState.input,
      updates,
      existingInputs: [
        ...Array.from(autoInputsRef.current.values(), (entry) => entry.input),
        ...customInputsRef.current,
      ],
    });
    if (updatePlan.status === "error") {
      alertDialog(updatePlan.issue.message);
      return null;
    }
    if (updatePlan.status === "unchanged") {
      return null;
    }
    const { plan } = updatePlan;
    const updatedInput = plan.updatedInput;
    const nextSourceId = updatedInput.sourceId;
    const nextGroup = updatedInput.group;
    const nextLabel = updatedInput.label;
    const normalizedDefaultValue = updatedInput.defaultValue;
    const nextRangeMin = updatedInput.range.min;
    const nextRangeMax = updatedInput.range.max;
    const normalizedPath = updatedInput.path;
    const nextInputId = updatedInput.id;
    const nextRoot = plan.pathChanged
      ? updatedInput.group
      : (entryState.metadata.root ?? entryState.input.group ?? groupFallback);

    setAutoInputs((previous) => {
      const current = previous.get(entryKey);
      if (!current) {
        return previous;
      }
      const updatedEntry: AutoInputState = {
        ...current,
        input: updatedInput,
        metadata: {
          ...current.metadata,
          root: nextRoot,
        },
        sourceId: nextSourceId ?? "",
      };
      const next = new Map(previous);
      next.delete(entryKey);
      next.set(updatedInput.path, updatedEntry);
      remapResult = {
        previousId: entryState.input.id,
        nextId: nextInputId,
        updatedInput,
      };
      return next;
    });

    const persistedOverrides = persistedAutoInputsRef.current;
    const oldKey = resolvePersistedAutoKey(
      entryState.input.sourceId,
      entryState.sourcePath,
    );
    const newKey = resolvePersistedAutoKey(nextSourceId, entryState.sourcePath);
    if (oldKey && oldKey !== newKey) {
      persistedOverrides.delete(oldKey);
    }
    if (newKey) {
      persistedOverrides.set(newKey, {
        id: nextInputId,
        path: normalizedPath,
        sourcePath: entryState.sourcePath,
        sourceId: nextSourceId,
        group:
          nextGroup !==
          deriveGroupFromNormalizedPath(
            normalizeStandardRigInputPath(entryState.sourcePath),
          )
            ? nextGroup
            : undefined,
        label: nextLabel !== entryState.generatedLabel ? nextLabel : undefined,
        defaultValue:
          normalizedDefaultValue !== entryState.generatedDefaultValue
            ? normalizedDefaultValue
            : undefined,
        range:
          nextRangeMin !== entryState.generatedRange.min ||
          nextRangeMax !== entryState.generatedRange.max
            ? {
                min: nextRangeMin,
                max: nextRangeMax,
              }
            : undefined,
      });
    }
    return remapResult;
  }

  setCustomInputs((previous) => {
    const index = previous.findIndex((input) => input.id === inputId);
    if (index === -1) {
      return previous;
    }
    const current = previous[index];
    const updatePlan = planStandardInputUpdate({
      currentInput: current,
      updates,
      existingInputs: [
        ...previous,
        ...Array.from(autoInputsRef.current.values(), (entry) => entry.input),
      ],
    });
    if (updatePlan.status === "error") {
      alertDialog(updatePlan.issue.message);
      return previous;
    }
    if (updatePlan.status === "unchanged") {
      return previous;
    }
    const { plan } = updatePlan;
    const updated = plan.updatedInput;
    const next = previous.slice();
    next[index] = updated;
    remapResult = {
      previousId: current.id,
      nextId: plan.nextId,
      updatedInput: updated,
    };
    return next;
  });
  return remapResult;
}
