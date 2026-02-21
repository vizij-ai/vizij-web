import { beforeEach, describe, expect, it } from "vitest";
import {
  finalizeRuntimeImportPerfSession,
  getRuntimeImportPerfSessionSnapshot,
  markRuntimeRootAssigned,
  recordGraphBridgeRun,
  recordRuntimeFirstFrame,
  resetRuntimePerfMetrics,
  startRuntimeImportPerfSession,
} from "./runtimePerfMetrics";
import { resolveImportProgressState } from "./importProgress";

describe("resolveImportProgressState", () => {
  beforeEach(() => {
    resetRuntimePerfMetrics();
  });

  it("reports asset-load phase while asset loader is active", () => {
    const state = resolveImportProgressState({
      isAssetLoading: true,
      rootId: null,
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot(),
    });

    expect(state).toMatchObject({
      visible: true,
      phase: "asset-load",
      status: "running",
    });
  });

  it("reports runtime-sync while active session is publishing updates", () => {
    startRuntimeImportPerfSession({
      fingerprint: "fingerprint-1",
      rootId: "root",
    });
    recordGraphBridgeRun(5, "topology", { publishedAtMs: 111 });

    const state = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "root",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot(),
    });

    expect(state).toMatchObject({
      visible: true,
      phase: "runtime-sync",
      status: "running",
    });
    expect(state.detail).toContain("updates 1/1");
  });

  it("reports ready after first controllable frame is recorded", () => {
    markRuntimeRootAssigned("root");
    startRuntimeImportPerfSession({
      fingerprint: "fingerprint-1",
      rootId: "root",
    });
    recordRuntimeFirstFrame("root");

    const state = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "root",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot(),
    });

    expect(state).toMatchObject({
      phase: "ready",
      status: "success",
      progress: 1,
    });
  });

  it("reports failed status from last summary when no active session remains", () => {
    startRuntimeImportPerfSession({
      fingerprint: "fingerprint-1",
      rootId: "root",
    });
    finalizeRuntimeImportPerfSession("failure");

    const state = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "root",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot(),
    });

    expect(state).toMatchObject({
      visible: true,
      phase: "failed",
      status: "failure",
    });
    expect(state.detail).toContain("duration");
  });

  it("hides status when there is no active import and no matching summary", () => {
    const state = resolveImportProgressState({
      isAssetLoading: false,
      rootId: null,
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot(),
    });

    expect(state.visible).toBe(false);
    expect(state.phase).toBe("idle");
  });
});
