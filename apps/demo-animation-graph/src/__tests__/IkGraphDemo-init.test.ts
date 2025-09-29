import React, { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { GraphProvider } from "@vizij/node-graph-react";
import { useGraphRuntime } from "@vizij/node-graph-react";

// Local mock of @vizij/node-graph-wasm for this app test scope.
// We keep semantics consistent with the package tests but scoped to the app.
let mode: "ok" | "fail" = "ok";
let lastGraph: any = null;

vi.mock("@vizij/node-graph-wasm", () => {
  const init = vi.fn(async () => {});
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
            nodes: { sample: { out: { value: { float: 2.0 } } } },
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

describe("Demo (animation-graph) init behavior with declarative seeds", () => {
  it("applies initialParams/initialInputs and resolves readiness", async () => {
    const spec = { nodes: [], edges: [] };
    const initialParams = { fk: { urdf_xml: { text: "<robot/>" } } } as const;
    const initialInputs = {
      "nodes.joint_input.inputs.in": { vector: [0, 0, 0] },
    } as const;

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

    // Await readiness
    await runtimeRef.waitForGraphReady?.();
    expect(Boolean(runtimeRef.graphLoaded)).toBe(true);

    // Assert seeds were applied to the underlying graph
    const wasm: any = await import("@vizij/node-graph-wasm");
    const g = wasm.__getLastGraph?.();
    expect(g).toBeTruthy();
    expect(g.setParam).toHaveBeenCalled();
    expect(g.stageInput).toHaveBeenCalled();

    // A subsequent eval returns a JSON-like result
    const result = runtimeRef.evalAll?.();
    expect(result).toBeTruthy();
  });
});
