import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VizijBundleExtension } from "@vizij/render";
import { compileIrGraph } from "@vizij/node-graph-authoring";
import { useBundleGraphMaintenance } from "../useBundleGraphMaintenance";

vi.mock("@vizij/node-graph-authoring", () => ({
  compileIrGraph: vi.fn(),
}));

const mockedCompileIrGraph = vi.mocked(compileIrGraph);

function createBundle(): VizijBundleExtension {
  return {
    version: 1,
    graphs: [
      {
        id: "graph_1",
        kind: "rig",
        spec: { nodes: [{ id: "out_1", type: "output" }] },
        ir: {
          nodes: [
            { id: "out_1", type: "output", params: { path: "old/path" } },
          ],
          edges: [],
          constants: [],
          metadata: {},
        },
      },
    ],
  } as unknown as VizijBundleExtension;
}

describe("useBundleGraphMaintenance", () => {
  beforeEach(() => {
    mockedCompileIrGraph.mockReset();
  });

  it("overwrites bundle graph with compiled audit spec", async () => {
    let bundle: VizijBundleExtension | null = createBundle();
    const updateBundle = vi.fn(
      (
        updater:
          | VizijBundleExtension
          | null
          | ((
              previous: VizijBundleExtension | null,
            ) => VizijBundleExtension | null),
      ) => {
        bundle =
          typeof updater === "function"
            ? updater(bundle)
            : ((updater ?? bundle) as VizijBundleExtension);
      },
    );
    const alertDialog = vi.fn();
    const promptDialog = vi.fn();
    const compiledSpec = {
      nodes: [{ id: "out_1", type: "output", params: { path: "new/path" } }],
    };

    const { result } = renderHook(() =>
      useBundleGraphMaintenance({
        loadedBundle: bundle,
        bundleAudit: [
          {
            id: "graph_1",
            kind: "rig",
            faceId: "face",
            status: "match",
            diffCount: 0,
            diffLimitReached: false,
            issues: [],
            outputs: [],
            compiledSpec,
          } as any,
        ],
        updateBundle,
        alertDialog,
        promptDialog,
      }),
    );

    await act(async () => {
      await result.current.handleOverwriteBundleGraph("graph_1");
    });

    expect(updateBundle).toHaveBeenCalledTimes(1);
    expect(bundle?.graphs?.[0]?.spec).toEqual(compiledSpec);
    expect(bundle?.graphs?.[0]?.metadata).toMatchObject({
      reconciledAt: expect.any(String),
    });
    expect(alertDialog).not.toHaveBeenCalled();
  });

  it("shows a validation alert when renamed output path is empty", async () => {
    const bundle = createBundle();
    const updateBundle = vi.fn();
    const alertDialog = vi.fn();
    const promptDialog = vi.fn(async () => "   ");

    const { result } = renderHook(() =>
      useBundleGraphMaintenance({
        loadedBundle: bundle,
        bundleAudit: null,
        updateBundle,
        alertDialog,
        promptDialog,
      }),
    );

    await act(async () => {
      await result.current.handleRenameBundleOutput(
        "graph_1",
        "out_1",
        "old/path",
      );
    });

    expect(alertDialog).toHaveBeenCalledWith("Output path cannot be empty.");
    expect(updateBundle).not.toHaveBeenCalled();
    expect(mockedCompileIrGraph).not.toHaveBeenCalled();
  });

  it("renames bundle output path and recompiles IR graph", async () => {
    let bundle: VizijBundleExtension | null = createBundle();
    const updateBundle = vi.fn(
      (
        updater:
          | VizijBundleExtension
          | null
          | ((
              previous: VizijBundleExtension | null,
            ) => VizijBundleExtension | null),
      ) => {
        bundle =
          typeof updater === "function"
            ? updater(bundle)
            : ((updater ?? bundle) as VizijBundleExtension);
      },
    );
    const alertDialog = vi.fn();
    const promptDialog = vi.fn(async () => "  rig/face/new_target  ");
    const compiledSpec = {
      nodes: [
        {
          id: "out_1",
          type: "output",
          params: { path: "rig/face/new_target" },
        },
      ],
    };
    mockedCompileIrGraph.mockReturnValue({
      spec: compiledSpec,
      issues: [],
    } as any);

    const { result } = renderHook(() =>
      useBundleGraphMaintenance({
        loadedBundle: bundle,
        bundleAudit: null,
        updateBundle,
        alertDialog,
        promptDialog,
      }),
    );

    await act(async () => {
      await result.current.handleRenameBundleOutput(
        "graph_1",
        "out_1",
        "old/path",
      );
    });

    expect(mockedCompileIrGraph).toHaveBeenCalledTimes(1);
    expect(mockedCompileIrGraph.mock.calls[0]?.[0]).toMatchObject({
      nodes: [
        {
          id: "out_1",
          params: { path: "rig/face/new_target" },
        },
      ],
    });
    expect(bundle?.graphs?.[0]?.spec).toEqual(compiledSpec);
    expect((bundle?.graphs?.[0]?.ir as any)?.nodes?.[0]?.params?.path).toBe(
      "rig/face/new_target",
    );
    expect(alertDialog).not.toHaveBeenCalled();
  });
});
