import { act, renderHook } from "@testing-library/react";
import type { GraphSpec } from "@vizij/node-graph";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRigGraphImport } from "../useRigGraphImport";

vi.mock("@vizij/node-graph", async () => {
  const actual =
    await vi.importActual<typeof import("@vizij/node-graph")>(
      "@vizij/node-graph",
    );
  return {
    ...actual,
    normalizeGraphSpec: vi.fn(async (spec: unknown) => spec),
  };
});

/** A rig graph declaring one input and nothing driven by it. */
const RIG_GRAPH = {
  nodes: [],
  edges: [],
  metadata: {
    vizij: {
      faceId: "face",
      inputs: [
        {
          id: "mouth_smile",
          path: "/standard/face/mouth/smile",
          label: "Smile",
          defaultValue: 0,
          range: { min: 0, max: 1 },
        },
      ],
      bindings: [],
    },
  },
} as unknown as GraphSpec;

function renderRigGraphImport(revision: { current: number }) {
  const order: string[] = [];
  const markRigImportApplied = vi.fn(() => {
    order.push("mark");
    revision.current += 1;
    return revision.current;
  });
  const setter = (name: string) =>
    vi.fn(() => {
      order.push(name);
    });
  const alerts: string[] = [];
  const { result } = renderHook(() =>
    useRigGraphImport({
      faceId: "face",
      animatables: {},
      animatableComponents: [],
      world: {},
      featureLabelOverrides: {},
      setAutoInputs: setter("setAutoInputs"),
      setCustomInputs: setter("setCustomInputs"),
      updateInputValues: setter("updateInputValues"),
      setBindings: setter("setBindings"),
      setInputBindings: setter("setInputBindings"),
      setSelectedStandardInputRoots: vi.fn(),
      setSelectedStandardInputSubgroups: vi.fn(),
      setLockedInspectorTargetIds: vi.fn(),
      setPipelineMetadataV1: vi.fn(),
      poseConfig: null,
      setFaceId: vi.fn(),
      skipPersistRef: { current: false },
      persistedAutoInputsRef: { current: new Map() },
      lastLoadedFaceIdRef: { current: null },
      openDiscrepancyReview: vi.fn(async () => ({ accepted: true })),
      alertDialog: vi.fn((message: string) => {
        alerts.push(message);
      }),
      debugLog: vi.fn(),
      pendingFaceRenameRef: { current: null },
      markRigImportApplied,
      rigImportRevisionRef: revision,
    }),
  );
  return {
    importGraphSpec: result.current,
    markRigImportApplied,
    order,
    alerts,
  };
}

describe("useRigGraphImport", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  it("returns the current revision when the import fails", async () => {
    const revision = { current: 4 };
    const { importGraphSpec, markRigImportApplied, alerts } =
      renderRigGraphImport(revision);

    let imported!: Awaited<ReturnType<typeof importGraphSpec>>;
    await act(async () => {
      imported = await importGraphSpec(
        { nodes: [], edges: [] } as unknown as GraphSpec,
        { skipDiscrepancyCheck: true },
      );
    });

    expect(alerts).toHaveLength(1);
    expect(markRigImportApplied).not.toHaveBeenCalled();
    expect(imported.inputsRevision).toBe(4);
  });

  it("returns the revision it applies the imported inputs under", async () => {
    const revision = { current: 4 };
    const {
      importGraphSpec,
      markRigImportApplied,
      order,
      alerts: alertsOut,
    } = renderRigGraphImport(revision);

    let imported!: Awaited<ReturnType<typeof importGraphSpec>>;
    await act(async () => {
      imported = await importGraphSpec(RIG_GRAPH, {
        skipDiscrepancyCheck: true,
      });
    });

    expect(alertsOut).toEqual([]);
    expect(markRigImportApplied).toHaveBeenCalledTimes(1);
    expect(imported.inputsRevision).toBe(5);
    // Marked in the same update as the inputs it applies.
    expect(order).toContain("setCustomInputs");
    expect(order.indexOf("mark")).toBeGreaterThan(
      order.indexOf("setCustomInputs"),
    );
  });
});
