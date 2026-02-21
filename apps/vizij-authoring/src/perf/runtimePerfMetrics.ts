type RuntimeGraphMutationClass = "topology" | "pose";
const MAX_TRACKED_ROOT_LIFECYCLES = 24;

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

let state: RuntimePerfMetricsState = createInitialState();
let nextSessionId = 1;
let activeImportSession: ActiveRuntimeImportPerfSession | null = null;
let lastImportSummary: RuntimeImportPerfSummary | null = null;
let rootLifecycleById = new Map<string, RuntimeRootLifecycle>();
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

function withActiveImportSession(
  updater: (session: ActiveRuntimeImportPerfSession) => void,
) {
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

function cacheRootLifecycle(lifecycle: RuntimeRootLifecycle) {
  if (rootLifecycleById.has(lifecycle.rootId)) {
    rootLifecycleById.delete(lifecycle.rootId);
  }
  rootLifecycleById.set(lifecycle.rootId, lifecycle);
  while (rootLifecycleById.size > MAX_TRACKED_ROOT_LIFECYCLES) {
    const oldestKey = rootLifecycleById.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    rootLifecycleById.delete(oldestKey);
  }
}

function getOrCreateRootLifecycle(rootId: string): RuntimeRootLifecycle {
  const existing = rootLifecycleById.get(rootId);
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
  cacheRootLifecycle(created);
  return created;
}

function syncLifecycleIntoSummaries(
  rootId: string,
  lifecycle: RuntimeRootLifecycle,
) {
  withActiveImportSession((session) => {
    if (session.rootId !== rootId) {
      return;
    }
    session.assetLoadMs = lifecycle.assetLoadMs;
    session.rootAssignedToReadyMs = lifecycle.rootAssignedToReadyMs;
    session.readyToFirstFrameMs = lifecycle.readyToFirstFrameMs;
    session.firstControllableFrameAtMs = lifecycle.firstFrameAtMs;
  });
  if (!lastImportSummary || lastImportSummary.rootId !== rootId) {
    return;
  }
  lastImportSummary = {
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
  activeImportSession = null;
  lastImportSummary = null;
  nextSessionId = 1;
  rootLifecycleById = new Map<string, RuntimeRootLifecycle>();
  emitChange();
}

export function getRuntimePerfMetricsSnapshot(): RuntimePerfMetricsSnapshot {
  return buildSnapshot();
}

export function getLastRuntimeImportPerfSummary(): RuntimeImportPerfSummary | null {
  return lastImportSummary;
}

export function getActiveRuntimeImportPerfSession(): ActiveRuntimeImportPerfSession | null {
  return cloneActiveImportSession(activeImportSession);
}

export function getRuntimeImportPerfSessionSnapshot(): RuntimeImportPerfSessionSnapshot {
  return {
    activeSession: cloneActiveImportSession(activeImportSession),
    lastSummary: lastImportSummary ? { ...lastImportSummary } : null,
    metrics: buildSnapshot(),
  };
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
}) {
  if (
    activeImportSession &&
    activeImportSession.fingerprint === options.fingerprint
  ) {
    return activeImportSession.sessionId;
  }

  if (activeImportSession) {
    finalizeRuntimeImportPerfSession("cancelled");
  }

  const rootLifecycle =
    options.rootId === null ? null : rootLifecycleById.get(options.rootId);
  const session: ActiveRuntimeImportPerfSession = {
    sessionId: nextSessionId++,
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
  activeImportSession = session;
  state.activeImportSessionId = session.sessionId;
  emitChange();
  return session.sessionId;
}

export function finalizeRuntimeImportPerfSession(
  status: RuntimeImportPerfSummary["status"],
): RuntimeImportPerfSummary | null {
  if (!activeImportSession) {
    return null;
  }
  const completedAtMs = getNowMs();
  const rootLifecycle =
    activeImportSession.rootId === null
      ? null
      : rootLifecycleById.get(activeImportSession.rootId);
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
  lastImportSummary = summary;
  activeImportSession = null;
  state.activeImportSessionId = null;
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
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  const publishedAtMs = sanitizeDuration(options?.publishedAtMs ?? getNowMs());
  state.graphBridgeRuns += 1;
  state.graphBridgePublishAttempts += 1;
  state.graphBridgeTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
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
  withActiveImportSession((session) => {
    session.graphBridgeAcceptedUpdates += 1;
    session.graphBridgePublishes += 1;
    session.graphBridgePublishTotalMs += sanitizedDuration;
  });
  if (mutationClass === "topology") {
    state.graphBridgeTopologyPublishes += 1;
    withActiveImportSession((session) => {
      session.graphBridgeTopologyPublishes += 1;
      if (session.firstTopologyPublishAtMs === null) {
        session.firstTopologyPublishAtMs = publishedAtMs;
      }
      session.lastTopologyPublishAtMs = publishedAtMs;
    });
  } else {
    state.graphBridgePosePublishes += 1;
    withActiveImportSession((session) => {
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
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs ?? 0);
  state.controllerRegistrationRuns += 1;
  state.controllerRegistrationTotalMs += sanitizedDuration;
  let sessionUpdated = false;
  withActiveImportSession((session) => {
    session.controllerRegistrationRuns += 1;
    session.controllerRegistrationTotalMs += sanitizedDuration;
    sessionUpdated = true;
  });
  if (!sessionUpdated && lastImportSummary) {
    lastImportSummary = {
      ...lastImportSummary,
      controllerRegistrationRuns:
        lastImportSummary.controllerRegistrationRuns + 1,
      controllerRegistrationTotalMs:
        lastImportSummary.controllerRegistrationTotalMs + sanitizedDuration,
    };
  }
  return emitAndBuildSnapshot();
}

export function recordRigImportAttempt(): RuntimePerfMetricsSnapshot {
  state.rigImportAttempts += 1;
  withActiveImportSession((session) => {
    session.rigImportAttempts += 1;
  });
  return emitAndBuildSnapshot();
}

export function recordRigPrepareSpecCall(
  durationMs: number,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.rigPrepareSpecCalls += 1;
  state.rigPrepareSpecTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.rigPrepareSpecCalls += 1;
    session.rigPrepareSpecTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordRigNormalizeCall(
  durationMs?: number,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs ?? 0);
  state.rigNormalizeCalls += 1;
  state.rigNormalizeTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.rigNormalizeCalls += 1;
    session.rigNormalizeTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordRigGraphImportRun(
  durationMs: number,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.rigGraphImportRuns += 1;
  state.rigGraphImportTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.rigGraphImportRuns += 1;
    session.rigGraphImportTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordBuildRigGraphSpecRun(
  durationMs: number,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.buildRigGraphSpecRuns += 1;
  state.buildRigGraphSpecTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.buildRigGraphSpecRuns += 1;
    session.buildRigGraphSpecTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordResolveRuntimeGraphSpecRun(
  durationMs: number,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.resolveRuntimeGraphSpecRuns += 1;
  state.resolveRuntimeGraphSpecTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.resolveRuntimeGraphSpecRuns += 1;
    session.resolveRuntimeGraphSpecTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordPoseNormalizeRun(
  durationMs: number,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.poseNormalizeRuns += 1;
  state.poseNormalizeTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.poseNormalizeRuns += 1;
    session.poseNormalizeTotalMs += sanitizedDuration;
  });
  return emitAndBuildSnapshot();
}

export function recordAssetLoadRun(
  durationMs: number,
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
): RuntimePerfMetricsSnapshot {
  const nowMs = getNowMs();
  const existing = rootLifecycleById.get(rootId);
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
  cacheRootLifecycle(lifecycle);
  syncLifecycleIntoSummaries(rootId, lifecycle);
  return emitAndBuildSnapshot();
}

export function recordRuntimeReady(rootId: string): RuntimePerfMetricsSnapshot {
  const lifecycle = getOrCreateRootLifecycle(rootId);
  if (lifecycle.readyAtMs !== null) {
    return emitAndBuildSnapshot();
  }
  const nowMs = getNowMs();
  lifecycle.readyAtMs = nowMs;
  lifecycle.rootAssignedToReadyMs = sanitizeDuration(
    nowMs - lifecycle.assignedAtMs,
  );
  cacheRootLifecycle(lifecycle);
  state.runtimeReadyRuns += 1;
  state.runtimeReadyTotalMs += lifecycle.rootAssignedToReadyMs;
  syncLifecycleIntoSummaries(rootId, lifecycle);
  return emitAndBuildSnapshot();
}

export function recordRuntimeFirstFrame(
  rootId: string,
): RuntimePerfMetricsSnapshot {
  const lifecycle = getOrCreateRootLifecycle(rootId);
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
  cacheRootLifecycle(lifecycle);
  state.runtimeReadyToFirstFrameRuns += 1;
  state.runtimeReadyToFirstFrameTotalMs += lifecycle.readyToFirstFrameMs;
  withActiveImportSession((session) => {
    if (
      session.rootId === rootId &&
      session.firstControllableFrameAtMs === null
    ) {
      session.firstControllableFrameAtMs = lifecycle.firstFrameAtMs;
    }
  });
  syncLifecycleIntoSummaries(rootId, lifecycle);
  return emitAndBuildSnapshot();
}
