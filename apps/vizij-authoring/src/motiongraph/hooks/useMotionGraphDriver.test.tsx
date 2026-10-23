import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorEdge, EditorNode } from "../store/useEditorStore";
import { INPUT_SOURCE_TYPE } from "../components/InputSourceNode";
import { OUTPUT_TARGET_TYPE } from "../components/OutputTargetNode";
import { useMotionGraphDriver } from "./useMotionGraphDriver";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const device = vi.hoisted(() => ({
  invoke: vi.fn(async (_method: string, _args: unknown) => ({ run: "run-1" })),
  applyGraphEdits: vi.fn(async (_edits: unknown) => undefined),
  halt: vi.fn(async (_run: string) => undefined),
}));
vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({ runtime: device }),
}));
const registry = vi.hoisted(() => ({
  /** The required inputs per node type the mocked registry states. */
  required: {} as Record<string, string[]>,
}));
vi.mock("../contexts/RegistryProvider", () => ({
  useRegistry: () => ({
    getPortsForType: (type: string) => ({
      inputs: (registry.required[type] ?? []).map((id) => ({ id })),
    }),
  }),
}));
vi.mock("@vizij/runtime", () => ({
  behaviorValue: vi.fn(async (graph: unknown) => ({ graph })),
  runEdits: vi.fn(async (run: string, from: unknown, to: unknown) => ({
    run,
    from,
    to,
  })),
}));

function graph(outputPath = "rig/face/standard/jaw/open"): {
  nodes: EditorNode[];
  edges: EditorEdge[];
} {
  return {
    nodes: [
      {
        id: "source",
        type: INPUT_SOURCE_TYPE,
        position: { x: 0, y: 0 },
        data: { inputPath: "rig/face/standard/jaw/open" },
      },
      {
        id: "target",
        type: OUTPUT_TARGET_TYPE,
        position: { x: 200, y: 0 },
        data: { outputPath },
      },
    ] as EditorNode[],
    edges: [
      {
        id: "source-target",
        source: "source",
        target: "target",
        sourceHandle: "output",
        targetHandle: "input",
      },
    ] as EditorEdge[],
  };
}

function Harness({
  nodes,
  edges,
}: {
  nodes: EditorNode[];
  edges: EditorEdge[];
}) {
  useMotionGraphDriver("program-under-test", nodes, edges);
  return null;
}

/** Let the driver's queued device calls run. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("useMotionGraphDriver", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    registry.required = {};
    device.invoke.mockClear();
    device.applyGraphEdits.mockClear();
    device.halt.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  async function renderDriver(props: {
    nodes: EditorNode[];
    edges: EditorEdge[];
  }) {
    act(() => {
      root.render(<Harness {...props} />);
    });
    await settle();
  }

  it("runs the editor's graph as a run named after its controller", async () => {
    const { nodes, edges } = graph();
    await renderDriver({ nodes, edges });

    expect(device.invoke).toHaveBeenCalledTimes(1);
    expect(device.invoke.mock.calls[0]![0]).toBe("run_behavior");
    expect(device.invoke.mock.calls[0]![1]).toMatchObject({
      name: "program-under-test",
    });
    expect(device.halt).not.toHaveBeenCalled();
  });

  it("neither restarts nor edits the run when only identities change", async () => {
    const first = graph();
    await renderDriver({ nodes: first.nodes, edges: first.edges });
    for (let pass = 0; pass < 5; pass += 1) {
      const next = graph();
      await renderDriver({ nodes: next.nodes, edges: next.edges });
    }
    expect(device.invoke).toHaveBeenCalledTimes(1);
    expect(device.applyGraphEdits).not.toHaveBeenCalled();
    expect(device.halt).not.toHaveBeenCalled();
  });

  it("edits the running run in place when the graph changes", async () => {
    const { nodes, edges } = graph();
    await renderDriver({ nodes, edges });
    const edited = graph("rig/face/standard/brow/raise");
    await renderDriver({ nodes: edited.nodes, edges: edited.edges });

    expect(device.invoke).toHaveBeenCalledTimes(1);
    expect(device.applyGraphEdits).toHaveBeenCalledTimes(1);
    expect(device.applyGraphEdits.mock.calls[0]![0]).toMatchObject({
      run: "run-1",
    });
  });

  it("keeps the run on its last complete graph while a required input is unwired", async () => {
    // A remap between source and target; its `in` is required.
    registry.required = { remap: ["in"] };
    const withRemap = (wired: boolean, outputPath?: string) => {
      const base = graph(outputPath);
      const remap = {
        id: "remap",
        type: "remap",
        position: { x: 100, y: 0 },
        data: {},
      } as unknown as EditorNode;
      return {
        nodes: [base.nodes[0]!, remap, base.nodes[1]!],
        edges: [
          ...(wired
            ? [
                {
                  id: "source-remap",
                  source: "source",
                  target: "remap",
                  sourceHandle: "output",
                  targetHandle: "in",
                },
              ]
            : []),
          {
            id: "remap-target",
            source: "remap",
            target: "target",
            sourceHandle: "out",
            targetHandle: "input",
          },
        ] as EditorEdge[],
      };
    };

    await renderDriver(withRemap(false));
    expect(device.invoke).not.toHaveBeenCalled();

    await renderDriver(withRemap(true));
    expect(device.invoke).toHaveBeenCalledTimes(1);

    await renderDriver(withRemap(false, "rig/face/standard/brow/raise"));
    expect(device.applyGraphEdits).not.toHaveBeenCalled();
    expect(device.halt).not.toHaveBeenCalled();
  });

  it("halts the run on unmount, leaving its outputs to the caller", async () => {
    const { nodes, edges } = graph();
    await renderDriver({ nodes, edges });
    act(() => {
      root.unmount();
    });
    await settle();
    expect(device.halt).toHaveBeenCalledWith("run-1");
  });
});
