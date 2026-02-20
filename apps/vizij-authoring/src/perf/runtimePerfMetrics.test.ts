import { beforeEach, describe, expect, it } from "vitest";
import {
  getRuntimePerfMetricsSnapshot,
  recordGraphBridgeRun,
  recordRigImportAttempt,
  recordRigNormalizeCall,
  resetRuntimePerfMetrics,
} from "./runtimePerfMetrics";

describe("runtimePerfMetrics", () => {
  beforeEach(() => {
    resetRuntimePerfMetrics();
  });

  it("tracks graph bridge mutation mix and average duration", () => {
    recordGraphBridgeRun(3, "topology");
    recordGraphBridgeRun(5, null);
    const snapshot = recordGraphBridgeRun(7, "pose");

    expect(snapshot).toMatchObject({
      graphBridgeRuns: 3,
      graphBridgePublishes: 2,
      graphBridgeTopologyPublishes: 1,
      graphBridgePosePublishes: 1,
      graphBridgeSkippedRuns: 1,
      graphBridgeTotalMs: 15,
      graphBridgeAverageMs: 5,
    });
  });

  it("tracks rig normalize calls per import attempt", () => {
    recordRigImportAttempt();
    recordRigNormalizeCall();
    recordRigImportAttempt();
    const snapshot = getRuntimePerfMetricsSnapshot();

    expect(snapshot.rigImportAttempts).toBe(2);
    expect(snapshot.rigNormalizeCalls).toBe(1);
    expect(snapshot.rigNormalizeCallsPerImport).toBe(0.5);
  });

  it("clamps negative durations to zero", () => {
    const snapshot = recordGraphBridgeRun(-4, null);
    expect(snapshot.graphBridgeTotalMs).toBe(0);
    expect(snapshot.graphBridgeAverageMs).toBe(0);
  });
});
