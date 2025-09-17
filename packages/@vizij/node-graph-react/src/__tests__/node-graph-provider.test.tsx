import React from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NodeGraphProvider, useNodeGraph, valueAsNumber } from "../index";
import type { EvalResult, GraphSpec } from "@vizij/node-graph-wasm";

type MockGraphInstance = {
  loadGraph: Mock;
  evalAll: Mock<[], EvalResult>;
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
    writes: [],
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
    Graph: vi.fn(() => makeInstance()),
    getNodeSchemas: vi.fn(() => Promise.resolve({ version: "1", nodes: [] })),
    get_node_schemas_json: vi.fn(() =>
      JSON.stringify({ version: "1", nodes: [] }),
    ),
    normalize_graph_spec_json: vi.fn((json: string) => json),
  };
});

const TestConsumer: React.FC = () => {
  const { ready, getNodeOutputSnapshot, setParam } = useNodeGraph();
  if (!ready) return <span>loading</span>;
  const snapshot = getNodeOutputSnapshot("const");
  const numeric = valueAsNumber(snapshot);
  return (
    <div>
      <span data-testid="value">{numeric}</span>
      <button
        onClick={() => setParam("out", "path", "robot/Head.Look")}
        data-testid="set-path"
      >
        set path
      </button>
    </div>
  );
};

describe("NodeGraphProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphInstances.length = 0;
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
        <TestConsumer />
      </NodeGraphProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("value").textContent).toBe("2"),
    );
  });

  it("should forward path updates through setParam", async () => {
    render(
      <NodeGraphProvider spec={specJson} autostart={false}>
        <TestConsumer />
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
