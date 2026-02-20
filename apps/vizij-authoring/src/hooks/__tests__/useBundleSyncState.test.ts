import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBundleSyncState } from "../useBundleSyncState";
import { useBundleSynchronizer } from "../useBundleSynchronizer";

vi.mock("../useBundleSynchronizer", async () => {
  const actual = await vi.importActual("../useBundleSynchronizer");
  return {
    ...actual,
    useBundleSynchronizer: vi.fn(),
  };
});

const mockedUseBundleSynchronizer = vi.mocked(useBundleSynchronizer);

function getLatestSynchronizerOptions() {
  const call = mockedUseBundleSynchronizer.mock.calls.at(-1);
  if (!call) {
    throw new Error("useBundleSynchronizer was not called.");
  }
  return call[0];
}

describe("useBundleSyncState", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("tracks failure state and retries with incremented retry token", () => {
    const importGraphSpec = vi.fn(async () => ({
      status: "success" as const,
      faceChanged: false,
      importedFaceId: null,
    }));
    const importPoseConfigFromData = vi.fn();

    const { result } = renderHook(() =>
      useBundleSyncState({
        faceId: "face",
        rootId: "root",
        loadedBundle: null,
        standardInputCount: 1,
        skipDiscrepancyCheck: false,
        importGraphSpec,
        importPoseConfigFromData,
      }),
    );

    expect(getLatestSynchronizerOptions().retryToken).toBe(0);

    act(() => {
      getLatestSynchronizerOptions().onFailure?.({
        phase: "rig",
        message: "Bundle rig import failed.",
      });
    });

    expect(result.current.bundleSyncFailure).toEqual({
      phase: "rig",
      message: "Bundle rig import failed.",
    });

    act(() => {
      result.current.retryBundleSync();
    });

    expect(result.current.bundleSyncFailure).toBeNull();
    expect(getLatestSynchronizerOptions().retryToken).toBe(1);
  });

  it("clears failure state on synchronizer success and reset", () => {
    const importGraphSpec = vi.fn(async () => ({
      status: "success" as const,
      faceChanged: false,
      importedFaceId: null,
    }));
    const importPoseConfigFromData = vi.fn();

    const { result } = renderHook(() =>
      useBundleSyncState({
        faceId: "face",
        rootId: "root",
        loadedBundle: null,
        standardInputCount: 1,
        skipDiscrepancyCheck: false,
        importGraphSpec,
        importPoseConfigFromData,
      }),
    );

    act(() => {
      getLatestSynchronizerOptions().onFailure?.({
        phase: "pose",
        message: "Bundle pose import failed.",
      });
    });
    expect(result.current.bundleSyncFailure?.phase).toBe("pose");

    act(() => {
      getLatestSynchronizerOptions().onSuccess?.();
    });
    expect(result.current.bundleSyncFailure).toBeNull();

    act(() => {
      result.current.retryBundleSync();
    });
    expect(getLatestSynchronizerOptions().retryToken).toBe(1);

    act(() => {
      result.current.resetBundleSyncState();
    });
    expect(result.current.bundleSyncFailure).toBeNull();
    expect(getLatestSynchronizerOptions().retryToken).toBe(0);
  });
});
