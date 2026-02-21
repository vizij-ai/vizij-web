import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finalizeRuntimeImportPerfSession,
  getActiveRuntimeImportPerfSession,
  getRuntimePerfMetricsSnapshot,
  getRuntimeImportPerfSessionSnapshot,
  getLastRuntimeImportPerfSummary,
  markRuntimeRootAssigned,
  recordAssetLoadRun,
  recordBuildRigGraphSpecRun,
  recordGraphBridgeRun,
  recordPoseNormalizeRun,
  recordResolveRuntimeGraphSpecRun,
  recordRigImportAttempt,
  recordRigGraphImportRun,
  recordRuntimeFirstFrame,
  recordRuntimeReady,
  recordRigPrepareSpecCall,
  recordRigNormalizeCall,
  resetRuntimePerfMetrics,
  subscribeRuntimePerfMetrics,
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
      graphBridgePublishAttempts: 3,
      graphBridgeAcceptedUpdates: 2,
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
    recordGraphBridgeRun(23, "topology", { publishedAtMs: 1234 });
    recordGraphBridgeRun(29, "pose", { publishedAtMs: 2345 });

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
      graphBridgeRuns: 2,
      graphBridgePublishAttempts: 2,
      graphBridgeAcceptedUpdates: 2,
      graphBridgePublishes: 2,
      graphBridgeTopologyPublishes: 1,
      graphBridgePosePublishes: 1,
      graphBridgePublishTotalMs: 52,
      firstTopologyPublishAtMs: 1234,
      lastTopologyPublishAtMs: 1234,
      firstPosePublishAtMs: 2345,
    });
    expect(summary?.durationMs ?? 0).toBeGreaterThanOrEqual(0);

    expect(snapshot).toMatchObject({
      activeImportSessionId: null,
      completedImportSessions: 1,
      graphBridgePublishTotalMs: 52,
      graphBridgePublishAverageMs: 26,
      rigPrepareSpecAverageMs: 5,
      rigNormalizeAverageMs: 7,
      rigGraphImportAverageMs: 11,
      buildRigGraphSpecAverageMs: 13,
      resolveRuntimeGraphSpecAverageMs: 17,
      poseNormalizeAverageMs: 19,
    });
    expect(getLastRuntimeImportPerfSummary()).toEqual(summary);
  });

  it("tracks asset-load, runtime-ready, and first-frame lifecycle timings", () => {
    recordAssetLoadRun(31);
    markRuntimeRootAssigned("root", { assetLoadMs: 31 });
    startRuntimeImportPerfSession({
      fingerprint: "fingerprint-1",
      rootId: "root",
    });

    recordRuntimeReady("root");
    recordRuntimeReady("root");
    recordRuntimeFirstFrame("root");
    recordRuntimeFirstFrame("root");

    const summary = finalizeRuntimeImportPerfSession("success");
    const snapshot = getRuntimePerfMetricsSnapshot();

    expect(summary).toMatchObject({
      assetLoadMs: 31,
    });
    expect(summary?.firstControllableFrameAtMs ?? -1).toBeGreaterThanOrEqual(0);
    expect(summary?.rootAssignedToReadyMs ?? -1).toBeGreaterThanOrEqual(0);
    expect(summary?.readyToFirstFrameMs ?? -1).toBeGreaterThanOrEqual(0);
    expect(snapshot).toMatchObject({
      assetLoadRuns: 1,
      assetLoadTotalMs: 31,
      assetLoadAverageMs: 31,
      runtimeReadyRuns: 1,
      runtimeReadyToFirstFrameRuns: 1,
    });
  });

  it("publishes active-session updates through the perf subscription", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRuntimePerfMetrics(listener);

    startRuntimeImportPerfSession({
      fingerprint: "fingerprint-1",
      rootId: "root",
    });
    recordGraphBridgeRun(4, "topology", { publishedAtMs: 3456 });

    const active = getActiveRuntimeImportPerfSession();
    const snapshot = getRuntimeImportPerfSessionSnapshot();

    expect(listener).toHaveBeenCalled();
    expect(active?.firstTopologyPublishAtMs).toBe(3456);
    expect(snapshot.activeSession?.graphBridgeAcceptedUpdates).toBe(1);

    unsubscribe();
  });
});
