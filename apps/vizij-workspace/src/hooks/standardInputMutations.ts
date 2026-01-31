import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StandardInputValues } from "@vizij/node-graph-authoring";
import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";
import type { PersistedAutoStandardInput } from "../rig/persistence";
import { alertDialog } from "../utils/dialogs";
import type { AutoInputState } from "../types/autoInputs";

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
  const normalizedPath = normalizeStandardRigInputPath(path);
  setCustomInputs((previous) => {
    const autoIds = new Set(
      Array.from(autoInputsRef.current.values()).map((entry) => entry.input.id),
    );
    const existingIds = new Set(previous.map((input) => input.id));
    autoIds.forEach((id) => existingIds.add(id));
    let candidate = createStandardRigInputFromPath(normalizedPath);
    if (existingIds.has(candidate.id)) {
      const baseSegments = candidate.path
        .split("/")
        .filter((segment) => segment.length > 0);
      const targetIndex = baseSegments.length > 0 ? baseSegments.length - 1 : 0;
      const baseLeaf =
        baseSegments[targetIndex] ??
        (candidate.id ? candidate.id.replace(/^_+/, "") : "input");
      let suffix = 2;
      let resolved = candidate;
      while (existingIds.has(resolved.id)) {
        const nextSegments =
          baseSegments.length > 0 ? baseSegments.slice() : [baseLeaf];
        nextSegments[targetIndex] = `${baseLeaf}_${suffix}`;
        const nextPath = `/${nextSegments.join("/")}`;
        resolved = createStandardRigInputFromPath(nextPath);
        suffix += 1;
      }
      candidate = resolved;
    }
    createdInput = candidate;
    return [...previous, candidate];
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
}: UpdateStandardInputParams): void {
  const autoEntry = Array.from(autoInputsRef.current.entries()).find(
    ([, entry]) => entry.input.id === inputId,
  );
  if (autoEntry) {
    const [entryKey, entryState] = autoEntry;
    const wantsPath = updates.path !== undefined;
    const wantsLabel = updates.label !== undefined;
    const wantsSourceId = updates.sourceId !== undefined;
    const wantsDefaultValue =
      typeof updates.defaultValue === "number" &&
      Number.isFinite(updates.defaultValue);
    const wantsRangeUpdate =
      updates.range !== undefined &&
      ((typeof updates.range.min === "number" &&
        Number.isFinite(updates.range.min)) ||
        (typeof updates.range.max === "number" &&
          Number.isFinite(updates.range.max)));
    if (
      !wantsPath &&
      !wantsLabel &&
      !wantsSourceId &&
      !wantsDefaultValue &&
      !wantsRangeUpdate
    ) {
      return;
    }

    let normalizedPath = entryState.input.path;
    if (wantsPath) {
      const trimmedPath = updates.path?.trim() ?? "";
      if (!trimmedPath) {
        alertDialog("Path cannot be empty.");
        return;
      }
      normalizedPath = normalizeStandardRigInputPath(trimmedPath);
      const duplicateAuto = Array.from(autoInputsRef.current.entries()).some(
        ([, candidate]) =>
          candidate.input.id !== inputId &&
          normalizeStandardRigInputPath(candidate.input.path) ===
            normalizedPath,
      );
      if (duplicateAuto) {
        alertDialog(
          `Another standard input already uses the path "${normalizedPath}".`,
        );
        return;
      }
      const duplicateCustom = customInputsRef.current.some(
        (input) =>
          input.id !== inputId &&
          normalizeStandardRigInputPath(input.path) === normalizedPath,
      );
      if (duplicateCustom) {
        alertDialog(
          `Another standard input already uses the path "${normalizedPath}".`,
        );
        return;
      }
    }

    const trimmedLabel =
      wantsLabel && updates.label !== undefined
        ? updates.label.trim()
        : undefined;
    const nextLabel =
      trimmedLabel !== undefined
        ? trimmedLabel.length > 0
          ? trimmedLabel
          : deriveLabelFromNormalizedPath(normalizedPath)
        : entryState.input.label;
    const nextGroup = wantsPath
      ? deriveGroupFromNormalizedPath(normalizedPath)
      : entryState.input.group;
    const nextRoot = wantsPath
      ? deriveGroupFromNormalizedPath(normalizedPath)
      : (entryState.metadata.root ?? entryState.input.group ?? groupFallback);
    const requestedRange = updates.range;
    let nextRangeMin = entryState.input.range.min;
    let nextRangeMax = entryState.input.range.max;
    if (requestedRange) {
      if (
        typeof requestedRange.min === "number" &&
        Number.isFinite(requestedRange.min)
      ) {
        nextRangeMin = requestedRange.min;
      }
      if (
        typeof requestedRange.max === "number" &&
        Number.isFinite(requestedRange.max)
      ) {
        nextRangeMax = requestedRange.max;
      }
      if (nextRangeMin > nextRangeMax) {
        const low = Math.min(nextRangeMin, nextRangeMax);
        const high = Math.max(nextRangeMin, nextRangeMax);
        nextRangeMin = low;
        nextRangeMax = high;
      }
    }
    const defaultSourceValue = wantsDefaultValue
      ? (updates.defaultValue as number)
      : entryState.input.defaultValue;
    const normalizedDefaultValue = clampNumberToRange(
      defaultSourceValue,
      nextRangeMin,
      nextRangeMax,
    );
    const nextSourceId =
      wantsSourceId && updates.sourceId === null
        ? undefined
        : wantsSourceId && updates.sourceId !== undefined
          ? (() => {
              const trimmed = updates.sourceId?.trim() ?? "";
              return trimmed.length > 0 ? trimmed : undefined;
            })()
          : entryState.input.sourceId;

    if (
      normalizedPath === entryState.input.path &&
      nextLabel === entryState.input.label &&
      nextGroup === entryState.input.group &&
      nextSourceId === entryState.input.sourceId &&
      normalizedDefaultValue === entryState.input.defaultValue &&
      nextRangeMin === entryState.input.range.min &&
      nextRangeMax === entryState.input.range.max
    ) {
      return;
    }

    setAutoInputs((previous) => {
      const current = previous.get(entryKey);
      if (!current) {
        return previous;
      }
      const updatedInput = createStandardRigInput({
        id: current.input.id,
        path: normalizedPath,
        label: nextLabel,
        group: nextGroup,
        defaultValue: normalizedDefaultValue,
        range: {
          min: nextRangeMin,
          max: nextRangeMax,
        },
        sourceId: nextSourceId,
        parentBinding: current.input.parentBinding ?? undefined,
        derivedChildren: current.input.derivedChildren ?? undefined,
      });
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
        id: entryState.input.id,
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
    return;
  }

  setCustomInputs((previous) => {
    const index = previous.findIndex((input) => input.id === inputId);
    if (index === -1) {
      return previous;
    }
    const current = previous[index];
    if (updates.path !== undefined && !updates.path.trim()) {
      alertDialog("Path cannot be empty.");
      return previous;
    }
    const requestedPath =
      updates.path !== undefined ? updates.path : current.path;
    const normalizedPath = normalizeStandardRigInputPath(requestedPath);
    if (
      updates.path !== undefined &&
      (previous.some(
        (input, idx) => idx !== index && input.path === normalizedPath,
      ) ||
        Array.from(autoInputsRef.current.values()).some(
          (entry) =>
            entry.input.path === normalizedPath && entry.input.id !== inputId,
        ))
    ) {
      alertDialog(
        `Another standard input already uses the path "${normalizedPath}".`,
      );
      return previous;
    }
    const trimmedLabel =
      updates.label !== undefined ? updates.label.trim() : undefined;
    const nextLabel =
      trimmedLabel && trimmedLabel.length > 0
        ? trimmedLabel
        : updates.label !== undefined
          ? deriveLabelFromNormalizedPath(normalizedPath)
          : current.label;
    const requestedRange = updates.range;
    let nextRangeMin = current.range.min;
    let nextRangeMax = current.range.max;
    if (requestedRange) {
      if (
        typeof requestedRange.min === "number" &&
        Number.isFinite(requestedRange.min)
      ) {
        nextRangeMin = requestedRange.min;
      }
      if (
        typeof requestedRange.max === "number" &&
        Number.isFinite(requestedRange.max)
      ) {
        nextRangeMax = requestedRange.max;
      }
      if (nextRangeMin > nextRangeMax) {
        const low = Math.min(nextRangeMin, nextRangeMax);
        const high = Math.max(nextRangeMin, nextRangeMax);
        nextRangeMin = low;
        nextRangeMax = high;
      }
    }
    const wantsDefaultValue =
      typeof updates.defaultValue === "number" &&
      Number.isFinite(updates.defaultValue);
    const defaultSourceValue = wantsDefaultValue
      ? (updates.defaultValue as number)
      : current.defaultValue;
    const normalizedDefaultValue = clampNumberToRange(
      defaultSourceValue,
      nextRangeMin,
      nextRangeMax,
    );
    if (
      normalizedPath === current.path &&
      nextLabel === current.label &&
      normalizedDefaultValue === current.defaultValue &&
      nextRangeMin === current.range.min &&
      nextRangeMax === current.range.max
    ) {
      return previous;
    }
    const nextGroup = deriveGroupFromNormalizedPath(normalizedPath);
    const updated = createStandardRigInput({
      id: current.id,
      path: normalizedPath,
      label: nextLabel,
      group: nextGroup,
      defaultValue: normalizedDefaultValue,
      range: {
        min: nextRangeMin,
        max: nextRangeMax,
      },
      sourceId:
        updates.sourceId === undefined
          ? current.sourceId
          : updates.sourceId === null
            ? undefined
            : (() => {
                const trimmed = updates.sourceId.trim();
                return trimmed.length > 0 ? trimmed : undefined;
              })(),
    });
    const next = previous.slice();
    next[index] = updated;
    return next;
  });
}

function clampNumberToRange(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.min(Math.max(value, low), high);
}
