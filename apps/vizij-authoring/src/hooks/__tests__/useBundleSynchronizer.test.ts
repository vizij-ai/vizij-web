import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { VizijBundleExtension } from "@vizij/render";
import {
  getRuntimePerfMetricsSnapshot,
  resetRuntimePerfMetrics,
} from "../../perf/runtimePerfMetrics";
import {
  __resetBundleSynchronizerNormalizeCacheForTests,
  useBundleSynchronizer,
} from "../useBundleSynchronizer";

const mockNormalizeGraphSpec = vi.fn(async (spec: GraphSpec) => spec);
const mockWaitForNextFrame = vi.fn(async () => undefined);

vi.mock("@vizij/node-graph-wasm", async () => ({
  normalizeGraphSpec: (spec: GraphSpec) => mockNormalizeGraphSpec(spec),
}));

vi.mock("../../utils/frame", async () => ({
  waitForNextFrame: () => mockWaitForNextFrame(),
}));

function createBundleWithRigSpec(spec: GraphSpec) {
  return {
    version: 1,
    graphs: [{ kind: "rig", spec }],
  } as unknown as VizijBundleExtension;
}

function createBundleWithRigAndPoses(spec: GraphSpec) {
  return {
    version: 1,
    graphs: [{ kind: "rig", spec }],
    poses: {
      config: {
        poses: [],
      },
    },
  } as unknown as VizijBundleExtension;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRuntimePerfMetrics();
  __resetBundleSynchronizerNormalizeCacheForTests();
  mockWaitForNextFrame.mockImplementation(async () => undefined);
});
describe("useBundleSynchronizer failure surfaces", () => {
  it("reports recoverable rig import failures to the caller", async () => {
    const importGraphSpec = vi.fn(async () => ({
      status: "blocked_recoverable" as const,
      faceChanged: false,
      importedFaceId: null,
      message: "Rig import requires discrepancy review.",
    }));
    const onFailure = vi.fn();

    renderHook(() =>
      useBundleSynchronizer({
        faceId: "robot",
        rootId: "root",
        loadedBundle: createBundleWithRigSpec({
          nodes: [],
          edges: [],
        } as GraphSpec),
        standardInputCount: 1,
        skipDiscrepancyCheck: false,
        importGraphSpec,
        importPoseConfigFromData: vi.fn(),
        onFailure,
      }),
    );

    await waitFor(() => {
      expect(onFailure).toHaveBeenCalledWith({
        phase: "rig",
        message: "Rig import requires discrepancy review.",
      });
    });
  });

  it("normalizes the rig spec once and forwards it as canonical import input", async () => {
    const rigSpec = {
      nodes: [{ id: "n1", type: "input" }],
      edges: [],
    } as GraphSpec;
    const importGraphSpec = vi.fn(async () => ({
      status: "success" as const,
      faceChanged: false,
      importedFaceId: null,
    }));

    renderHook(() =>
      useBundleSynchronizer({
        faceId: "robot",
        rootId: "root",
        loadedBundle: createBundleWithRigSpec(rigSpec),
        standardInputCount: 1,
        skipDiscrepancyCheck: true,
        importGraphSpec,
        importPoseConfigFromData: vi.fn(),
        onFailure: vi.fn(),
      }),
    );

    await waitFor(() => {
      expect(importGraphSpec).toHaveBeenCalledTimes(1);
    });

    expect(mockNormalizeGraphSpec).toHaveBeenCalledTimes(1);
    expect(mockNormalizeGraphSpec).toHaveBeenCalledWith(rigSpec);
    expect(importGraphSpec).toHaveBeenCalledWith(rigSpec, {
      skipDiscrepancyCheck: true,
      normalizedSpec: rigSpec,
    });
    expect(getRuntimePerfMetricsSnapshot()).toMatchObject({
      rigImportAttempts: 1,
      rigNormalizeCalls: 1,
      rigNormalizeCallsPerImport: 1,
    });
  });

  it("does not re-import rig while waiting for standard inputs", async () => {
    const importCalls = { count: 0 };
    const importGraphSpec = vi.fn(async () => {
      importCalls.count += 1;
      return {
        status: "success_with_repair" as const,
        faceChanged: false,
        importedFaceId: null,
      };
    });
    const importPoseConfigFromData = vi.fn();
    const baseProps = {
      faceId: "robot",
      rootId: "root",
      loadedBundle: createBundleWithRigAndPoses({
        nodes: [],
        edges: [],
      } as GraphSpec),
      standardInputCount: 0,
      skipDiscrepancyCheck: false,
      importGraphSpec,
      importPoseConfigFromData,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
    };

    const hook = renderHook(
      (props: typeof baseProps) => useBundleSynchronizer(props),
      {
        initialProps: baseProps,
      },
    );

    await waitFor(() => {
      expect(importCalls.count).toBe(1);
    });

    hook.rerender({ ...baseProps, skipDiscrepancyCheck: true });

    await waitFor(() => {
      expect(importCalls.count).toBe(1);
    });
    expect(importPoseConfigFromData).toHaveBeenCalledTimes(0);
  });

  it("imports poses after standard inputs become available without rerunning rig import", async () => {
    const importGraphSpec = vi.fn(async () => ({
      status: "success_with_repair" as const,
      faceChanged: false,
      importedFaceId: null,
    }));
    const importPoseConfigFromData = vi.fn();
    const onPostPoseImport = vi.fn();
    const onSuccess = vi.fn();
    const baseProps = {
      faceId: "robot",
      rootId: "root",
      loadedBundle: createBundleWithRigAndPoses({
        nodes: [],
        edges: [],
      } as GraphSpec),
      skipDiscrepancyCheck: false,
      importGraphSpec,
      importPoseConfigFromData,
      onPostPoseImport,
      onFailure: vi.fn(),
      onSuccess,
    };

    const hook = renderHook(
      (props: typeof baseProps & { standardInputCount: number }) =>
        useBundleSynchronizer(props),
      {
        initialProps: { ...baseProps, standardInputCount: 0 },
      },
    );

    await waitFor(() => {
      expect(importGraphSpec).toHaveBeenCalledTimes(1);
    });
    expect(importPoseConfigFromData).toHaveBeenCalledTimes(0);

    hook.rerender({ ...baseProps, standardInputCount: 1 });

    await waitFor(() => {
      expect(importPoseConfigFromData).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onPostPoseImport).toHaveBeenCalledTimes(1);
    });
    expect(importGraphSpec).toHaveBeenCalledTimes(1);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("waits a bounded number of frames for imported face-id alignment before applying poses", async () => {
    const frameResolvers: Array<() => void> = [];
    mockWaitForNextFrame.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          frameResolvers.push(() => resolve(undefined));
        }),
    );
    const importGraphSpec = vi.fn(async () => ({
      status: "success" as const,
      faceChanged: false,
      importedFaceId: "robot",
    }));
    const importPoseConfigFromData = vi.fn();
    const onSuccess = vi.fn();
    const baseProps = {
      rootId: "root",
      loadedBundle: createBundleWithRigAndPoses({
        nodes: [],
        edges: [],
      } as GraphSpec),
      standardInputCount: 1,
      skipDiscrepancyCheck: false,
      importGraphSpec,
      importPoseConfigFromData,
      onFailure: vi.fn(),
      onSuccess,
    };
    const hook = renderHook(
      (props: typeof baseProps & { faceId: string | null }) =>
        useBundleSynchronizer(props),
      {
        initialProps: { ...baseProps, faceId: "legacy-face" },
      },
    );

    await waitFor(() => {
      expect(importGraphSpec).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockWaitForNextFrame).toHaveBeenCalledTimes(1);
    });
    expect(importPoseConfigFromData).toHaveBeenCalledTimes(0);

    hook.rerender({ ...baseProps, faceId: "robot" });
    const nextFrame = frameResolvers.shift();
    expect(nextFrame).toBeTypeOf("function");
    nextFrame?.();

    await waitFor(() => {
      expect(importPoseConfigFromData).toHaveBeenCalledTimes(1);
    });
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(importGraphSpec).toHaveBeenCalledTimes(1);
    expect(mockWaitForNextFrame.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("retries bundle sync when retryToken changes", async () => {
    const importGraphSpec = vi
      .fn()
      .mockResolvedValueOnce({
        status: "blocked_fatal" as const,
        faceChanged: false,
        importedFaceId: null,
        message: "Failed first pass.",
      })
      .mockResolvedValueOnce({
        status: "success" as const,
        faceChanged: false,
        importedFaceId: null,
      });
    const onFailure = vi.fn();
    const onSuccess = vi.fn();
    const baseProps = {
      faceId: "robot",
      rootId: "root",
      loadedBundle: createBundleWithRigSpec({
        nodes: [],
        edges: [],
      } as GraphSpec),
      standardInputCount: 1,
      skipDiscrepancyCheck: false,
      importGraphSpec,
      importPoseConfigFromData: vi.fn(),
      onFailure,
      onSuccess,
    };

    const hook = renderHook(
      (props: typeof baseProps & { retryToken: number }) =>
        useBundleSynchronizer(props),
      {
        initialProps: { ...baseProps, retryToken: 0 },
      },
    );

    await waitFor(() => {
      expect(importGraphSpec).toHaveBeenCalledTimes(1);
    });
    expect(onFailure).toHaveBeenCalledTimes(1);

    hook.rerender({ ...baseProps, retryToken: 1 });

    await waitFor(() => {
      expect(importGraphSpec).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
    expect(getRuntimePerfMetricsSnapshot()).toMatchObject({
      rigImportAttempts: 2,
      rigNormalizeCalls: 1,
      rigNormalizeCallsPerImport: 0.5,
    });
  });
});
