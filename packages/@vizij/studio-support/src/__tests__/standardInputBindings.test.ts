import { describe, expect, it } from "vitest";
import {
  analyzeStandardInputBindings,
  extractBindingsFromBundle,
  getInputIdsWithBindings,
} from "../index";

describe("standard input binding helpers", () => {
  it("extracts bound standard input nodes from a rig graph", () => {
    const bindings = analyzeStandardInputBindings({
      nodes: [
        {
          id: "input_left_eye",
          type: "input",
          params: { path: "rig/face/standard/left_eye/pos/x" },
        },
        {
          id: "input_right_eye",
          type: "input",
          params: { path: "rig/face/standard/right_eye/pos/x" },
        },
        {
          id: "custom",
          type: "input",
          params: { path: "rig/face/custom/value" },
        },
      ],
      edges: [
        {
          from: { node_id: "input_left_eye", output: "value" },
          to: { node_id: "driver", input: "value" },
        },
      ],
    });

    expect(bindings.get("standard_left_eye_pos_x")).toMatchObject({
      path: "/standard/left_eye/pos/x",
      nodeId: "input_left_eye",
      hasBinding: true,
      connectionCount: 1,
    });
    expect(bindings.get("standard_right_eye_pos_x")).toMatchObject({
      hasBinding: false,
      connectionCount: 0,
    });
    expect(getInputIdsWithBindings(bindings)).toEqual(
      new Set(["standard_left_eye_pos_x"]),
    );
  });

  it("prefers rig graphs when extracting binding info from a bundle", () => {
    const bindings = extractBindingsFromBundle({
      graphs: [
        {
          id: "pose",
          kind: "pose",
          spec: {
            nodes: [
              {
                id: "pose_input",
                type: "input",
                params: { path: "rig/face/standard/mouth/smile" },
              },
            ],
            edges: [],
          },
        },
        {
          id: "rig",
          kind: "rig",
          spec: {
            nodes: [
              {
                id: "rig_input",
                type: "input",
                params: { path: "rig/face/standard/brow/raise" },
              },
            ],
            edges: [
              {
                from: { node_id: "rig_input" },
                to: { node_id: "driver" },
              },
            ],
          },
        },
      ],
    } as any);

    expect(Array.from(bindings.keys())).toEqual(["standard_brow_raise"]);
    expect(getInputIdsWithBindings(bindings)).toEqual(
      new Set(["standard_brow_raise"]),
    );
  });
});
