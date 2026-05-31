import {
  createStandardRigInput,
  createStandardRigInputFromPath,
  deriveGroupFromNormalizedPath,
  deriveLabelFromNormalizedPath,
  normalizeStandardRigInputPath,
  type StandardRigInput,
} from "@vizij/utils";

export interface StandardInputUpdatePatch {
  path?: string;
  label?: string;
  sourceId?: string | null;
  defaultValue?: number;
  range?: { min?: number; max?: number };
}

export interface StandardInputCreationPlanOptions {
  path: string;
  existingInputs: Iterable<StandardRigInput>;
}

export interface StandardInputUpdatePlanOptions {
  currentInput: StandardRigInput;
  updates: StandardInputUpdatePatch;
  existingInputs: Iterable<StandardRigInput>;
}

export interface StandardInputMutationPlan {
  previousId: string;
  nextId: string;
  updatedInput: StandardRigInput;
  pathChanged: boolean;
}

export type StandardInputMutationIssueCode = "empty-path" | "duplicate-path";

export interface StandardInputMutationIssue {
  code: StandardInputMutationIssueCode;
  message: string;
  normalizedPath?: string;
}

export type StandardInputUpdatePlanResult =
  | { status: "updated"; plan: StandardInputMutationPlan }
  | { status: "unchanged" }
  | { status: "error"; issue: StandardInputMutationIssue };

export function resolveUniqueStandardInputId(
  baseId: string,
  existingIds: Iterable<string>,
): string {
  const usedIds = new Set(existingIds);
  const seed = baseId.trim().length > 0 ? baseId.trim() : "input";
  if (!usedIds.has(seed)) {
    return seed;
  }
  let suffix = 2;
  let candidate = `${seed}_${suffix}`;
  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${seed}_${suffix}`;
  }
  return candidate;
}

export function resolveUpdatedStandardInputId(params: {
  currentId: string;
  normalizedPath: string;
  existingIds: Iterable<string>;
}): string {
  const candidateId = createStandardRigInputFromPath(params.normalizedPath).id;
  if (candidateId === params.currentId) {
    return params.currentId;
  }
  return resolveUniqueStandardInputId(candidateId, params.existingIds);
}

export function planStandardInputCreation({
  path,
  existingInputs,
}: StandardInputCreationPlanOptions): StandardInputMutationPlan {
  const normalizedPath = normalizeStandardRigInputPath(path);
  const existingIds = new Set<string>();
  for (const input of existingInputs) {
    existingIds.add(input.id);
  }

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

  return {
    previousId: "",
    nextId: candidate.id,
    updatedInput: candidate,
    pathChanged: true,
  };
}

export function planStandardInputUpdate({
  currentInput,
  updates,
  existingInputs,
}: StandardInputUpdatePlanOptions): StandardInputUpdatePlanResult {
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
    return { status: "unchanged" };
  }

  let normalizedPath = currentInput.path;
  if (wantsPath) {
    const trimmedPath = updates.path?.trim() ?? "";
    if (!trimmedPath) {
      return {
        status: "error",
        issue: { code: "empty-path", message: "Path cannot be empty." },
      };
    }
    normalizedPath = normalizeStandardRigInputPath(trimmedPath);
    for (const input of existingInputs) {
      if (
        input.id !== currentInput.id &&
        normalizeStandardRigInputPath(input.path) === normalizedPath
      ) {
        return {
          status: "error",
          issue: {
            code: "duplicate-path",
            message: `Another standard input already uses the path "${normalizedPath}".`,
            normalizedPath,
          },
        };
      }
    }
  }

  const existingIds = new Set<string>();
  for (const input of existingInputs) {
    if (input.id !== currentInput.id) {
      existingIds.add(input.id);
    }
  }

  const pathChanged = wantsPath && normalizedPath !== currentInput.path;
  const nextInputId = pathChanged
    ? resolveUpdatedStandardInputId({
        currentId: currentInput.id,
        normalizedPath,
        existingIds,
      })
    : currentInput.id;

  const trimmedLabel =
    wantsLabel && updates.label !== undefined
      ? updates.label.trim()
      : undefined;
  const nextLabel =
    trimmedLabel !== undefined
      ? trimmedLabel.length > 0
        ? trimmedLabel
        : deriveLabelFromNormalizedPath(normalizedPath)
      : currentInput.label;
  const nextGroup = pathChanged
    ? deriveGroupFromNormalizedPath(normalizedPath)
    : currentInput.group;
  const requestedRange = updates.range;
  let nextRangeMin = currentInput.range.min;
  let nextRangeMax = currentInput.range.max;
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
    : currentInput.defaultValue;
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
        : currentInput.sourceId;

  if (
    normalizedPath === currentInput.path &&
    nextInputId === currentInput.id &&
    nextLabel === currentInput.label &&
    nextGroup === currentInput.group &&
    nextSourceId === currentInput.sourceId &&
    normalizedDefaultValue === currentInput.defaultValue &&
    nextRangeMin === currentInput.range.min &&
    nextRangeMax === currentInput.range.max
  ) {
    return { status: "unchanged" };
  }

  const updatedInput = createStandardRigInput({
    id: nextInputId,
    path: normalizedPath,
    label: nextLabel,
    group: nextGroup,
    defaultValue: normalizedDefaultValue,
    range: {
      min: nextRangeMin,
      max: nextRangeMax,
    },
    sourceId: nextSourceId,
    parentBinding: currentInput.parentBinding ?? undefined,
    derivedChildren: currentInput.derivedChildren ?? undefined,
  });

  return {
    status: "updated",
    plan: {
      previousId: currentInput.id,
      nextId: nextInputId,
      updatedInput,
      pathChanged,
    },
  };
}

function clampNumberToRange(value: number, min: number, max: number): number {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!Number.isFinite(value)) {
    return low;
  }
  return Math.min(Math.max(value, low), high);
}
