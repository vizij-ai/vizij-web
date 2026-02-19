import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { VizijBundleExtension } from "@vizij/render";
import { useBundleSynchronizer } from "../useBundleSynchronizer";

vi.mock("@vizij/node-graph-wasm", async () => ({
  normalizeGraphSpec: vi.fn(async (spec: GraphSpec) => spec),
}));

function createBundleWithRigSpec(spec: GraphSpec) {
  return {
    version: 1,
    graphs: [{ kind: "rig", spec }],
  } as VizijBundleExtension;
}

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
  });
});
