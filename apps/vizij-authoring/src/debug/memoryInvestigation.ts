export type MemoryInvestigationScope =
  | "full"
  | "main-runtime-only"
  | "authoring-only";

export interface MemoryInvestigationFlags {
  enabled: boolean;
  scope: MemoryInvestigationScope;
  mainRuntimeEnabled: boolean;
  referenceRuntimeEnabled: boolean;
}

interface JsHeapSnapshot {
  usedJSHeapSize: number | null;
  totalJSHeapSize: number | null;
  jsHeapSizeLimit: number | null;
}

interface UserAgentMemorySnapshot {
  bytes: number | null;
  breakdownCount: number | null;
  error?: string;
}

interface BrowserMemorySnapshot {
  jsHeap: JsHeapSnapshot | null;
  userAgentSpecificMemory: UserAgentMemorySnapshot | null;
}

export interface MemoryDebugCheckpoint {
  label: string;
  timestampMs: number;
  metadata?: Record<string, unknown>;
  flags: MemoryInvestigationFlags;
  authoring: Record<string, unknown>;
  graphRuntime: Record<string, unknown>;
  runtimes: Record<string, Record<string, unknown>>;
  render: Record<string, unknown>;
  browser: BrowserMemorySnapshot;
}

interface MemoryDebugState {
  flags: MemoryInvestigationFlags;
  authoring: Record<string, unknown>;
  graphRuntime: Record<string, unknown>;
  runtimes: Record<string, Record<string, unknown>>;
  render: Record<string, unknown>;
  checkpoints: MemoryDebugCheckpoint[];
}

interface MemoryDebugApi {
  enabled: boolean;
  flags: MemoryInvestigationFlags;
  getSnapshot: () => Promise<Omit<MemoryDebugCheckpoint, "label" | "metadata">>;
  captureCheckpoint: (
    label: string,
    metadata?: Record<string, unknown>,
  ) => Promise<MemoryDebugCheckpoint>;
  clearCheckpoints: () => void;
}

type GlobalWithMemoryInvestigation = typeof globalThis & {
  __VIZIJ_MEMORY_INVESTIGATION__?: MemoryInvestigationFlags;
  __VIZIJ_RUNTIME_DEBUG__?: boolean;
  __vizijMemoryDebugState?: MemoryDebugState;
  __vizijMemoryDebug?: MemoryDebugApi;
};

const DEFAULT_FLAGS: MemoryInvestigationFlags = {
  enabled: false,
  scope: "full",
  mainRuntimeEnabled: true,
  referenceRuntimeEnabled: true,
};

const DEFAULT_RENDER_STATE = Object.freeze({
  mountedCanvasCount: 0,
  canvasMountCount: 0,
  rootReplacementCount: 0,
  gltfLoadCount: 0,
  gltfUrlLoadCount: 0,
  gltfBlobLoadCount: 0,
  dracoLoaderCreationCount: 0,
});

function getGlobalMemoryInvestigation(): GlobalWithMemoryInvestigation {
  return globalThis as GlobalWithMemoryInvestigation;
}

function cloneFlags(flags: MemoryInvestigationFlags): MemoryInvestigationFlags {
  return { ...flags };
}

function cloneRecord(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return value ? { ...value } : {};
}

function cloneRuntimes(
  value: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(value).map(([runtimeId, runtimeState]) => [
      runtimeId,
      { ...runtimeState },
    ]),
  );
}

function createEmptyMemoryDebugState(
  flags: MemoryInvestigationFlags,
): MemoryDebugState {
  return {
    flags: cloneFlags(flags),
    authoring: {},
    graphRuntime: {},
    runtimes: {},
    render: { ...DEFAULT_RENDER_STATE },
    checkpoints: [],
  };
}

function resolveScope(
  value: string | null | undefined,
): MemoryInvestigationScope {
  switch (value) {
    case "authoring-only":
    case "main-runtime-only":
    case "full":
      return value;
    default:
      return "full";
  }
}

function resolveBrowserMemorySnapshot(): Promise<BrowserMemorySnapshot> {
  if (typeof performance === "undefined") {
    return Promise.resolve({
      jsHeap: null,
      userAgentSpecificMemory: null,
    });
  }

  const perf = performance as Performance & {
    memory?: {
      usedJSHeapSize?: number;
      totalJSHeapSize?: number;
      jsHeapSizeLimit?: number;
    };
    measureUserAgentSpecificMemory?: () => Promise<{
      bytes?: number;
      breakdown?: Array<unknown>;
    }>;
  };

  const jsHeap = perf.memory
    ? {
        usedJSHeapSize:
          typeof perf.memory.usedJSHeapSize === "number"
            ? perf.memory.usedJSHeapSize
            : null,
        totalJSHeapSize:
          typeof perf.memory.totalJSHeapSize === "number"
            ? perf.memory.totalJSHeapSize
            : null,
        jsHeapSizeLimit:
          typeof perf.memory.jsHeapSizeLimit === "number"
            ? perf.memory.jsHeapSizeLimit
            : null,
      }
    : null;

  const measureSpecificMemory = perf.measureUserAgentSpecificMemory;
  if (typeof measureSpecificMemory !== "function") {
    return Promise.resolve({
      jsHeap,
      userAgentSpecificMemory: null,
    });
  }

  return measureSpecificMemory
    .call(perf)
    .then((result) => ({
      jsHeap,
      userAgentSpecificMemory: {
        bytes: typeof result?.bytes === "number" ? result.bytes : null,
        breakdownCount: Array.isArray(result?.breakdown)
          ? result.breakdown.length
          : null,
      },
    }))
    .catch((error: unknown) => ({
      jsHeap,
      userAgentSpecificMemory: {
        bytes: null,
        breakdownCount: null,
        error: error instanceof Error ? error.message : String(error),
      },
    }));
}

function snapshotMemoryDebugState(state: MemoryDebugState) {
  return {
    timestampMs: Date.now(),
    flags: cloneFlags(state.flags),
    authoring: cloneRecord(state.authoring),
    graphRuntime: cloneRecord(state.graphRuntime),
    runtimes: cloneRuntimes(state.runtimes),
    render: cloneRecord(state.render),
  };
}

function createMemoryDebugApi(
  globalObj: GlobalWithMemoryInvestigation,
): MemoryDebugApi {
  const readState = () => {
    if (!globalObj.__vizijMemoryDebugState) {
      globalObj.__vizijMemoryDebugState = createEmptyMemoryDebugState(
        globalObj.__VIZIJ_MEMORY_INVESTIGATION__ ?? DEFAULT_FLAGS,
      );
    }
    return globalObj.__vizijMemoryDebugState;
  };

  const getSnapshot = async () => {
    const state = readState();
    const browser = await resolveBrowserMemorySnapshot();
    return {
      ...snapshotMemoryDebugState(state),
      browser,
    };
  };

  return {
    enabled: Boolean(globalObj.__VIZIJ_MEMORY_INVESTIGATION__?.enabled),
    flags: cloneFlags(
      globalObj.__VIZIJ_MEMORY_INVESTIGATION__ ?? DEFAULT_FLAGS,
    ),
    getSnapshot,
    captureCheckpoint: async (label, metadata) => {
      const state = readState();
      const browser = await resolveBrowserMemorySnapshot();
      const checkpoint: MemoryDebugCheckpoint = {
        ...snapshotMemoryDebugState(state),
        label,
        metadata,
        browser,
      };
      state.checkpoints = [...state.checkpoints, checkpoint];
      return checkpoint;
    },
    clearCheckpoints: () => {
      const state = readState();
      state.checkpoints = [];
    },
  };
}

export function resolveMemoryInvestigationFlags(
  search: string,
): MemoryInvestigationFlags {
  const params = new URLSearchParams(search);
  const scope = resolveScope(params.get("memoryScope"));
  const enabled =
    params.get("memoryInvestigation") === "1" || params.has("memoryScope");

  return {
    enabled,
    scope,
    mainRuntimeEnabled: !enabled || scope !== "authoring-only",
    referenceRuntimeEnabled: !enabled || scope === "full",
  };
}

export function initializeMemoryInvestigation(
  search = typeof window !== "undefined" ? window.location.search : "",
): MemoryInvestigationFlags {
  const globalObj = getGlobalMemoryInvestigation();
  const flags = resolveMemoryInvestigationFlags(search);
  globalObj.__VIZIJ_MEMORY_INVESTIGATION__ = flags;
  if (flags.enabled) {
    globalObj.__VIZIJ_RUNTIME_DEBUG__ = true;
  }

  const previousState = globalObj.__vizijMemoryDebugState;
  globalObj.__vizijMemoryDebugState = previousState
    ? {
        ...previousState,
        flags: cloneFlags(flags),
      }
    : createEmptyMemoryDebugState(flags);

  globalObj.__vizijMemoryDebug = createMemoryDebugApi(globalObj);
  return flags;
}

export function getMemoryInvestigationFlags(): MemoryInvestigationFlags {
  return (
    getGlobalMemoryInvestigation().__VIZIJ_MEMORY_INVESTIGATION__ ??
    DEFAULT_FLAGS
  );
}

export function updateMemoryDebugState(
  updater: (state: MemoryDebugState) => void,
): void {
  const globalObj = getGlobalMemoryInvestigation();
  if (!globalObj.__VIZIJ_MEMORY_INVESTIGATION__?.enabled) {
    return;
  }
  if (!globalObj.__vizijMemoryDebugState) {
    globalObj.__vizijMemoryDebugState = createEmptyMemoryDebugState(
      globalObj.__VIZIJ_MEMORY_INVESTIGATION__,
    );
  }
  updater(globalObj.__vizijMemoryDebugState);
  globalObj.__vizijMemoryDebug = createMemoryDebugApi(globalObj);
}
