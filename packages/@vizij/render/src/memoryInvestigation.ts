type MemoryInvestigationFlags = {
  enabled?: boolean;
};

type MemoryDebugState = {
  render?: Record<string, unknown>;
};

type GlobalWithMemoryInvestigation = typeof globalThis & {
  __VIZIJ_MEMORY_INVESTIGATION__?: MemoryInvestigationFlags;
  __vizijMemoryDebugState?: MemoryDebugState;
};

function getGlobalMemoryInvestigation(): GlobalWithMemoryInvestigation {
  return globalThis as GlobalWithMemoryInvestigation;
}

function updateRenderState(
  updater: (renderState: Record<string, unknown>) => void,
): void {
  const globalObj = getGlobalMemoryInvestigation();
  if (!globalObj.__VIZIJ_MEMORY_INVESTIGATION__?.enabled) {
    return;
  }
  if (!globalObj.__vizijMemoryDebugState) {
    globalObj.__vizijMemoryDebugState = {};
  }
  if (!globalObj.__vizijMemoryDebugState.render) {
    globalObj.__vizijMemoryDebugState.render = {};
  }
  updater(globalObj.__vizijMemoryDebugState.render);
}

export function recordRenderCounter(key: string, delta = 1): void {
  updateRenderState((renderState) => {
    const current =
      typeof renderState[key] === "number" ? Number(renderState[key]) : 0;
    renderState[key] = current + delta;
  });
}

export function setRenderMetric(key: string, value: unknown): void {
  updateRenderState((renderState) => {
    renderState[key] = value;
  });
}
