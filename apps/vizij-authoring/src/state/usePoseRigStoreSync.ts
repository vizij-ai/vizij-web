import { useEffect } from "react";
import type { StandardRigInput } from "@vizij/utils";
import type { PoseRigStore } from "../poseRig/store";

interface PoseRigStoreStateSyncArgs {
  poseRigStore: PoseRigStore;
  faceId: string | null;
  rootId: string | null;
  poseAuthoringStandardInputs: StandardRigInput[];
  inputValues: Record<string, number>;
  hiddenInputIds: Set<string>;
  standardInputSchema: { id: string; version: string } | null;
}

function filterRecordByIds<T extends Record<string, number>>(
  record: T,
  allowed: Set<string>,
): T {
  const next: Record<string, number> = {};
  Object.entries(record).forEach(([key, value]) => {
    if (allowed.has(key)) {
      next[key] = value;
    }
  });
  return next as T;
}

function areStandardInputsEquivalent(
  left: StandardRigInput[],
  right: StandardRigInput[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftInput = left[index];
    const rightInput = right[index];
    if (!leftInput || !rightInput) {
      return false;
    }
    if (
      leftInput.id !== rightInput.id ||
      leftInput.path !== rightInput.path ||
      leftInput.defaultValue !== rightInput.defaultValue ||
      leftInput.range.min !== rightInput.range.min ||
      leftInput.range.max !== rightInput.range.max
    ) {
      return false;
    }
  }
  return true;
}

function areSchemasEquivalent(
  left: { id: string; version: string } | null,
  right: { id: string; version: string } | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.id === right.id && left.version === right.version;
}

export function usePoseRigStoreStateSync({
  poseRigStore,
  faceId,
  rootId,
  poseAuthoringStandardInputs,
  inputValues,
  hiddenInputIds,
  standardInputSchema,
}: PoseRigStoreStateSyncArgs) {
  useEffect(() => {
    poseRigStore.setState({ faceId });
  }, [faceId, poseRigStore]);

  useEffect(() => {
    const hiddenSet = new Set(hiddenInputIds);
    const visibleInputs = poseAuthoringStandardInputs.filter(
      (input) => !hiddenSet.has(input.id),
    );
    const filteredCurrent = filterRecordByIds(
      inputValues,
      new Set(visibleInputs.map((input) => input.id)),
    );

    poseRigStore.setState((state) => {
      const isReady = Boolean(rootId && visibleInputs.length > 0);
      const patch: {
        currentValues: Record<string, number>;
        hiddenInputIds: string[];
        isReady: boolean;
        standardInputs?: StandardRigInput[];
        standardInputSchema?: { id: string; version: string } | null;
      } = {
        currentValues: filteredCurrent,
        hiddenInputIds: Array.from(hiddenSet),
        isReady,
      };

      if (!areStandardInputsEquivalent(state.standardInputs, visibleInputs)) {
        patch.standardInputs = visibleInputs;
      }
      if (
        !areSchemasEquivalent(state.standardInputSchema, standardInputSchema)
      ) {
        patch.standardInputSchema = standardInputSchema;
      }

      return patch;
    });
  }, [
    hiddenInputIds,
    inputValues,
    poseAuthoringStandardInputs,
    poseRigStore,
    rootId,
    standardInputSchema,
  ]);
}

export function usePoseRigNeutralSync({
  poseRigStore,
  poseAuthoringStandardInputs,
}: Pick<
  PoseRigStoreStateSyncArgs,
  "poseRigStore" | "poseAuthoringStandardInputs"
>) {
  useEffect(() => {
    if (poseAuthoringStandardInputs.length === 0) {
      return;
    }

    const allowed = new Set(
      poseAuthoringStandardInputs.map((input) => input.id),
    );
    poseRigStore.setState((state) => {
      const nextNeutral = Object.keys(state.neutralInputs).length
        ? filterRecordByIds(state.neutralInputs, allowed)
        : (() => {
            const neutral: Record<string, number> = {};
            poseAuthoringStandardInputs.forEach((input) => {
              neutral[input.id] = input.defaultValue ?? 0;
            });
            return neutral;
          })();
      const nextCurrent = filterRecordByIds(state.currentValues, allowed);
      return {
        neutralInputs: nextNeutral,
        currentValues: nextCurrent,
      };
    });
  }, [poseAuthoringStandardInputs, poseRigStore]);
}
