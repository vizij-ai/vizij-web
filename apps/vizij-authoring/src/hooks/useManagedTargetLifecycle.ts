import { useEffect, useMemo, useRef } from "react";

export interface ManagedTargetOption {
  value: string;
}

interface UseManagedTargetLifecycleOptions {
  sessionKey?: string | null;
  targetOptions: readonly ManagedTargetOption[];
  selectedTargetId: string | null;
  setSelectedTargetId: (targetId: string | null) => void;
  loadSelectedTarget: (targetId: string | null) => void;
  activeRuntimeTargetId?: string | null;
  clearInvalidActiveRuntimeTarget?: () => void;
}

function resolveValidTargetId(
  targetOptions: readonly ManagedTargetOption[],
  selectedTargetId: string | null,
): string | null {
  if (
    selectedTargetId &&
    targetOptions.some((option) => option.value === selectedTargetId)
  ) {
    return selectedTargetId;
  }
  return targetOptions[0]?.value ?? null;
}

export function useManagedTargetLifecycle({
  sessionKey = null,
  targetOptions,
  selectedTargetId,
  setSelectedTargetId,
  loadSelectedTarget,
  activeRuntimeTargetId = null,
  clearInvalidActiveRuntimeTarget,
}: UseManagedTargetLifecycleOptions): string | null {
  const resolvedTargetId = useMemo(
    () => resolveValidTargetId(targetOptions, selectedTargetId),
    [selectedTargetId, targetOptions],
  );
  const lastLoadedTargetKeyRef = useRef<string | null | undefined>(undefined);
  const resolvedLoadKey = useMemo(
    () =>
      `${sessionKey ?? "__sessionless__"}::${resolvedTargetId ?? "__none__"}`,
    [resolvedTargetId, sessionKey],
  );

  useEffect(() => {
    if (selectedTargetId === resolvedTargetId) {
      return;
    }
    setSelectedTargetId(resolvedTargetId);
  }, [resolvedTargetId, selectedTargetId, setSelectedTargetId]);

  useEffect(() => {
    if (lastLoadedTargetKeyRef.current === resolvedLoadKey) {
      return;
    }
    loadSelectedTarget(resolvedTargetId);
    lastLoadedTargetKeyRef.current = resolvedLoadKey;
  }, [loadSelectedTarget, resolvedLoadKey, resolvedTargetId]);

  useEffect(() => {
    if (!activeRuntimeTargetId) {
      return;
    }
    if (
      targetOptions.some((option) => option.value === activeRuntimeTargetId)
    ) {
      return;
    }
    clearInvalidActiveRuntimeTarget?.();
  }, [activeRuntimeTargetId, clearInvalidActiveRuntimeTarget, targetOptions]);

  return resolvedTargetId;
}
