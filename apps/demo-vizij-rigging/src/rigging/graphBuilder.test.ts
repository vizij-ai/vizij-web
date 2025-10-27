import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import { buildPoseGraphSpec } from "./graphBuilder";
import type { StandardRigInput } from "@vizij/utils";

function makeStandardInput(
  overrides: Partial<StandardRigInput> = {},
): StandardRigInput {
  return {
    id: "standard_mouth_pos_x",
    path: "/standard/mouth/pos/x",
    label: "Mouth Pos X",
    group: "mouth",
    defaultValue: 0,
    range: { min: -1, max: 1 },
    ...overrides,
  };
}

describe("buildPoseGraphSpec", () => {
  it("builds a default-blend graph with pose weights per channel", () => {
    const standardInputs: StandardRigInput[] = [
      makeStandardInput({
        id: "standard_mouth_pos_x",
        path: "/standard/mouth/pos/x",
        defaultValue: 0.1,
      }),
      makeStandardInput({
        id: "standard_left_eye_pos_y",
        path: "/standard/left_eye/pos/y",
        label: "Left Eye Pos Y",
        group: "left_eye",
      }),
    ];

    const now = new Date().toISOString();
    const { spec, summary } = buildPoseGraphSpec({
      faceId: "rig_face",
      neutralInputs: { standard_mouth_pos_x: 0.05 },
      emotions: [
        {
          id: "happy",
          name: "Happy Pose",
          description: "",
          values: { standard_mouth_pos_x: 0.8 },
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sad",
          name: "SAD FACE",
          description: "",
          values: {},
          createdAt: now,
          updatedAt: now,
        },
      ],
      standardInputs,
    });

    const blendNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]): node is GraphSpec["nodes"][number] =>
        node.id === "pose_blend",
    );
    expect(blendNode?.type).toBe("default-blend");

    const happyInputNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]): node is GraphSpec["nodes"][number] =>
        node.id === "emotion_happy",
    );
    expect(happyInputNode?.params?.path).toBe(
      "rig/rig_face/poses/happy_pose.weight",
    );

    const outputNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]): node is GraphSpec["nodes"][number] =>
        node.id === "out_standard_mouth_pos_x",
    );
    expect(outputNode?.params?.path).toBe("rig/rig_face/standard/mouth/pos/x");

    const offsetNode = spec.nodes.find(
      (node: GraphSpec["nodes"][number]): node is GraphSpec["nodes"][number] =>
        node.id === "pose_offset_zero",
    );
    expect(offsetNode?.params?.value?.record?.values?.record).toEqual({
      standard_left_eye_pos_y: { float: 0 },
      standard_mouth_pos_x: { float: 0 },
    });

    const weightsJoin = spec.nodes.find(
      (node: GraphSpec["nodes"][number]): node is GraphSpec["nodes"][number] =>
        node.id === "pose_weights_join",
    );
    expect(weightsJoin?.type).toBe("join");
    const edges = spec.edges ?? [];
    expect(
      edges.filter(
        (
          edge: NonNullable<GraphSpec["edges"]>[number],
        ): edge is NonNullable<GraphSpec["edges"]>[number] =>
          edge.to.node_id === "pose_weights_join" &&
          edge.to.input.startsWith("operand_"),
      ).length,
    ).toBe(2);
    expect(
      edges.some(
        (
          edge: NonNullable<GraphSpec["edges"]>[number],
        ): edge is NonNullable<GraphSpec["edges"]>[number] =>
          edge.from.node_id === "emotion_happy" &&
          edge.to.node_id === "pose_weights_join",
      ),
    ).toBe(true);

    const baselineEdge = edges.find(
      (
        edge: NonNullable<GraphSpec["edges"]>[number],
      ): edge is NonNullable<GraphSpec["edges"]>[number] =>
        edge.from.node_id === "pose_neutral_record" &&
        edge.to.node_id === "pose_blend" &&
        edge.to.input === "baseline",
    );
    expect(baselineEdge).toBeDefined();

    const operandEdge = edges.find(
      (
        edge: NonNullable<GraphSpec["edges"]>[number],
      ): edge is NonNullable<GraphSpec["edges"]>[number] =>
        edge.from.node_id === "pose_record_happy" &&
        edge.to.node_id === "pose_blend" &&
        edge.to.input === "operand_1",
    );
    expect(operandEdge).toBeDefined();

    const outputEdge = edges.find(
      (
        edge: NonNullable<GraphSpec["edges"]>[number],
      ): edge is NonNullable<GraphSpec["edges"]>[number] =>
        edge.to.node_id === "out_standard_mouth_pos_x" &&
        edge.to.input === "in",
    );
    expect(outputEdge?.selector).toEqual([
      { field: "values" },
      { field: "standard_mouth_pos_x" },
    ]);

    expect(summary.outputs).toContain("/standard/mouth/pos/x");
    expect(summary.inputs[0]?.contributions).toHaveLength(1);
    expect(summary.inputs[0]?.contributions[0]).toMatchObject({
      emotionId: "happy",
      emotionName: "Happy Pose",
      value: 0.8,
    });
  });

  it("omits channels that never diverge from neutral", () => {
    const standardInputs: StandardRigInput[] = [
      makeStandardInput({
        id: "standard_mouth_pos_x",
        path: "/standard/mouth/pos/x",
        defaultValue: 0,
      }),
    ];
    const now = new Date().toISOString();
    const { spec, summary } = buildPoseGraphSpec({
      faceId: "rig_face",
      neutralInputs: { standard_mouth_pos_x: 0 },
      emotions: [
        {
          id: "still",
          name: "Still",
          description: "",
          values: {},
          createdAt: now,
          updatedAt: now,
        },
      ],
      standardInputs,
    });

    expect(
      spec.nodes.some(
        (
          node: GraphSpec["nodes"][number],
        ): node is GraphSpec["nodes"][number] =>
          node.id === "out_standard_mouth_pos_x",
      ),
    ).toBe(false);
    expect(summary.outputs).not.toContain("/standard/mouth/pos/x");
    expect(summary.inputs).toHaveLength(0);
  });
});
