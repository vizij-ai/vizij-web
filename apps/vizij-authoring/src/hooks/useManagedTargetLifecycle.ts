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
  autoSelectFirstTarget?: boolean;
}

function resolveValidTargetId(
  targetOptions: readonly ManagedTargetOption[],
  selectedTargetId: string | null,
  autoSelectFirstTarget: boolean,
): string | null {
  if (
    selectedTargetId &&
    targetOptions.some((option) => option.value === selectedTargetId)
  ) {
    return selectedTargetId;
  }
  return autoSelectFirstTarget ? (targetOptions[0]?.value ?? null) : null;
}

export function useManagedTargetLifecycle({
  sessionKey = null,
  targetOptions,
  selectedTargetId,
  setSelectedTargetId,
  loadSelectedTarget,
  activeRuntimeTargetId = null,
  clearInvalidActiveRuntimeTarget,
  autoSelectFirstTarget = true,
}: UseManagedTargetLifecycleOptions): string | null {
  const resolvedTargetId = useMemo(
    () =>
      resolveValidTargetId(
        targetOptions,
        selectedTargetId,
        autoSelectFirstTarget,
      ),
    [autoSelectFirstTarget, selectedTargetId, targetOptions],
  );
  const loadSelectedTargetRef = useRef(loadSelectedTarget);
  const lastLoadedTargetKeyRef = useRef<string | undefined>(undefined);
  const resolvedLoadKey = useMemo(
    () =>
      `${sessionKey ?? "__sessionless__"}::${resolvedTargetId ?? "__none__"}`,
    [resolvedTargetId, sessionKey],
  );

  useEffect(() => {
    loadSelectedTargetRef.current = loadSelectedTarget;
  }, [loadSelectedTarget]);

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
    loadSelectedTargetRef.current(resolvedTargetId);
    lastLoadedTargetKeyRef.current = resolvedLoadKey;
  }, [resolvedLoadKey, resolvedTargetId]);

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
