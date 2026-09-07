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

const setGraphBundleSpy = vi.fn();
const stopProgramSpy = vi.fn();
const playProgramSpy = vi.fn();

/**
 * The provider hands out a *new* function for each of these on every render —
 * `stopProgram` is memoized on `assetBundle.programs`, and publishing replaces
 * that array — so the mock rebuilds them on every call, which is what the
 * driver has to tolerate.
 */
vi.mock("@vizij/runtime-react", () => ({
  useVizijRuntime: () => ({
    ready: true,
    assetBundle: { programs: [{ id: "program-under-test" }] },
    setGraphBundle: (...args: unknown[]) => setGraphBundleSpy(...args),
    playProgram: (...args: unknown[]) => playProgramSpy(...args),
    stopProgram: (...args: unknown[]) => stopProgramSpy(...args),
    getProgramState: () => ({ state: "playing" as const }),
  }),
}));

function graph(): { nodes: EditorNode[]; edges: EditorEdge[] } {
  return {
    nodes: [
      {
        id: "source",
        type: INPUT_SOURCE_TYPE,
        position: { x: 0, y: 0 },
        data: { inputPath: "standard/jaw/open" },
      },
      {
        id: "target",
        type: OUTPUT_TARGET_TYPE,
        position: { x: 200, y: 0 },
        data: { outputPath: "standard/jaw/open" },
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
  controllers,
}: {
  nodes: EditorNode[];
  edges: EditorEdge[];
  controllers: unknown;
}) {
  useMotionGraphDriver(
    "default",
    "program-under-test",
    controllers,
    nodes,
    edges,
  );
  return null;
}

describe("useMotionGraphDriver", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setGraphBundleSpy.mockClear();
    stopProgramSpy.mockClear();
    playProgramSpy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function renderDriver(props: {
    nodes: EditorNode[];
    edges: EditorEdge[];
    controllers: unknown;
  }) {
    act(() => {
      root.render(<Harness {...props} />);
    });
  }

  it("publishes the editor graph once", () => {
    const { nodes, edges } = graph();
    renderDriver({ nodes, edges, controllers: { graphs: ["rig"], anims: [] } });

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);
    expect(setGraphBundleSpy.mock.calls[0]![0]).toMatchObject({
      programs: [{ id: "program-under-test" }],
    });
    expect(stopProgramSpy).not.toHaveBeenCalled();
  });

  it("does not republish, or tear the program down, when only identities change", () => {
    // Every input is a fresh object with identical contents — one re-render's
    // worth of React Flow rewriting the node array, plus the runtime rebuilding
    // its `controllers` object and its methods. None of it is a change the
    // runtime needs to hear about.
    //
    // Before this was guarded, each re-render ran the unmount cleanup (which
    // stopped the program and cleared the bundle) and then re-published it:
    // measured in the app, 561 publishes and 561 teardowns in a few seconds,
    // ending in React's "Maximum update depth exceeded" and a blank page.
    const first = graph();
    renderDriver({
      nodes: first.nodes,
      edges: first.edges,
      controllers: { graphs: ["rig"], anims: [] },
    });
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    for (let pass = 0; pass < 5; pass += 1) {
      const next = graph();
      renderDriver({
        nodes: next.nodes,
        edges: next.edges,
        controllers: { graphs: ["rig"], anims: [] },
      });
    }

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);
    expect(stopProgramSpy).not.toHaveBeenCalled();
  });

  it("republishes when the graph itself changes", () => {
    const { nodes, edges } = graph();
    renderDriver({ nodes, edges, controllers: { graphs: [], anims: [] } });
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    const edited = graph();
    edited.nodes[1]!.data = { outputPath: "standard/brow/raise" };
    renderDriver({
      nodes: edited.nodes,
      edges: edited.edges,
      controllers: { graphs: [], anims: [] },
    });

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);
  });

  it("republishes when the runtime reports different controllers", () => {
    // The resync signal's purpose: the runtime cleared and re-registered its
    // own graphs, so the program has to be asserted again.
    const { nodes, edges } = graph();
    renderDriver({ nodes, edges, controllers: { graphs: [], anims: [] } });
    expect(setGraphBundleSpy).toHaveBeenCalledTimes(1);

    renderDriver({
      nodes,
      edges,
      controllers: { graphs: ["rig", "pose"], anims: [] },
    });

    expect(setGraphBundleSpy).toHaveBeenCalledTimes(2);
  });
});
