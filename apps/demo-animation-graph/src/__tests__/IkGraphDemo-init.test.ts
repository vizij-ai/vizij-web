import React, { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { GraphProvider } from "@vizij/node-graph-react";
import { useGraphRuntime } from "@vizij/node-graph-react";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { ikGraphSpec } from "../data/ikGraph";
import { slewGraphSpec } from "../data/slewGraph";
import { makeTypedPath } from "../utils/typedPath";

// Local mock of @vizij/node-graph-wasm for this app test scope.
// We keep semantics consistent with the package tests but scoped to the app.
let mode: "ok" | "fail" = "ok";
let lastGraph: any = null;

vi.mock("@vizij/node-graph-wasm", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@vizij/node-graph-wasm")>();
  const {
    listNodeGraphFixtures,
    loadNodeGraphBundle,
    loadNodeGraphSpec,
    loadNodeGraphSpecJson,
    loadNodeGraphStage,
    ...rest
  } = actual;
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
    ...rest,
    listNodeGraphFixtures,
    loadNodeGraphBundle,
    loadNodeGraphSpec,
    loadNodeGraphSpecJson,
    loadNodeGraphStage,
    init,
    createGraph,
    normalizeGraphSpec: vi.fn(async (spec: any) => spec),
    normalize_graph_spec_json: vi.fn((json: string) => json),
    toValueJSON: vi.fn((value: any) => value),
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
    await waitFor(() => {
      expect(Boolean(runtimeRef.graphLoaded)).toBe(true);
    });

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

const typedPathPattern = /^[a-z0-9_]+:[^\s]+$/i;

function ensureGraphHasCanonicalEdges(spec: GraphSpec) {
  expect(Array.isArray(spec.edges)).toBe(true);
  spec.nodes.forEach((node: GraphSpec["nodes"][number]) => {
    if (
      node.type &&
      typeof node.type === "string" &&
      node.params &&
      typeof node.params === "object" &&
      "path" in node.params &&
      typeof (node.params as any).path === "string"
    ) {
      const path = ((node.params as any).path as string).trim();
      if (path.length > 0) {
        if (!typedPathPattern.test(path)) {
          throw new Error(`Invalid typed path: ${path}`);
        }
      }
    }
  });
}

function registerMergedGraphMock(config: {
  graphs: Array<{ id?: string; spec: GraphSpec }>;
}) {
  if (!config || !Array.isArray(config.graphs) || !config.graphs.length) {
    throw new Error("config.graphs must include at least one graph spec");
  }
  config.graphs.forEach((entry, index) => {
    const spec = entry?.spec;
    if (!spec || typeof spec !== "object") {
      throw new Error(`Graph entry ${index} missing spec`);
    }
    ensureGraphHasCanonicalEdges(spec);
  });
  return `merged-${config.graphs.length}`;
}

describe("Graph fixtures and orchestrator guards", () => {
  it("ik graph fixture exposes canonical edges and typed paths", () => {
    expect(() => ensureGraphHasCanonicalEdges(ikGraphSpec)).not.toThrow();
  });

  it("slew graph fixture exposes canonical edges and typed paths", () => {
    expect(() => ensureGraphHasCanonicalEdges(slewGraphSpec)).not.toThrow();
  });

  it("makeTypedPath sanitizes segments for typed path guards", () => {
    const path = makeTypedPath("vec3", "rig", "hand target", "ik");
    expect(path).toBe("vec3:rig/hand-target/ik");
    expect(() => {
      if (!typedPathPattern.test(path)) {
        throw new Error("builder produced invalid typed path");
      }
    }).not.toThrow();
  });

  it("registerMergedGraph mock accepts valid configs", () => {
    const mergedId = registerMergedGraphMock({
      graphs: [
        { id: "ik", spec: JSON.parse(JSON.stringify(ikGraphSpec)) },
        { id: "slew", spec: JSON.parse(JSON.stringify(slewGraphSpec)) },
      ],
    });
    expect(mergedId).toBe("merged-2");
  });

  it("registerMergedGraph mock rejects invalid typed paths", () => {
    const invalidIk = JSON.parse(JSON.stringify(ikGraphSpec)) as GraphSpec;
    const outputNode = invalidIk.nodes.find(
      (node: GraphSpec["nodes"][number]) =>
        String(node.type).toLowerCase() === "output",
    );
    expect(outputNode).toBeTruthy();
    if (outputNode && outputNode.params) {
      (outputNode.params as any).path = "float:invalid path with spaces";
    }
    expect(() =>
      registerMergedGraphMock({
        graphs: [{ id: "ik", spec: invalidIk }],
      }),
    ).toThrow(/Invalid typed path/);
  });
});
