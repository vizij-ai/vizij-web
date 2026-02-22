type RuntimeGraphMutationClass = "topology" | "pose";
const MAX_TRACKED_ROOT_LIFECYCLES = 24;
const MAX_RUNTIME_DEBUG_EVENTS = 256;
const DEFAULT_IMPORT_FACE_SCOPE: RuntimeImportFaceScope = "main";

export type RuntimeImportFaceScope = "main" | "reference";

export type RuntimeDebugEvent = {
  atMs: number;
  category: string;
  detail: Record<string, unknown>;
};

type RuntimeRootLifecycle = {
  rootId: string;
  assignedAtMs: number;
  readyAtMs: number | null;
  firstFrameAtMs: number | null;
  assetLoadMs: number | null;
  rootAssignedToReadyMs: number | null;
  readyToFirstFrameMs: number | null;
};

export type RuntimePerfMetricsSnapshot = {
  graphBridgeRuns: number;
  graphBridgePublishAttempts: number;
  graphBridgeAcceptedUpdates: number;
  graphBridgePublishes: number;
  graphBridgeTopologyPublishes: number;
  graphBridgePosePublishes: number;
  graphBridgeSkippedRuns: number;
  graphBridgeTotalMs: number;
  graphBridgeAverageMs: number;
  graphBridgePublishTotalMs: number;
  graphBridgePublishAverageMs: number;
  controllerRegistrationRuns: number;
  controllerRegistrationTotalMs: number;
  controllerRegistrationAverageMs: number;
  rigImportAttempts: number;
  rigPrepareSpecCalls: number;
  rigPrepareSpecTotalMs: number;
  rigPrepareSpecAverageMs: number;
  rigNormalizeCalls: number;
  rigNormalizeCallsPerImport: number;
  rigNormalizeTotalMs: number;
  rigNormalizeAverageMs: number;
  rigGraphImportRuns: number;
  rigGraphImportTotalMs: number;
  rigGraphImportAverageMs: number;
  buildRigGraphSpecRuns: number;
  buildRigGraphSpecTotalMs: number;
  buildRigGraphSpecAverageMs: number;
  resolveRuntimeGraphSpecRuns: number;
  resolveRuntimeGraphSpecTotalMs: number;
  resolveRuntimeGraphSpecAverageMs: number;
  poseNormalizeRuns: number;
  poseNormalizeTotalMs: number;
  poseNormalizeAverageMs: number;
  assetLoadRuns: number;
  assetLoadTotalMs: number;
  assetLoadAverageMs: number;
  runtimeReadyRuns: number;
  runtimeReadyTotalMs: number;
  runtimeReadyAverageMs: number;
  runtimeReadyToFirstFrameRuns: number;
  runtimeReadyToFirstFrameTotalMs: number;
  runtimeReadyToFirstFrameAverageMs: number;
  activeImportSessionId: number | null;
  completedImportSessions: number;
};

type RuntimePerfMetricsState = Omit<
  RuntimePerfMetricsSnapshot,
  | "graphBridgeAverageMs"
  | "graphBridgePublishAverageMs"
  | "controllerRegistrationAverageMs"
  | "rigPrepareSpecAverageMs"
  | "rigNormalizeCallsPerImport"
  | "rigNormalizeAverageMs"
  | "rigGraphImportAverageMs"
  | "buildRigGraphSpecAverageMs"
  | "resolveRuntimeGraphSpecAverageMs"
  | "poseNormalizeAverageMs"
  | "assetLoadAverageMs"
  | "runtimeReadyAverageMs"
  | "runtimeReadyToFirstFrameAverageMs"
>;

function createInitialState(): RuntimePerfMetricsState {
  return {
    graphBridgeRuns: 0,
    graphBridgePublishAttempts: 0,
    graphBridgeAcceptedUpdates: 0,
    graphBridgePublishes: 0,
    graphBridgeTopologyPublishes: 0,
    graphBridgePosePublishes: 0,
    graphBridgeSkippedRuns: 0,
    graphBridgeTotalMs: 0,
    graphBridgePublishTotalMs: 0,
    controllerRegistrationRuns: 0,
    controllerRegistrationTotalMs: 0,
    rigImportAttempts: 0,
    rigPrepareSpecCalls: 0,
    rigPrepareSpecTotalMs: 0,
    rigNormalizeCalls: 0,
    rigNormalizeTotalMs: 0,
    rigGraphImportRuns: 0,
    rigGraphImportTotalMs: 0,
    buildRigGraphSpecRuns: 0,
    buildRigGraphSpecTotalMs: 0,
    resolveRuntimeGraphSpecRuns: 0,
    resolveRuntimeGraphSpecTotalMs: 0,
    poseNormalizeRuns: 0,
    poseNormalizeTotalMs: 0,
    assetLoadRuns: 0,
    assetLoadTotalMs: 0,
    runtimeReadyRuns: 0,
    runtimeReadyTotalMs: 0,
    runtimeReadyToFirstFrameRuns: 0,
    runtimeReadyToFirstFrameTotalMs: 0,
    activeImportSessionId: null,
    completedImportSessions: 0,
  };
}

export type RuntimeImportPerfSummary = {
  faceScope: RuntimeImportFaceScope;
  sessionId: number;
  fingerprint: string;
  rootId: string | null;
  startedAtMs: number;
  completedAtMs: number;
  durationMs: number;
  status: "success" | "failure" | "cancelled";
  rigImportAttempts: number;
  rigPrepareSpecCalls: number;
  rigPrepareSpecTotalMs: number;
  rigNormalizeCalls: number;
  rigNormalizeTotalMs: number;
  rigGraphImportRuns: number;
  rigGraphImportTotalMs: number;
  buildRigGraphSpecRuns: number;
  buildRigGraphSpecTotalMs: number;
  resolveRuntimeGraphSpecRuns: number;
  resolveRuntimeGraphSpecTotalMs: number;
  poseNormalizeRuns: number;
  poseNormalizeTotalMs: number;
  graphBridgeRuns: number;
  graphBridgePublishAttempts: number;
  graphBridgeAcceptedUpdates: number;
  graphBridgePublishes: number;
  graphBridgeTopologyPublishes: number;
  graphBridgePosePublishes: number;
  graphBridgePublishTotalMs: number;
  controllerRegistrationRuns: number;
  controllerRegistrationTotalMs: number;
  firstTopologyPublishAtMs: number | null;
  lastTopologyPublishAtMs: number | null;
  firstPosePublishAtMs: number | null;
  firstControllableFrameAtMs: number | null;
  assetLoadMs: number | null;
  rootAssignedToReadyMs: number | null;
  readyToFirstFrameMs: number | null;
};

type ActiveRuntimeImportPerfSession = Omit<
  RuntimeImportPerfSummary,
  "completedAtMs" | "durationMs" | "status"
>;

export type RuntimeImportPerfSessionSnapshot = {
  activeSession: ActiveRuntimeImportPerfSession | null;
  lastSummary: RuntimeImportPerfSummary | null;
  metrics: RuntimePerfMetricsSnapshot;
};

export type RuntimeImportProgressSnapshot = {
  activeSession: ActiveRuntimeImportPerfSession | null;
  lastSummary: RuntimeImportPerfSummary | null;
};

type RuntimeDebugGlobal = {
  __vizijRuntimeDebugCaptureEnabled?: boolean;
  __vizijRuntimeDebugEvents?: RuntimeDebugEvent[];
};

let state: RuntimePerfMetricsState = createInitialState();
const nextSessionIdByScope: Record<RuntimeImportFaceScope, number> = {
  main: 1,
  reference: 1,
};
const activeImportSessionByScope: Record<
  RuntimeImportFaceScope,
  ActiveRuntimeImportPerfSession | null
> = {
  main: null,
  reference: null,
};
const lastImportSummaryByScope: Record<
  RuntimeImportFaceScope,
  RuntimeImportPerfSummary | null
> = {
  main: null,
  reference: null,
};
let rootLifecycleById = new Map<string, RuntimeRootLifecycle>();
let runtimeDebugEvents: RuntimeDebugEvent[] = [];
const listeners = new Set<() => void>();

function getNowMs() {
  if (
    typeof globalThis !== "undefined" &&
    "performance" in globalThis &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function sanitizeDuration(durationMs: number) {
  if (!Number.isFinite(durationMs)) {
    return 0;
  }
  return Math.max(0, durationMs);
}

function resolveImportFaceScope(
  faceScope?: RuntimeImportFaceScope,
): RuntimeImportFaceScope {
  return faceScope ?? DEFAULT_IMPORT_FACE_SCOPE;
}

function getScopedRootLifecycleId(
  rootId: string,
  faceScope: RuntimeImportFaceScope,
) {
  return `${faceScope}:${rootId}`;
}

function withActiveImportSession(
  faceScope: RuntimeImportFaceScope,
  updater: (session: ActiveRuntimeImportPerfSession) => void,
) {
  const activeImportSession = activeImportSessionByScope[faceScope];
  if (!activeImportSession) {
    return;
  }
  updater(activeImportSession);
}

function cloneActiveImportSession(
  session: ActiveRuntimeImportPerfSession | null,
): ActiveRuntimeImportPerfSession | null {
  if (!session) {
    return null;
  }
  return { ...session };
}

function emitChange() {
  listeners.forEach((listener) => {
    listener();
  });
}

function emitAndBuildSnapshot(): RuntimePerfMetricsSnapshot {
  const snapshot = buildSnapshot();
  emitChange();
  return snapshot;
}

function isRuntimeDebugCaptureEnabled() {
  return Boolean(
    (globalThis as RuntimeDebugGlobal).__vizijRuntimeDebugCaptureEnabled,
  );
}

function cacheRootLifecycle(
  lifecycle: RuntimeRootLifecycle,
  faceScope: RuntimeImportFaceScope,
) {
  const scopedRootId = getScopedRootLifecycleId(lifecycle.rootId, faceScope);
  if (rootLifecycleById.has(scopedRootId)) {
    rootLifecycleById.delete(scopedRootId);
  }
  rootLifecycleById.set(scopedRootId, lifecycle);
  while (rootLifecycleById.size > MAX_TRACKED_ROOT_LIFECYCLES) {
    const oldestKey = rootLifecycleById.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    rootLifecycleById.delete(oldestKey);
  }
}

function getOrCreateRootLifecycle(
  rootId: string,
  faceScope: RuntimeImportFaceScope,
): RuntimeRootLifecycle {
  const scopedRootId = getScopedRootLifecycleId(rootId, faceScope);
  const existing = rootLifecycleById.get(scopedRootId);
  if (existing) {
    return existing;
  }
  const created: RuntimeRootLifecycle = {
    rootId,
    assignedAtMs: getNowMs(),
    readyAtMs: null,
    firstFrameAtMs: null,
    assetLoadMs: null,
    rootAssignedToReadyMs: null,
    readyToFirstFrameMs: null,
  };
  cacheRootLifecycle(created, faceScope);
  return created;
}

function syncLifecycleIntoSummaries(
  rootId: string,
  lifecycle: RuntimeRootLifecycle,
  faceScope: RuntimeImportFaceScope,
) {
  withActiveImportSession(faceScope, (session) => {
    if (session.rootId !== rootId) {
      return;
    }
    session.assetLoadMs = lifecycle.assetLoadMs;
    session.rootAssignedToReadyMs = lifecycle.rootAssignedToReadyMs;
    session.readyToFirstFrameMs = lifecycle.readyToFirstFrameMs;
    session.firstControllableFrameAtMs = lifecycle.firstFrameAtMs;
  });
  const lastImportSummary = lastImportSummaryByScope[faceScope];
  if (!lastImportSummary || lastImportSummary.rootId !== rootId) {
    return;
  }
  lastImportSummaryByScope[faceScope] = {
    ...lastImportSummary,
    assetLoadMs: lifecycle.assetLoadMs,
    rootAssignedToReadyMs: lifecycle.rootAssignedToReadyMs,
    readyToFirstFrameMs: lifecycle.readyToFirstFrameMs,
    firstControllableFrameAtMs: lifecycle.firstFrameAtMs,
  };
}

function buildSnapshot(): RuntimePerfMetricsSnapshot {
  return {
    ...state,
    graphBridgeAverageMs:
      state.graphBridgeRuns > 0
        ? state.graphBridgeTotalMs / state.graphBridgeRuns
        : 0,
    graphBridgePublishAverageMs:
      state.graphBridgePublishes > 0
        ? state.graphBridgePublishTotalMs / state.graphBridgePublishes
        : 0,
    controllerRegistrationAverageMs:
      state.controllerRegistrationRuns > 0
        ? state.controllerRegistrationTotalMs / state.controllerRegistrationRuns
        : 0,
    rigPrepareSpecAverageMs:
      state.rigPrepareSpecCalls > 0
        ? state.rigPrepareSpecTotalMs / state.rigPrepareSpecCalls
        : 0,
    rigNormalizeCallsPerImport:
      state.rigImportAttempts > 0
        ? state.rigNormalizeCalls / state.rigImportAttempts
        : 0,
    rigNormalizeAverageMs:
      state.rigNormalizeCalls > 0
        ? state.rigNormalizeTotalMs / state.rigNormalizeCalls
        : 0,
    rigGraphImportAverageMs:
      state.rigGraphImportRuns > 0
        ? state.rigGraphImportTotalMs / state.rigGraphImportRuns
        : 0,
    buildRigGraphSpecAverageMs:
      state.buildRigGraphSpecRuns > 0
        ? state.buildRigGraphSpecTotalMs / state.buildRigGraphSpecRuns
        : 0,
    resolveRuntimeGraphSpecAverageMs:
      state.resolveRuntimeGraphSpecRuns > 0
        ? state.resolveRuntimeGraphSpecTotalMs /
          state.resolveRuntimeGraphSpecRuns
        : 0,
    poseNormalizeAverageMs:
      state.poseNormalizeRuns > 0
        ? state.poseNormalizeTotalMs / state.poseNormalizeRuns
        : 0,
    assetLoadAverageMs:
      state.assetLoadRuns > 0
        ? state.assetLoadTotalMs / state.assetLoadRuns
        : 0,
    runtimeReadyAverageMs:
      state.runtimeReadyRuns > 0
        ? state.runtimeReadyTotalMs / state.runtimeReadyRuns
        : 0,
    runtimeReadyToFirstFrameAverageMs:
      state.runtimeReadyToFirstFrameRuns > 0
        ? state.runtimeReadyToFirstFrameTotalMs /
          state.runtimeReadyToFirstFrameRuns
        : 0,
  };
}

export function resetRuntimePerfMetrics() {
  state = createInitialState();
  activeImportSessionByScope.main = null;
  activeImportSessionByScope.reference = null;
  lastImportSummaryByScope.main = null;
  lastImportSummaryByScope.reference = null;
  nextSessionIdByScope.main = 1;
  nextSessionIdByScope.reference = 1;
  rootLifecycleById = new Map<string, RuntimeRootLifecycle>();
  runtimeDebugEvents = [];
  (
    globalThis as { __vizijRuntimeDebugEvents?: RuntimeDebugEvent[] }
  ).__vizijRuntimeDebugEvents = [];
  emitChange();
}

export function getRuntimePerfMetricsSnapshot(
  _faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  return buildSnapshot();
}

export function getLastRuntimeImportPerfSummary(
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimeImportPerfSummary | null {
  return lastImportSummaryByScope[faceScope];
}

export function getActiveRuntimeImportPerfSession(
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): ActiveRuntimeImportPerfSession | null {
  return cloneActiveImportSession(activeImportSessionByScope[faceScope]);
}

export function getRuntimeImportPerfSessionSnapshot(
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimeImportPerfSessionSnapshot {
  return {
    activeSession: cloneActiveImportSession(
      activeImportSessionByScope[faceScope],
    ),
    lastSummary: lastImportSummaryByScope[faceScope]
      ? { ...lastImportSummaryByScope[faceScope] }
      : null,
    metrics: buildSnapshot(),
  };
}

export function getRuntimeImportProgressSnapshot(
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimeImportProgressSnapshot {
  return {
    activeSession: cloneActiveImportSession(
      activeImportSessionByScope[faceScope],
    ),
    lastSummary: lastImportSummaryByScope[faceScope]
      ? { ...lastImportSummaryByScope[faceScope] }
      : null,
  };
}

export function setRuntimeDebugCaptureEnabled(enabled: boolean) {
  (globalThis as RuntimeDebugGlobal).__vizijRuntimeDebugCaptureEnabled =
    enabled;
}

export function getRuntimeDebugEvents(): RuntimeDebugEvent[] {
  return runtimeDebugEvents.map((event) => ({
    atMs: event.atMs,
    category: event.category,
    detail: { ...event.detail },
  }));
}

export function recordRuntimeDebugEvent(
  category: string,
  detail: Record<string, unknown> = {},
): void {
  if (!isRuntimeDebugCaptureEnabled()) {
    return;
  }
  const event: RuntimeDebugEvent = {
    atMs: getNowMs(),
    category,
    detail,
  };
  runtimeDebugEvents.push(event);
  if (runtimeDebugEvents.length > MAX_RUNTIME_DEBUG_EVENTS) {
    runtimeDebugEvents = runtimeDebugEvents.slice(
      runtimeDebugEvents.length - MAX_RUNTIME_DEBUG_EVENTS,
    );
  }
  (globalThis as RuntimeDebugGlobal).__vizijRuntimeDebugEvents =
    runtimeDebugEvents.map((entry) => ({
      atMs: entry.atMs,
      category: entry.category,
      detail: { ...entry.detail },
    }));
}

export function subscribeRuntimePerfMetrics(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function startRuntimeImportPerfSession(options: {
  fingerprint: string;
  rootId: string | null;
  faceScope?: RuntimeImportFaceScope;
}) {
  const faceScope = resolveImportFaceScope(options.faceScope);
  const activeImportSession = activeImportSessionByScope[faceScope];
  if (
    activeImportSession &&
    activeImportSession.fingerprint === options.fingerprint
  ) {
    return activeImportSession.sessionId;
  }

  if (activeImportSession) {
    finalizeRuntimeImportPerfSession("cancelled", faceScope);
  }

  const rootLifecycle =
    options.rootId === null
      ? null
      : rootLifecycleById.get(
          getScopedRootLifecycleId(options.rootId, faceScope),
        );
  const session: ActiveRuntimeImportPerfSession = {
    faceScope,
    sessionId: nextSessionIdByScope[faceScope]++,
    fingerprint: options.fingerprint,
    rootId: options.rootId,
    startedAtMs: getNowMs(),
    rigImportAttempts: 0,
    rigPrepareSpecCalls: 0,
    rigPrepareSpecTotalMs: 0,
    rigNormalizeCalls: 0,
    rigNormalizeTotalMs: 0,
    rigGraphImportRuns: 0,
    rigGraphImportTotalMs: 0,
    buildRigGraphSpecRuns: 0,
    buildRigGraphSpecTotalMs: 0,
    resolveRuntimeGraphSpecRuns: 0,
    resolveRuntimeGraphSpecTotalMs: 0,
    poseNormalizeRuns: 0,
    poseNormalizeTotalMs: 0,
    graphBridgeRuns: 0,
    graphBridgePublishAttempts: 0,
    graphBridgeAcceptedUpdates: 0,
    graphBridgePublishes: 0,
    graphBridgeTopologyPublishes: 0,
    graphBridgePosePublishes: 0,
    graphBridgePublishTotalMs: 0,
    controllerRegistrationRuns: 0,
    controllerRegistrationTotalMs: 0,
    firstTopologyPublishAtMs: null,
    lastTopologyPublishAtMs: null,
    firstPosePublishAtMs: null,
    firstControllableFrameAtMs: rootLifecycle?.firstFrameAtMs ?? null,
    assetLoadMs: rootLifecycle?.assetLoadMs ?? null,
    rootAssignedToReadyMs: rootLifecycle?.rootAssignedToReadyMs ?? null,
    readyToFirstFrameMs: rootLifecycle?.readyToFirstFrameMs ?? null,
  };
  activeImportSessionByScope[faceScope] = session;
  if (faceScope === DEFAULT_IMPORT_FACE_SCOPE) {
    state.activeImportSessionId = session.sessionId;
  }
  emitChange();
  return session.sessionId;
}

export function finalizeRuntimeImportPerfSession(
  status: RuntimeImportPerfSummary["status"],
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimeImportPerfSummary | null {
  const activeImportSession = activeImportSessionByScope[faceScope];
  if (!activeImportSession) {
    return null;
  }
  const completedAtMs = getNowMs();
  const rootLifecycle =
    activeImportSession.rootId === null
      ? null
      : rootLifecycleById.get(
          getScopedRootLifecycleId(activeImportSession.rootId, faceScope),
        );
  const summary: RuntimeImportPerfSummary = {
    ...activeImportSession,
    firstControllableFrameAtMs:
      rootLifecycle?.firstFrameAtMs ??
      activeImportSession.firstControllableFrameAtMs,
    assetLoadMs: rootLifecycle?.assetLoadMs ?? activeImportSession.assetLoadMs,
    rootAssignedToReadyMs:
      rootLifecycle?.rootAssignedToReadyMs ??
      activeImportSession.rootAssignedToReadyMs,
    readyToFirstFrameMs:
      rootLifecycle?.readyToFirstFrameMs ??
      activeImportSession.readyToFirstFrameMs,
    completedAtMs,
    durationMs: sanitizeDuration(
      completedAtMs - activeImportSession.startedAtMs,
    ),
    status,
  };
  lastImportSummaryByScope[faceScope] = summary;
  activeImportSessionByScope[faceScope] = null;
  if (faceScope === DEFAULT_IMPORT_FACE_SCOPE) {
    state.activeImportSessionId = null;
  }
  state.completedImportSessions += 1;
  emitChange();
  return summary;
}

export function recordGraphBridgeRun(
  durationMs: number,
  mutationClass: RuntimeGraphMutationClass | null,
  options?: {
    publishedAtMs?: number;
  },
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  const publishedAtMs = sanitizeDuration(options?.publishedAtMs ?? getNowMs());
  state.graphBridgeRuns += 1;
  state.graphBridgePublishAttempts += 1;
  state.graphBridgeTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.graphBridgeRuns += 1;
    session.graphBridgePublishAttempts += 1;
  });

  if (mutationClass === null) {
    state.graphBridgeSkippedRuns += 1;
    return emitAndBuildSnapshot();
  }

  state.graphBridgeAcceptedUpdates += 1;
  state.graphBridgePublishes += 1;
  state.graphBridgePublishTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.graphBridgeAcceptedUpdates += 1;
    session.graphBridgePublishes += 1;
    session.graphBridgePublishTotalMs += sanitizedDuration;
  });
  if (mutationClass === "topology") {
    state.graphBridgeTopologyPublishes += 1;
    withActiveImportSession(faceScope, (session) => {
      session.graphBridgeTopologyPublishes += 1;
      if (session.firstTopologyPublishAtMs === null) {
        session.firstTopologyPublishAtMs = publishedAtMs;
      }
      session.lastTopologyPublishAtMs = publishedAtMs;
    });
  } else {
    state.graphBridgePosePublishes += 1;
    withActiveImportSession(faceScope, (session) => {
      session.graphBridgePosePublishes += 1;
      if (session.firstPosePublishAtMs === null) {
        session.firstPosePublishAtMs = publishedAtMs;
      }
    });
  }

  return emitAndBuildSnapshot();
}

export function recordRuntimeControllerRegistrationRun(
  durationMs?: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs ?? 0);
  state.controllerRegistrationRuns += 1;
  state.controllerRegistrationTotalMs += sanitizedDuration;
  let sessionUpdated = false;
  withActiveImportSession(faceScope, (session) => {
    session.controllerRegistrationRuns += 1;
    session.controllerRegistrationTotalMs += sanitizedDuration;
    sessionUpdated = true;
  });
  const lastImportSummary = lastImportSummaryByScope[faceScope];
  if (!sessionUpdated && lastImportSummary) {
    lastImportSummaryByScope[faceScope] = {
      ...lastImportSummary,
      controllerRegistrationRuns:
        lastImportSummary.controllerRegistrationRuns + 1,
      controllerRegistrationTotalMs:
        lastImportSummary.controllerRegistrationTotalMs + sanitizedDuration,
    };
  }
  return emitAndBuildSnapshot();
}

export function recordRigImportAttempt(
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  state.rigImportAttempts += 1;
  withActiveImportSession(faceScope, (session) => {
    session.rigImportAttempts += 1;
  });
  return emitAndBuildSnapshot();
}

export function recordRigPrepareSpecCall(
  durationMs: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.rigPrepareSpecCalls += 1;
  state.rigPrepareSpecTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.rigPrepareSpecCalls += 1;
    session.rigPrepareSpecTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordRigNormalizeCall(
  durationMs?: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs ?? 0);
  state.rigNormalizeCalls += 1;
  state.rigNormalizeTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.rigNormalizeCalls += 1;
    session.rigNormalizeTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordRigGraphImportRun(
  durationMs: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.rigGraphImportRuns += 1;
  state.rigGraphImportTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.rigGraphImportRuns += 1;
    session.rigGraphImportTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordBuildRigGraphSpecRun(
  durationMs: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.buildRigGraphSpecRuns += 1;
  state.buildRigGraphSpecTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.buildRigGraphSpecRuns += 1;
    session.buildRigGraphSpecTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordResolveRuntimeGraphSpecRun(
  durationMs: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.resolveRuntimeGraphSpecRuns += 1;
  state.resolveRuntimeGraphSpecTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.resolveRuntimeGraphSpecRuns += 1;
    session.resolveRuntimeGraphSpecTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordPoseNormalizeRun(
  durationMs: number,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.poseNormalizeRuns += 1;
  state.poseNormalizeTotalMs += sanitizedDuration;
  withActiveImportSession(faceScope, (session) => {
    session.poseNormalizeRuns += 1;
    session.poseNormalizeTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordAssetLoadRun(
  durationMs: number,
  _faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.assetLoadRuns += 1;
  state.assetLoadTotalMs += sanitizedDuration;
  return emitAndBuildSnapshot();
}

export function markRuntimeRootAssigned(
  rootId: string,
  options?: {
    assetLoadMs?: number | null;
  },
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const nowMs = getNowMs();
  const existing = rootLifecycleById.get(
    getScopedRootLifecycleId(rootId, faceScope),
  );
  const lifecycle: RuntimeRootLifecycle = {
    rootId,
    assignedAtMs: nowMs,
    readyAtMs: null,
    firstFrameAtMs: null,
    assetLoadMs:
      options?.assetLoadMs === undefined
        ? (existing?.assetLoadMs ?? null)
        : sanitizeDuration(options.assetLoadMs ?? 0),
    rootAssignedToReadyMs: null,
    readyToFirstFrameMs: null,
  };
  cacheRootLifecycle(lifecycle, faceScope);
  syncLifecycleIntoSummaries(rootId, lifecycle, faceScope);
  return emitAndBuildSnapshot();
}

export function recordRuntimeReady(
  rootId: string,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const lifecycle = getOrCreateRootLifecycle(rootId, faceScope);
  if (lifecycle.readyAtMs !== null) {
    return emitAndBuildSnapshot();
  }
  const nowMs = getNowMs();
  lifecycle.readyAtMs = nowMs;
  lifecycle.rootAssignedToReadyMs = sanitizeDuration(
    nowMs - lifecycle.assignedAtMs,
  );
  cacheRootLifecycle(lifecycle, faceScope);
  state.runtimeReadyRuns += 1;
  state.runtimeReadyTotalMs += lifecycle.rootAssignedToReadyMs;
  syncLifecycleIntoSummaries(rootId, lifecycle, faceScope);
  return emitAndBuildSnapshot();
}

export function recordRuntimeFirstFrame(
  rootId: string,
  faceScope: RuntimeImportFaceScope = DEFAULT_IMPORT_FACE_SCOPE,
): RuntimePerfMetricsSnapshot {
  const lifecycle = getOrCreateRootLifecycle(rootId, faceScope);
  if (lifecycle.firstFrameAtMs !== null) {
    return emitAndBuildSnapshot();
  }
  const nowMs = getNowMs();
  lifecycle.firstFrameAtMs = nowMs;
  if (lifecycle.readyAtMs === null) {
    lifecycle.readyAtMs = nowMs;
    lifecycle.rootAssignedToReadyMs = 0;
  }
  lifecycle.readyToFirstFrameMs = sanitizeDuration(nowMs - lifecycle.readyAtMs);
  cacheRootLifecycle(lifecycle, faceScope);
  state.runtimeReadyToFirstFrameRuns += 1;
  state.runtimeReadyToFirstFrameTotalMs += lifecycle.readyToFirstFrameMs;
  withActiveImportSession(faceScope, (session) => {
    if (
      session.rootId === rootId &&
      session.firstControllableFrameAtMs === null
    ) {
      session.firstControllableFrameAtMs = lifecycle.firstFrameAtMs;
    }
  });
  syncLifecycleIntoSummaries(rootId, lifecycle, faceScope);
  return emitAndBuildSnapshot();
}
