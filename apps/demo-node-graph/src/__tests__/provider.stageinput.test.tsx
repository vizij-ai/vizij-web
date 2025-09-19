import React, { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  NodeGraphProvider,
  useNodeGraph,
  useGraphWrites,
} from "@vizij/node-graph-react";
import type { GraphSpec } from "@vizij/node-graph-wasm";

// Mock the wasm wrapper so we can test the Provider wiring without loading real wasm.
vi.mock("@vizij/node-graph-wasm", () => {
  const init = vi.fn(async () => {});
  const evalAllResult = {
    nodes: {},
    writes: [
      {
        path: "samples/mock.write",
        value: { float: 1 },
        shape: { id: "Scalar" },
      },
    ],
  };
  class Graph {
    loadGraph = vi.fn((_spec: any) => {});
    setTime = vi.fn((_t: number) => {});
    step = vi.fn((_dt: number) => {});
    setParam = vi.fn((_id: string, _key: string, _value: any) => {});
    stageInput = vi.fn((_path: string, _value: any, _shape?: any) => {});
    evalAll = vi.fn(() => evalAllResult);
  }
  const normalizeGraphSpec = vi.fn(async (spec: any) =>
    typeof spec === "string" ? JSON.parse(spec) : spec,
  );
  return { init, Graph, normalizeGraphSpec };
});

// Minimal spec (content isn't used by the mock Graph)
const spec: GraphSpec = {
  nodes: [
    {
      id: "in",
      type: "input",
      params: { path: "samples/in", value: { float: 0 } },
    },
    {
      id: "out",
      type: "output",
      params: { path: "samples/out" },
      inputs: { in: { node_id: "in" } },
    },
  ],
};

function Harness() {
  const { ready, stageInput: stageInputAny } = useNodeGraph() as any;
  const writes = useGraphWrites();
  useEffect(() => {
    if (ready) {
      // Stage a value; Provider should call evalAll immediately and publish writes
      stageInputAny("samples/in", { float: 2 }, { id: "Scalar" }, true);
    }
  }, [ready, stageInputAny]);
  return (
    <div>
      <div data-testid="ready">{String(ready)}</div>
      <div data-testid="writes-count">{writes.length}</div>
      <div data-testid="write-path">{writes[0]?.path ?? ""}</div>
    </div>
  );
}

describe("NodeGraphProvider stageInput wiring", () => {
  it("stages inputs and publishes writes on immediate eval", async () => {
    render(
      <NodeGraphProvider spec={spec} autostart={false}>
        <Harness />
      </NodeGraphProvider>,
    );

    // Ready flips true after init + initial evalAll
    await waitFor(() =>
      expect(screen.getByTestId("ready").textContent).toBe("true"),
    );
    // Our mock evalAll returns one write; Provider should publish it after stageInput immediate eval
    await waitFor(() =>
      expect(Number(screen.getByTestId("writes-count").textContent)).toBe(1),
    );
    expect(screen.getByTestId("write-path").textContent).toBe(
      "samples/mock.write",
    );
  });
});
