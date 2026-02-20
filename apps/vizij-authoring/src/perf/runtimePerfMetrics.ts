type RuntimeGraphMutationClass = "topology" | "pose";

export type RuntimePerfMetricsSnapshot = {
  graphBridgeRuns: number;
  graphBridgePublishes: number;
  graphBridgeTopologyPublishes: number;
  graphBridgePosePublishes: number;
  graphBridgeSkippedRuns: number;
  graphBridgeTotalMs: number;
  graphBridgeAverageMs: number;
  rigImportAttempts: number;
  rigNormalizeCalls: number;
  rigNormalizeCallsPerImport: number;
};

type RuntimePerfMetricsState = Omit<
  RuntimePerfMetricsSnapshot,
  "graphBridgeAverageMs" | "rigNormalizeCallsPerImport"
>;

function createInitialState(): RuntimePerfMetricsState {
  return {
    graphBridgeRuns: 0,
    graphBridgePublishes: 0,
    graphBridgeTopologyPublishes: 0,
    graphBridgePosePublishes: 0,
    graphBridgeSkippedRuns: 0,
    graphBridgeTotalMs: 0,
    rigImportAttempts: 0,
    rigNormalizeCalls: 0,
  };
}

let state: RuntimePerfMetricsState = createInitialState();

function buildSnapshot(): RuntimePerfMetricsSnapshot {
  return {
    ...state,
    graphBridgeAverageMs:
      state.graphBridgeRuns > 0
        ? state.graphBridgeTotalMs / state.graphBridgeRuns
        : 0,
    rigNormalizeCallsPerImport:
      state.rigImportAttempts > 0
        ? state.rigNormalizeCalls / state.rigImportAttempts
        : 0,
  };
}

export function resetRuntimePerfMetrics() {
  state = createInitialState();
}

export function getRuntimePerfMetricsSnapshot(): RuntimePerfMetricsSnapshot {
  return buildSnapshot();
}

export function recordGraphBridgeRun(
  durationMs: number,
  mutationClass: RuntimeGraphMutationClass | null,
): RuntimePerfMetricsSnapshot {
  state.graphBridgeRuns += 1;
  state.graphBridgeTotalMs += Number.isFinite(durationMs)
    ? Math.max(0, durationMs)
    : 0;

  if (mutationClass === null) {
    state.graphBridgeSkippedRuns += 1;
    return buildSnapshot();
  }

  state.graphBridgePublishes += 1;
  if (mutationClass === "topology") {
    state.graphBridgeTopologyPublishes += 1;
  } else {
    state.graphBridgePosePublishes += 1;
  }

  return buildSnapshot();
}

export function recordRigImportAttempt(): RuntimePerfMetricsSnapshot {
  state.rigImportAttempts += 1;
  return buildSnapshot();
}

export function recordRigNormalizeCall(): RuntimePerfMetricsSnapshot {
  state.rigNormalizeCalls += 1;
  return buildSnapshot();
}
