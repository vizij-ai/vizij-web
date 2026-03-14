import { describe, expect, it } from "vitest";
import type { GraphAsset, SimpleAnimationClip } from "../state/types";
import {
  buildAnimationBridgeGraph,
  buildUiBridgeGraph,
  collectOutputPaths,
  extractRigInputs,
  type RigDefinition,
} from "./useOrchestratorMerging";

describe("useOrchestratorMerging helpers", () => {
  const graph: GraphAsset = {
    id: "test-rig",
    label: "Test Rig",
    fileName: "test.rig.json",
    spec: {
      nodes: [
        {
          id: "input-1",
          type: "Input",
          params: { path: "rig/face/poses/smile", value: { float: 0 } },
        },
        {
          id: "input-2",
          type: "Input",
          params: { path: "rig/face/controls/brow", value: 0.5 },
        },
        {
          id: "out-1",
          type: "Output",
          params: { path: "rig/face/poses/smile" },
          inputs: { in: "input-1" },
        },
        {
          id: "out-2",
          type: "Output",
          params: { path: "rig/face/controls/brow" },
          inputs: { in: "input-2" },
        },
      ],
      edges: [],
    },
    updatedAt: new Date().toISOString(),
  };

  const rigDefinition: RigDefinition = {
    id: graph.id,
    label: graph.label,
    inputs: extractRigInputs(graph),
    source: graph,
  };

  it("extractRigInputs derives UI paths and groups", () => {
    expect(rigDefinition.inputs).toHaveLength(2);
    const smile = rigDefinition.inputs.find((input) =>
      input.path.endsWith("smile"),
    );
    expect(smile).toBeDefined();
    expect(smile?.uiPath).toBe("ui/test-rig/poses/smile");
    expect(smile?.groupKey).toBe("poses");
    expect(smile?.groupLabel).toBe("Poses");
  });

  it("buildUiBridgeGraph wires inputs and outputs", () => {
    const bridge = buildUiBridgeGraph(rigDefinition);
    expect(bridge).not.toBeNull();
    expect(bridge?.subs?.inputs).toEqual([
      "ui/test-rig/poses/smile",
      "ui/test-rig/controls/brow",
    ]);
    expect(bridge?.subs?.outputs).toEqual([
      "rig/face/poses/smile",
      "rig/face/controls/brow",
    ]);
  });

  it("collectOutputPaths lists graph outputs", () => {
    expect(collectOutputPaths(graph)).toEqual([
      "rig/face/poses/smile",
      "rig/face/controls/brow",
    ]);
  });

  it("buildAnimationBridgeGraph mirrors animation tracks", () => {
    const clip: SimpleAnimationClip = {
      id: "clip-1",
      name: "Test Clip",
      duration: 1,
      tracks: [
        {
          channel: "rig/face/poses/smile",
          keyframes: [
            { time: 0, value: 0 },
            { time: 1, value: 1 },
          ],
        },
      ],
    };
    const bridge = buildAnimationBridgeGraph(clip);
    expect(bridge).not.toBeNull();
    expect(bridge?.subs?.inputs).toEqual([
      "animation/clip-1/rig/face/poses/smile",
    ]);
    expect(bridge?.subs?.outputs).toEqual(["rig/face/poses/smile"]);
  });
});
