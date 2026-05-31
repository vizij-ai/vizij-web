import { describe, expect, it } from "vitest";
import type { GraphSpec } from "@vizij/node-graph-wasm";
import {
  listPoseGraphOutputs,
  remapPoseGraphInputs,
  updatePoseGraphOutputPath,
} from "../utils/poseGraphImport";

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
});
