import React from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { EvalResult, GraphSpec } from "@vizij/node-graph-wasm";

type MockGraphInstance = {
  loadGraph: Mock;
  evalAll: Mock<() => EvalResult>;
  setTime: Mock;
  step: Mock;
  setParam: Mock;
};

const graphInstances: MockGraphInstance[] = [];

vi.mock("@vizij/node-graph-wasm", () => {
  const evalResult: EvalResult = {
    nodes: {
      const: {
        out: {
          value: { float: 2 },
          shape: { id: "Scalar" },
        },
      },
    },
    writes: [
      {
        path: "robot/Head.Look",
        value: { float: 0.5 },
        shape: { id: "Scalar" },
      },
    ],
  };

  const makeInstance = (): MockGraphInstance => {
    const instance: MockGraphInstance = {
      loadGraph: vi.fn(),
      evalAll: vi.fn(() => evalResult),
      setTime: vi.fn(),
      step: vi.fn(),
      setParam: vi.fn(),
    };
    graphInstances.push(instance);
    return instance;
  };

  return {
    init: vi.fn(() => Promise.resolve()),
    createGraph: vi.fn(async () => makeInstance()),
    Graph: vi.fn(() => makeInstance()),
    toValueJSON: vi.fn((value: any) => value),
    normalizeGraphSpec: vi.fn(async (spec: GraphSpec | string) => spec),
    getNodeSchemas: vi.fn(() => Promise.resolve({ version: "1", nodes: [] })),
    get_node_schemas_json: vi.fn(() =>
      JSON.stringify({ version: "1", nodes: [] }),
    ),
    normalize_graph_spec_json: vi.fn((json: string) => json),
    listNodeGraphFixtures: vi.fn(async () => []),
    loadNodeGraphBundle: vi.fn(async () => ({
      spec: { nodes: [], edges: [] },
    })),
    loadNodeGraphSpec: vi.fn(async () => ({ nodes: [], edges: [] })),
    loadNodeGraphSpecJson: vi.fn(async () => "{}"),
    loadNodeGraphStage: vi.fn(async () => null),
  };
});

const TestConsumer: React.FC<{
  useNodeGraph: typeof import("../index").useNodeGraph;
  useGraphWrites: typeof import("../index").useGraphWrites;
  valueAsNumber: typeof import("../index").valueAsNumber;
}> = ({ useNodeGraph, useGraphWrites, valueAsNumber }) => {
  const { ready, getNodeOutputSnapshot, setParam, clearWrites } =
    useNodeGraph();
  const writes = useGraphWrites();
  if (!ready) return <span>loading</span>;
  const snapshot = getNodeOutputSnapshot("const");
  const numeric = valueAsNumber(snapshot);
  return (
    <div>
      <span data-testid="value">{numeric}</span>
      <span data-testid="writes-count">{writes.length}</span>
      <button
        onClick={() => setParam("out", "path", "robot/Head.Look")}
        data-testid="set-path"
      >
        set path
      </button>
      <button onClick={() => clearWrites()} data-testid="clear-writes">
        clear writes
      </button>
    </div>
  );
};

describe("NodeGraphProvider", () => {
  let NodeGraphProvider: typeof import("../index").NodeGraphProvider;
  let useNodeGraph: typeof import("../index").useNodeGraph;
  let useGraphWrites: typeof import("../index").useGraphWrites;
  let valueAsNumber: typeof import("../index").valueAsNumber;

  beforeEach(async () => {
    vi.clearAllMocks();
    graphInstances.length = 0;
    vi.resetModules();
    ({ NodeGraphProvider, useNodeGraph, useGraphWrites, valueAsNumber } =
      await import("../index"));
  });

  const spec: GraphSpec = {
    nodes: [
      {
        id: "const",
        type: "constant",
        params: { value: { float: 2 } },
        inputs: {},
        output_shapes: {},
      },
      {
        id: "out",
        type: "output",
        params: {},
        inputs: { in: { node_id: "const", output_key: "out" } },
        output_shapes: {},
      },
    ],
  };

  const specJson = JSON.stringify(spec);

  it("should expose evaluated outputs once initialization completes", async () => {
    render(
      <NodeGraphProvider spec={specJson} autostart={false}>
        <TestConsumer
          useNodeGraph={useNodeGraph}
          useGraphWrites={useGraphWrites}
          valueAsNumber={valueAsNumber}
        />
      </NodeGraphProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("value").textContent).toBe("2");
      expect(screen.getByTestId("writes-count").textContent).toBe("1");
    });

    fireEvent.click(screen.getByTestId("clear-writes"));
    expect(screen.getByTestId("writes-count").textContent).toBe("0");
  });

  it("should forward path updates through setParam", async () => {
    render(
      <NodeGraphProvider spec={specJson} autostart={false}>
        <TestConsumer
          useNodeGraph={useNodeGraph}
          useGraphWrites={useGraphWrites}
          valueAsNumber={valueAsNumber}
        />
      </NodeGraphProvider>,
    );

    await waitFor(() => screen.getByTestId("set-path"));
    fireEvent.click(screen.getByTestId("set-path"));

    const instance = graphInstances[0];
    expect(instance.setParam).toHaveBeenCalledWith(
      "out",
      "path",
      "robot/Head.Look",
    );
  });
});
