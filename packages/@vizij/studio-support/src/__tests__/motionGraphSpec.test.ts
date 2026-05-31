import { describe, expect, it } from "vitest";
import {
  buildGraphSpec,
  buildGraphSpecForExport,
  MOTION_GRAPH_INPUT_SOURCE_PORT_ID,
  MOTION_GRAPH_INPUT_SOURCE_TYPE,
  MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
  MOTION_GRAPH_OUTPUT_TARGET_TYPE,
  type MotionGraphEditorEdge,
  type MotionGraphEditorNode,
} from "../utils/motionGraphSpec";

describe("motion graph spec builder", () => {
  it("builds a namespaced graph from reachable editor nodes", () => {
    const nodes: MotionGraphEditorNode[] = [
      {
        id: "input-jaw",
        type: MOTION_GRAPH_INPUT_SOURCE_TYPE,
        position: { x: 0, y: 0 },
        data: { inputPath: "sensors/face/jaw_open", label: "jaw_open" },
      },
      {
        id: "multiply-1",
        type: "multiply",
        position: { x: 100, y: 0 },
        data: { params: { factor: "2" } },
      },
      {
        id: "target-jaw",
        type: MOTION_GRAPH_OUTPUT_TARGET_TYPE,
        position: { x: 200, y: 0 },
        data: {
          outputPath: "rig/face/standard/vizij/mouth/morph/jaw_open",
          label: "jaw_open",
        },
      },
      {
        id: "unconnected",
        type: "constant",
        position: { x: 100, y: 100 },
        data: { params: { value: 1 } },
      },
    ];
    const edges: MotionGraphEditorEdge[] = [
      {
        id: "e-input-multiply",
        source: "input-jaw",
        target: "multiply-1",
        sourceHandle: MOTION_GRAPH_INPUT_SOURCE_PORT_ID,
        targetHandle: "value",
      },
      {
        id: "e-multiply-target",
        source: "multiply-1",
        target: "target-jaw",
        sourceHandle: "result",
        targetHandle: MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
      },
    ];

    const built = buildGraphSpec(nodes, edges, "face-1");

    expect(built.hasConnectedOutputs).toBe(true);
    expect(built.outputPaths).toEqual([
      "face-1/rig/face/standard/vizij/mouth/morph/jaw_open",
    ]);
    expect(built.inputPaths).toEqual(["face-1/sensors/face/jaw_open"]);
    expect(built.spec.nodes).toEqual([
      {
        id: "input-jaw",
        type: "input",
        params: { path: "face-1/sensors/face/jaw_open" },
      },
      {
        id: "multiply-1",
        type: "multiply",
        params: { factor: 2 },
      },
      {
        id: "target-jaw",
        type: "output",
        params: {
          path: "face-1/rig/face/standard/vizij/mouth/morph/jaw_open",
        },
      },
    ]);
    expect(built.spec.edges).toEqual([
      {
        from: { node_id: "input-jaw" },
        to: { node_id: "multiply-1", input: "value" },
      },
      {
        from: { node_id: "multiply-1", output: "result" },
        to: { node_id: "target-jaw", input: "in" },
      },
    ]);
    expect(built.spec.layout).toEqual({
      "input-jaw": { x: 0, y: 0 },
      "multiply-1": { x: 100, y: 0 },
      "target-jaw": { x: 200, y: 0 },
    });
  });

  it("synthesizes constants for unconnected authored input defaults", () => {
    const nodes: MotionGraphEditorNode[] = [
      {
        id: "add-1",
        type: "add",
        position: { x: 100, y: 0 },
        data: {
          inputDefaults: {
            operand_0: "0.25",
            operand_1: "0.68",
          },
        },
      },
      {
        id: "target",
        type: MOTION_GRAPH_OUTPUT_TARGET_TYPE,
        position: { x: 200, y: 0 },
        data: { outputPath: "rig/face/poses/neutral.weight", label: "neutral" },
      },
    ];
    const edges: MotionGraphEditorEdge[] = [
      {
        id: "e-add-target",
        source: "add-1",
        target: "target",
        targetHandle: MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
      },
    ];

    const built = buildGraphSpec(nodes, edges, "face-1");

    expect(built.spec.nodes).toContainEqual({
      id: "__const_add-1_operand_0",
      type: "constant",
      params: { value: 0.25 },
    });
    expect(built.spec.nodes).toContainEqual({
      id: "__const_add-1_operand_1",
      type: "constant",
      params: { value: 0.68 },
    });
    expect(built.spec.edges).toContainEqual({
      from: { node_id: "__const_add-1_operand_0" },
      to: { node_id: "add-1", input: "operand_0" },
    });
    expect(built.spec.edges).toContainEqual({
      from: { node_id: "__const_add-1_operand_1" },
      to: { node_id: "add-1", input: "operand_1" },
    });
  });

  it("exports portable graph specs without applying a runtime namespace", () => {
    const nodes: MotionGraphEditorNode[] = [
      {
        id: "target",
        type: MOTION_GRAPH_OUTPUT_TARGET_TYPE,
        position: { x: 10, y: 20 },
        data: { outputPath: "rig/face/poses/smile.weight", label: "smile" },
      },
      {
        id: "constant",
        type: "constant",
        position: { x: -10, y: 20 },
        data: { params: { value: "1" } },
      },
    ];
    const edges: MotionGraphEditorEdge[] = [
      {
        id: "e-constant-target",
        source: "constant",
        target: "target",
        targetHandle: MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
      },
    ];

    const spec = buildGraphSpecForExport(nodes, edges);

    expect(spec.nodes).toContainEqual({
      id: "target",
      type: "output",
      params: { path: "rig/face/poses/smile.weight" },
    });
    expect(spec.nodes).toContainEqual({
      id: "constant",
      type: "constant",
      params: { value: 1 },
    });
    expect(spec.layout).toEqual({
      target: { x: 10, y: 20 },
      constant: { x: -10, y: 20 },
    });
  });
});
