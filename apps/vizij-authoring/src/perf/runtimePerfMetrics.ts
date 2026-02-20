type RuntimeGraphMutationClass = "topology" | "pose";

export type RuntimePerfMetricsSnapshot = {
  graphBridgeRuns: number;
  graphBridgePublishes: number;
  graphBridgeTopologyPublishes: number;
  graphBridgePosePublishes: number;
  graphBridgeSkippedRuns: number;
  graphBridgeTotalMs: number;
  graphBridgeAverageMs: number;
  graphBridgePublishTotalMs: number;
  graphBridgePublishAverageMs: number;
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
  activeImportSessionId: number | null;
  completedImportSessions: number;
};

type RuntimePerfMetricsState = Omit<
  RuntimePerfMetricsSnapshot,
  | "graphBridgeAverageMs"
  | "graphBridgePublishAverageMs"
  | "rigPrepareSpecAverageMs"
  | "rigNormalizeCallsPerImport"
  | "rigNormalizeAverageMs"
  | "rigGraphImportAverageMs"
  | "buildRigGraphSpecAverageMs"
  | "resolveRuntimeGraphSpecAverageMs"
  | "poseNormalizeAverageMs"
>;

function createInitialState(): RuntimePerfMetricsState {
  return {
    graphBridgeRuns: 0,
    graphBridgePublishes: 0,
    graphBridgeTopologyPublishes: 0,
    graphBridgePosePublishes: 0,
    graphBridgeSkippedRuns: 0,
    graphBridgeTotalMs: 0,
    graphBridgePublishTotalMs: 0,
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
  graphBridgePublishes: number;
  graphBridgeTopologyPublishes: number;
  graphBridgePosePublishes: number;
  graphBridgePublishTotalMs: number;
};

type ActiveRuntimeImportPerfSession = Omit<
  RuntimeImportPerfSummary,
  "completedAtMs" | "durationMs" | "status"
>;

let state: RuntimePerfMetricsState = createInitialState();
let nextSessionId = 1;
let activeImportSession: ActiveRuntimeImportPerfSession | null = null;
let lastImportSummary: RuntimeImportPerfSummary | null = null;

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
  };
}

export function resetRuntimePerfMetrics() {
  state = createInitialState();
  activeImportSession = null;
  lastImportSummary = null;
  nextSessionId = 1;
}

export function getRuntimePerfMetricsSnapshot(): RuntimePerfMetricsSnapshot {
  return buildSnapshot();
}

export function getLastRuntimeImportPerfSummary(): RuntimeImportPerfSummary | null {
  return lastImportSummary;
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
    graphBridgePublishes: 0,
    graphBridgeTopologyPublishes: 0,
    graphBridgePosePublishes: 0,
    graphBridgePublishTotalMs: 0,
  };
  activeImportSession = session;
  state.activeImportSessionId = session.sessionId;
  return session.sessionId;
}

export function finalizeRuntimeImportPerfSession(
  status: RuntimeImportPerfSummary["status"],
): RuntimeImportPerfSummary | null {
  if (!activeImportSession) {
    return null;
  }
  const completedAtMs = getNowMs();
  const summary: RuntimeImportPerfSummary = {
    ...activeImportSession,
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
  return summary;
}

export function recordGraphBridgeRun(
  durationMs: number,
  mutationClass: RuntimeGraphMutationClass | null,
): RuntimePerfMetricsSnapshot {
  const sanitizedDuration = sanitizeDuration(durationMs);
  state.graphBridgeRuns += 1;
  state.graphBridgeTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.graphBridgeRuns += 1;
  });

  if (mutationClass === null) {
    state.graphBridgeSkippedRuns += 1;
    return buildSnapshot();
  }

  state.graphBridgePublishes += 1;
  state.graphBridgePublishTotalMs += sanitizedDuration;
  withActiveImportSession((session) => {
    session.graphBridgePublishes += 1;
    session.graphBridgePublishTotalMs += sanitizedDuration;
  });
  if (mutationClass === "topology") {
    state.graphBridgeTopologyPublishes += 1;
    withActiveImportSession((session) => {
      session.graphBridgeTopologyPublishes += 1;
    });
  } else {
    state.graphBridgePosePublishes += 1;
    withActiveImportSession((session) => {
      session.graphBridgePosePublishes += 1;
    });
  }

  return buildSnapshot();
}

export function recordRigImportAttempt(): RuntimePerfMetricsSnapshot {
  state.rigImportAttempts += 1;
  withActiveImportSession((session) => {
    session.rigImportAttempts += 1;
  });
  return buildSnapshot();
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
  return buildSnapshot();
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
  return buildSnapshot();
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
  return buildSnapshot();
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
  return buildSnapshot();
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
  return buildSnapshot();
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
  return buildSnapshot();
}
