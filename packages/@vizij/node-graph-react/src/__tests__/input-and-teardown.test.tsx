import React from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
  act,
} from "@testing-library/react";
import { GraphProvider, useGraphRuntime } from "../index";
import type { GraphSpec } from "@vizij/node-graph-wasm";

type MockGraphInstance = {
  loadGraph: Mock;
  evalAll: Mock;
  free: Mock;
  stageInput: Mock;
  setParam: Mock;
  setTime: Mock;
  step: Mock;
};

const graphInstances: MockGraphInstance[] = [];

vi.mock("@vizij/node-graph-wasm", () => {
  const makeInstance = (): MockGraphInstance => {
    const instance: MockGraphInstance = {
      loadGraph: vi.fn(),
      evalAll: vi.fn(() => ({ nodes: {}, writes: [] })),
      free: vi.fn(),
      stageInput: vi.fn(),
      setParam: vi.fn(),
      setTime: vi.fn(),
      step: vi.fn(),
    };
    graphInstances.push(instance);
    return instance;
  };

  return {
    init: vi.fn(() => Promise.resolve()),
    Graph: vi.fn(() => makeInstance()),
    normalizeGraphSpec: vi.fn(async (s: any) => s),
    getNodeSchemas: vi.fn(() => Promise.resolve({ version: "1", nodes: [] })),
  };
});

describe("Input staging and teardown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphInstances.length = 0;
    cleanup();
  });

  const spec: GraphSpec = {
    nodes: [
      {
        id: "const",
        type: "constant",
        params: { value: { float: 1 } },
        inputs: {},
        output_shapes: {},
      },
    ],
  };
  const specJson = JSON.stringify(spec);

  it("staging with immediateEval triggers evalAll on graph", async () => {
    let runtimeRef: any = null;

    const Consumer: React.FC = () => {
      const rt = useGraphRuntime();
      runtimeRef = rt;
      return <div data-testid="ready">{String(rt.ready)}</div>;
    };

    render(
      <GraphProvider spec={specJson} autoStart={false}>
        <Consumer />
      </GraphProvider>,
    );

    // Wait for provider to initialize and load the graph
    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    // There should be one graph instance constructed
    expect(graphInstances.length).toBeGreaterThanOrEqual(1);
    const g = graphInstances[0];

    // Stage an input with immediateEval true via runtime API (wrap in act to avoid update warnings)
    act(() => {
      runtimeRef.stageInput(
        "robot/Head.Look",
        { float: 0.75 },
        undefined,
        true,
      );
    });

    // Expect stageInput was called on the graph and evalAll was invoked
    await waitFor(() => {
      expect(g.stageInput).toHaveBeenCalledWith(
        "robot/Head.Look",
        { float: 0.75 },
        undefined,
      );
      expect(g.evalAll).toHaveBeenCalled();
    });
  });

  it("teardown frees the graph on unmount", async () => {
    const Consumer: React.FC = () => {
      const rt = useGraphRuntime();
      return <div data-testid="ready">{String(rt.ready)}</div>;
    };

    const { unmount } = render(
      <GraphProvider spec={specJson} autoStart={false}>
        <Consumer />
      </GraphProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    expect(graphInstances.length).toBeGreaterThanOrEqual(1);
    const g = graphInstances[0];

    // Unmount provider and ensure graph.free was called
    unmount();

    await waitFor(() => {
      expect(g.free).toHaveBeenCalled();
    });
  });
});
