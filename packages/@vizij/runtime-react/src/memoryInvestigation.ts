type MemoryInvestigationFlags = {
  enabled?: boolean;
};

type MemoryDebugState = {
  runtimes?: Record<string, Record<string, unknown>>;
};

type GlobalWithMemoryInvestigation = typeof globalThis & {
  __VIZIJ_MEMORY_INVESTIGATION__?: MemoryInvestigationFlags;
  __vizijMemoryDebugState?: MemoryDebugState;
};

function getGlobalMemoryInvestigation(): GlobalWithMemoryInvestigation {
  return globalThis as GlobalWithMemoryInvestigation;
}

function updateRuntimeMap(
  updater: (runtimeMap: Record<string, Record<string, unknown>>) => void,
): void {
  const globalObj = getGlobalMemoryInvestigation();
  if (!globalObj.__VIZIJ_MEMORY_INVESTIGATION__?.enabled) {
    return;
  }
  if (!globalObj.__vizijMemoryDebugState) {
    globalObj.__vizijMemoryDebugState = {};
  }
  if (!globalObj.__vizijMemoryDebugState.runtimes) {
    globalObj.__vizijMemoryDebugState.runtimes = {};
  }
  updater(globalObj.__vizijMemoryDebugState.runtimes);
}

export function setRuntimeDebugState(
  runtimeId: string,
  state: Record<string, unknown>,
): void {
  updateRuntimeMap((runtimeMap) => {
    runtimeMap[runtimeId] = state;
  });
}

export function clearRuntimeDebugState(runtimeId: string): void {
  updateRuntimeMap((runtimeMap) => {
    delete runtimeMap[runtimeId];
  });
}
