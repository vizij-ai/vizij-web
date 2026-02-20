import { beforeEach, describe, expect, it } from "vitest";
import {
  finalizeRuntimeImportPerfSession,
  getRuntimePerfMetricsSnapshot,
  getLastRuntimeImportPerfSummary,
  recordBuildRigGraphSpecRun,
  recordGraphBridgeRun,
  recordPoseNormalizeRun,
  recordResolveRuntimeGraphSpecRun,
  recordRigImportAttempt,
  recordRigGraphImportRun,
  recordRigPrepareSpecCall,
  recordRigNormalizeCall,
  resetRuntimePerfMetrics,
  startRuntimeImportPerfSession,
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

  it("tracks import-session timings and exposes final summary", () => {
    startRuntimeImportPerfSession({
      fingerprint: "fingerprint-1",
      rootId: "root",
    });
    recordRigImportAttempt();
    recordRigPrepareSpecCall(5);
    recordRigNormalizeCall(7);
    recordRigGraphImportRun(11);
    recordBuildRigGraphSpecRun(13);
    recordResolveRuntimeGraphSpecRun(17);
    recordPoseNormalizeRun(19);
    recordGraphBridgeRun(23, "topology");

    const summary = finalizeRuntimeImportPerfSession("success");
    const snapshot = getRuntimePerfMetricsSnapshot();

    expect(summary).toMatchObject({
      status: "success",
      fingerprint: "fingerprint-1",
      rootId: "root",
      rigImportAttempts: 1,
      rigPrepareSpecCalls: 1,
      rigPrepareSpecTotalMs: 5,
      rigNormalizeCalls: 1,
      rigNormalizeTotalMs: 7,
      rigGraphImportRuns: 1,
      rigGraphImportTotalMs: 11,
      buildRigGraphSpecRuns: 1,
      buildRigGraphSpecTotalMs: 13,
      resolveRuntimeGraphSpecRuns: 1,
      resolveRuntimeGraphSpecTotalMs: 17,
      poseNormalizeRuns: 1,
      poseNormalizeTotalMs: 19,
      graphBridgeRuns: 1,
      graphBridgePublishes: 1,
      graphBridgeTopologyPublishes: 1,
      graphBridgePosePublishes: 0,
      graphBridgePublishTotalMs: 23,
    });
    expect(summary?.durationMs ?? 0).toBeGreaterThanOrEqual(0);

    expect(snapshot).toMatchObject({
      activeImportSessionId: null,
      completedImportSessions: 1,
      graphBridgePublishTotalMs: 23,
      graphBridgePublishAverageMs: 23,
      rigPrepareSpecAverageMs: 5,
      rigNormalizeAverageMs: 7,
      rigGraphImportAverageMs: 11,
      buildRigGraphSpecAverageMs: 13,
      resolveRuntimeGraphSpecAverageMs: 17,
      poseNormalizeAverageMs: 19,
    });
    expect(getLastRuntimeImportPerfSummary()).toEqual(summary);
  });
});
