import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { GraphProvider } from "../GraphProvider";
import { useGraphRuntime } from "../useGraphRuntime";

// Mock @vizij/node-graph-wasm with a configurable createGraph
let mode: "ok" | "fail" = "ok";
let lastGraph: any = null;

vi.mock("@vizij/node-graph-wasm", () => {
  const init = vi.fn(async () => {});
  // passthrough normalizer used by normalizeSpec()
  const normalizeGraphSpec = vi.fn(async (spec: any) => spec);
  const createGraph = vi.fn(async (_spec: any) => {
    if (mode === "fail") {
      throw new Error("mock createGraph error");
    }
    const graph = {
      setParam: vi.fn((_nodeId: string, _key: string, _value: any) => {}),
      stageInput: vi.fn((_path: string, _value: any, _shape?: any) => {}),
      evalAll: vi.fn(() => {
        return {
          toValueJSON: () => ({
            nodes: { test_node: { out: { value: { float: 1.0 } } } },
            writes: [],
          }),
        };
      }),
      step: vi.fn((_dt: number) => {}),
      setTime: vi.fn((_t: number) => {}),
      free: vi.fn(() => {}),
    };
    lastGraph = graph;
    return graph;
  });
  return {
    init,
    normalizeGraphSpec,
    createGraph,
    __setMode: (m: "ok" | "fail") => {
      mode = m;
    },
    __getLastGraph: () => lastGraph,
  };
});

function Probe({ onReady }: { onReady: (rt: any) => void }) {
  const rt = useGraphRuntime();
  useEffect(() => {
    onReady(rt);
  }, [rt, onReady]);
  return null;
}

/**
 * Suppress noisy unhandledRejection warnings triggered by async effects
 * that intentionally reject (load failure path). Also silence console.error
 * for cleaner test output when we simulate failures.
 */
const suppressUnhandled = (_reason: any) => {};
let restoreConsoleError: (() => void) | null = null;

beforeAll(() => {
  process.on("unhandledRejection", suppressUnhandled);
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  restoreConsoleError = () => spy.mockRestore();
});

afterAll(() => {
  process.off("unhandledRejection", suppressUnhandled as any);
  restoreConsoleError?.();
});

describe("GraphProvider readiness", () => {
  it("waitForGraphReady resolves after load and seeds applied", async () => {
    const initialParams = { nodeA: { p1: { float: 42 } } } as const;
    const initialInputs = {
      "nodes.inputA.inputs.in": { vector: [1, 2, 3] },
    } as const;
    const spec = { nodes: [], edges: [] };

    let runtimeRef: any = null;

    render(
      React.createElement(
        GraphProvider as any,
        {
          spec,
          waitForGraph: true,
          autoStart: false,
          initialParams: initialParams as any,
          initialInputs: initialInputs as any,
        },
        React.createElement(Probe, { onReady: (rt: any) => (runtimeRef = rt) }),
      ),
    );

    await waitFor(() => {
      expect(runtimeRef).toBeTruthy();
    });

    expect(Boolean(runtimeRef.graphLoaded)).toBe(false);

    await runtimeRef.waitForGraphReady?.();

    await waitFor(() => {
      expect(Boolean(runtimeRef.graphLoaded)).toBe(true);
    });

    const wasm: any = await import("@vizij/node-graph-wasm");
    const g = wasm.__getLastGraph?.();
    expect(g).toBeTruthy();

    expect(g.setParam).toHaveBeenCalled();
    expect(g.stageInput).toHaveBeenCalled();

    const result = runtimeRef.evalAll?.();
    expect(result).toBeTruthy();
  });

  it("waitForGraphReady rejects on load failure", async () => {
    const wasm: any = await import("@vizij/node-graph-wasm");
    wasm.__setMode?.("fail");

    const spec = { nodes: [], edges: [] };
    let runtimeRef: any = null;

    render(
      React.createElement(
        GraphProvider as any,
        { spec, waitForGraph: true },
        React.createElement(Probe, { onReady: (rt: any) => (runtimeRef = rt) }),
      ),
    );

    await waitFor(() => {
      expect(runtimeRef).toBeTruthy();
    });

    await expect(runtimeRef.waitForGraphReady?.()).rejects.toThrow(
      /createGraph error/i,
    );

    wasm.__setMode?.("ok");
  });
});
