import React, { useEffect } from "react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import {
  GraphProvider,
  useGraphPlayback,
  useGraphOutputs,
  useGraphRuntime,
  valueAsNumber,
} from "../index";
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
    createGraph: vi.fn(async (spec: GraphSpec | string) => makeInstance()),
    Graph: vi.fn(() => makeInstance()),
    normalizeGraphSpec: vi.fn(async (spec: GraphSpec | string) => spec),
    getNodeSchemas: vi.fn(() => Promise.resolve({ version: "1", nodes: [] })),
    get_node_schemas_json: vi.fn(() =>
      JSON.stringify({ version: "1", nodes: [] }),
    ),
    normalize_graph_spec_json: vi.fn((json: string) => json),
  };
});

describe("Playback & Selectors", () => {
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

  it("useGraphPlayback can start/stop and reflect mode", async () => {
    const PlaybackConsumer: React.FC = () => {
      const pb = useGraphPlayback();
      const rt = useGraphRuntime();

      return (
        <div>
          <button
            data-testid="start-interval"
            onClick={() => pb.start("interval", 10)}
          >
            start interval
          </button>
          <button data-testid="stop" onClick={() => pb.stop()}>
            stop
          </button>
          <span data-testid="mode">{String(rt.getPlaybackMode?.())}</span>
        </div>
      );
    };

    render(
      <GraphProvider spec={specJson} autoStart={false}>
        <PlaybackConsumer />
      </GraphProvider>,
    );

    await waitFor(() => {
      // provider initialized
      expect(screen.getByTestId("mode").textContent).toBe("manual");
    });

    fireEvent.click(screen.getByTestId("start-interval"));
    await waitFor(() => {
      expect(screen.getByTestId("mode").textContent).toBe("interval");
    });

    fireEvent.click(screen.getByTestId("stop"));
    await waitFor(() => {
      // stop returns to manual mode in this provider implementation
      expect(screen.getByTestId("mode").textContent).toBe("manual");
    });
  });

  it("useGraphOutputs selector returns node output and updates after load", async () => {
    const SelectorConsumer: React.FC = () => {
      const val = useGraphOutputs(
        (snap) => snap?.evalResult?.nodes?.const?.out ?? null,
      );
      const num = valueAsNumber(val);
      return <span data-testid="sel">{String(num ?? "")}</span>;
    };

    render(
      <GraphProvider spec={specJson} autoStart={false}>
        <SelectorConsumer />
      </GraphProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sel").textContent).toBe("2");
    });
  });
});
