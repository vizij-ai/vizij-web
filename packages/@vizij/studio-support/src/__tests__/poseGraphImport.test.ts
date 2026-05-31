import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { cloneDeepSafe } from "@vizij/utils";
import {
  buildPoseGraphRemapApplyPlan,
  collectPoseGraphDeltaInputs,
  listPoseGraphOutputs,
  remapPoseGraphInputIds,
  remapPoseGraphInputs,
  resolvePoseGraphSourceInputId,
  updatePoseGraphOutputPath,
} from "../utils/poseGraphImport";

function buildRecord(values: Record<string, number>) {
  return {
    record: {
      values: {
        record: Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, { float: value }]),
        ),
      },
    },
  };
}

describe("pose graph import helpers", () => {
  it("remaps input rig face segments without touching non-input nodes", () => {
    const spec = {
      nodes: [
        {
          id: "input_smile",
          type: "input",
          params: { path: "rig/legacy_face/pose/smile" },
        },
        {
          id: "const",
          type: "constant",
          params: { path: "rig/legacy_face/pose/ignored" },
        },
      ],
    } as GraphSpec;

    remapPoseGraphInputs(spec, "current_face");

    expect(spec.nodes?.[0]?.params).toEqual({
      path: "rig/current_face/pose/smile",
    });
    expect(spec.nodes?.[1]?.params).toEqual({
      path: "rig/legacy_face/pose/ignored",
    });
  });

  it("lists output paths and selector-derived input ids", () => {
    const spec = {
      nodes: [
        {
          id: "out_smile",
          type: "output",
          params: { path: "rig/face/pose/smile" },
        },
      ],
      edges: [
        {
          from: { node_id: "pose_delta" },
          to: { node_id: "out_smile" },
          selector: [{ field: "pose_smile" }],
        },
      ],
    } as unknown as GraphSpec;

    expect(listPoseGraphOutputs(spec)).toEqual([
      {
        nodeId: "out_smile",
        path: "rig/face/pose/smile",
        inputId: "pose_smile",
      },
    ]);
  });

  it("updates an output path by node id", () => {
    const spec = {
      nodes: [
        {
          id: "out_smile",
          type: "output",
          params: { path: "rig/face/pose/smile" },
        },
      ],
    } as GraphSpec;

    updatePoseGraphOutputPath(spec, "out_smile", "rig/face/pose/happy");

    expect(spec.nodes?.[0]?.params).toEqual({
      path: "rig/face/pose/happy",
    });
  });

  it("collects pose graph inputs that differ from neutral values", () => {
    const spec = {
      nodes: [
        {
          id: "pose_neutral_record",
          type: "constant",
          params: { value: buildRecord({ jaw_open: 0, blink: 1 }) },
        },
        {
          id: "pose_record_smile",
          type: "constant",
          params: { value: buildRecord({ jaw_open: 0.75, blink: 1 }) },
        },
      ],
    } as GraphSpec;

    expect(Array.from(collectPoseGraphDeltaInputs(spec))).toEqual(["jaw_open"]);
  });

  it("rewrites pose input record keys, entry arrays, and selectors", () => {
    const spec: GraphSpec = {
      nodes: [
        {
          id: "pose_neutral_record",
          type: "constant",
          params: {
            value: buildRecord({ foo: 0, keep: 1 }),
          },
        },
        {
          id: "pose_record_pose_a",
          type: "constant",
          params: {
            value: {
              record: {
                values: {
                  entries: [
                    { key: "foo", value: { float: 0.5 } },
                    { key: "keep", value: { float: 0 } },
                  ],
                },
              },
            },
          },
        },
      ],
      edges: [
        {
          from: { node_id: "pose_blend" },
          to: { node_id: "out_pose_a", input: "in" },
          selector: [{ field: "values" }, { field: "foo" }],
        },
      ],
    };

    remapPoseGraphInputIds(spec, [{ fromId: "foo", toId: "bar" }]);

    const neutralRecord = (spec.nodes?.[0]?.params as { value?: any }).value
      .record.values.record;
    expect(Object.keys(neutralRecord)).toContain("bar");
    expect(neutralRecord.bar).toEqual({ float: 0 });
    expect(neutralRecord.keep).toEqual({ float: 1 });

    const entries = (spec.nodes?.[1]?.params as { value?: any }).value.record
      .values.entries;
    expect(entries?.[0]?.key).toBe("bar");
    expect(entries?.[1]?.key).toBe("keep");

    const selector = spec.edges?.[0]?.selector;
    expect(selector?.[1]).toEqual({ field: "bar" });
  });

  it("ignores pose input remaps with empty or matching identifiers", () => {
    const spec: GraphSpec = {
      nodes: [],
    };
    remapPoseGraphInputIds(spec, [
      { fromId: "", toId: "bar" },
      { fromId: "baz", toId: "baz" },
    ]);
    expect(spec.nodes).toEqual([]);
  });

  it("resolves source input ids from current ids before pose slugs", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: "legacy/input/id",
        poseSlug: "legacy_input_id",
      }),
    ).toBe("legacy/input/id");
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: null,
        poseSlug: "legacy_input_id",
      }),
    ).toBe("legacy_input_id");
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: "   ",
        poseSlug: "",
      }),
    ).toBeNull();
  });

  it("returns a remap conflict without mutating the original spec", () => {
    const standardInput: StandardRigInput = {
      id: "jaw_open",
      path: "/standard/face/jaw/open",
      label: "Jaw Open",
      group: "standard",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };
    const spec: GraphSpec = {
      nodes: [
        { id: "out_pose_a", type: "output", params: { path: "rig/old/a" } },
        { id: "out_pose_b", type: "output", params: { path: "rig/old/b" } },
      ],
      edges: [],
    } as GraphSpec;
    const before = cloneDeepSafe(spec);

    const plan = buildPoseGraphRemapApplyPlan({
      spec,
      rows: [
        {
          nodeId: "out_pose_a",
          suggestedPath: "/standard/face/jaw/open",
          currentInputId: "legacy_a",
        },
        {
          nodeId: "out_pose_b",
          suggestedPath: "/standard/face/jaw/open",
          currentInputId: "legacy_b",
        },
      ],
      standardInputsByPath: new Map([
        ["/standard/face/jaw/open", standardInput],
      ]),
      faceSegment: "robot",
    });

    expect(plan.status).toBe("conflict");
    expect(spec).toEqual(before);
  });

  it("builds a cloned pose graph remap spec with updated outputs and ids", () => {
    const standardInput: StandardRigInput = {
      id: "jaw_open",
      path: "/standard/face/jaw/open",
      label: "Jaw Open",
      group: "standard",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };
    const spec: GraphSpec = {
      nodes: [
        { id: "out_pose_a", type: "output", params: { path: "rig/old/a" } },
      ],
      edges: [
        {
          from: { node_id: "pose_value", output_index: 0 },
          to: { node_id: "out_pose_a", input_index: 0 },
          selector: [{ field: "legacy_jaw_open" }],
        },
      ],
    } as GraphSpec;

    const plan = buildPoseGraphRemapApplyPlan({
      spec,
      rows: [
        {
          nodeId: "out_pose_a",
          suggestedPath: "/standard/face/jaw/open",
          currentInputId: "legacy_jaw_open",
        },
      ],
      standardInputsByPath: new Map([
        ["/standard/face/jaw/open", standardInput],
      ]),
      faceSegment: "robot",
    });

    expect(plan.status).toBe("ready");
    if (plan.status !== "ready") {
      return;
    }

    const outputNode = (plan.spec.nodes ?? []).find(
      (node: { id?: string }) => node.id === "out_pose_a",
    );
    expect((outputNode?.params as { path?: string } | undefined)?.path).toBe(
      "rig/robot/standard/face/jaw/open",
    );
    expect(plan.spec).not.toBe(spec);
    expect(
      ((plan.spec.edges ?? [])[0] as { selector?: Array<{ field?: string }> })
        .selector?.[0]?.field,
    ).toBe("jaw_open");
  });
});
