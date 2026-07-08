import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import type { StandardRigInput } from "@vizij/utils";
import { cloneDeepSafe } from "@vizij/utils";
import {
  buildPoseGraphRemapApplyPlan,
  resolvePoseGraphSourceInputId,
} from "../usePoseGraphImport";

describe("resolvePoseGraphSourceInputId", () => {
  it("prefers currentInputId when available", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: "legacy/input/id",
        poseSlug: "legacy_input_id",
      }),
    ).toBe("legacy/input/id");
  });

  it("falls back to poseSlug when no currentInputId is present", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: null,
        poseSlug: "legacy_input_id",
      }),
    ).toBe("legacy_input_id");
  });

  it("returns null when both ids are missing", () => {
    expect(
      resolvePoseGraphSourceInputId({
        currentInputId: "   ",
        poseSlug: "",
      }),
    ).toBeNull();
  });
});

describe("buildPoseGraphRemapApplyPlan", () => {
  const standardInput: StandardRigInput = {
    id: "jaw_open",
    path: "/standard/face/jaw/open",
    label: "Jaw Open",
    group: "standard",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  };

  it("returns conflict without mutating the original spec", () => {
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
          id: "row_a",
          nodeId: "out_pose_a",
          originalPath: "rig/old/a",
          suggestedPath: "/standard/face/jaw/open",
          currentInputId: "legacy_a",
          status: "review",
        },
        {
          id: "row_b",
          nodeId: "out_pose_b",
          originalPath: "rig/old/b",
          suggestedPath: "/standard/face/jaw/open",
          currentInputId: "legacy_b",
          status: "review",
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

  it("produces a cloned spec with updated output paths and remapped input ids", () => {
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
          id: "row_a",
          nodeId: "out_pose_a",
          originalPath: "rig/old/a",
          suggestedPath: "/standard/face/jaw/open",
          currentInputId: "legacy_jaw_open",
          status: "review",
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
