import type { ManagedStandardInput } from "../../types/standardInputs";
import { isAutorigStandardInputPath } from "../../utils/rigElementInputs";

export interface AutorigLockIndex {
  inputIdByTargetId: Map<string, string>;
  disabledInputIds: Set<string>;
}

export function buildAutorigLockIndex(
  managedStandardInputs: readonly ManagedStandardInput[],
): AutorigLockIndex {
  const inputIdByTargetId = new Map<string, string>();
  const disabledInputIds = new Set<string>();

  managedStandardInputs.forEach((entry) => {
    if (!isAutorigStandardInputPath(entry.input.path)) {
      return;
    }
    if (entry.disabled) {
      disabledInputIds.add(entry.input.id);
    }
    const targetId = entry.metadata?.componentId;
    if (targetId && !inputIdByTargetId.has(targetId)) {
      inputIdByTargetId.set(targetId, entry.input.id);
    }
  });

  return {
    inputIdByTargetId,
    disabledInputIds,
  };
}

export function resolveAutorigInputIdForChannel(params: {
  targetId?: string | null;
  inputId?: string | null;
  unresolvedInputId?: string | null;
  inputIdByTargetId: ReadonlyMap<string, string>;
}): string | null {
  const { targetId, inputId, unresolvedInputId, inputIdByTargetId } = params;
  if (targetId) {
    const mapped = inputIdByTargetId.get(targetId);
    if (mapped) {
      return mapped;
    }
  }
  if (inputId) {
    return inputId;
  }
  if (unresolvedInputId) {
    return unresolvedInputId;
  }
  return null;
}
