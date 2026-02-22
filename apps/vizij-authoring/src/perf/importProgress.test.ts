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

  it("uses the same schema for reference-face sessions", () => {
    startRuntimeImportPerfSession({
      fingerprint: "reference-fingerprint",
      rootId: "reference-root",
      faceScope: "reference",
    });
    recordRuntimeFirstFrame("reference-root", "reference");

    const state = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "reference-root",
      faceScope: "reference",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot("reference"),
    });

    expect(state).toMatchObject({
      visible: true,
      phase: "ready",
      status: "success",
      progress: 1,
      label: "Import ready",
    });
  });

  it("keeps shared runtime-sync -> ready ordering for main and reference sessions", () => {
    startRuntimeImportPerfSession({
      fingerprint: "main-fingerprint",
      rootId: "main-root",
      faceScope: "main",
    });
    startRuntimeImportPerfSession({
      fingerprint: "reference-fingerprint",
      rootId: "reference-root",
      faceScope: "reference",
    });
    recordGraphBridgeRun(4, "topology", { publishedAtMs: 100 }, "main");
    recordGraphBridgeRun(4, "topology", { publishedAtMs: 100 }, "reference");

    const mainSync = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "main-root",
      faceScope: "main",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot("main"),
    });
    const referenceSync = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "reference-root",
      faceScope: "reference",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot("reference"),
    });

    expect(mainSync.phase).toBe("runtime-sync");
    expect(referenceSync.phase).toBe("runtime-sync");

    recordRuntimeFirstFrame("main-root", "main");
    recordRuntimeFirstFrame("reference-root", "reference");

    const mainReady = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "main-root",
      faceScope: "main",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot("main"),
    });
    const referenceReady = resolveImportProgressState({
      isAssetLoading: false,
      rootId: "reference-root",
      faceScope: "reference",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot("reference"),
    });

    expect(mainReady).toMatchObject({ phase: "ready", status: "success" });
    expect(referenceReady).toMatchObject({ phase: "ready", status: "success" });
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

  it("uses reference summary even when reference rootId is not provided", () => {
    startRuntimeImportPerfSession({
      fingerprint: "reference-fingerprint",
      rootId: "reference-root",
      faceScope: "reference",
    });
    recordRuntimeFirstFrame("reference-root", "reference");
    finalizeRuntimeImportPerfSession("success", "reference");

    const state = resolveImportProgressState({
      isAssetLoading: false,
      rootId: null,
      faceScope: "reference",
      sessionSnapshot: getRuntimeImportPerfSessionSnapshot("reference"),
    });

    expect(state).toMatchObject({
      visible: true,
      phase: "ready",
      status: "success",
      progress: 1,
      label: "Import ready",
    });
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
