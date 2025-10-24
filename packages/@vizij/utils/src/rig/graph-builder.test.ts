import { describe, expect, it } from "vitest";

import type { RigDriverGraph } from "./drivers";
import { buildGraphFromDrivers } from "./graph-builder";

const STANDARD_INPUTS = [
  {
    id: "mouth_pos_x",
    path: "/mouth/pos/x",
    label: "Mouth Pos X",
    group: "mouth",
    defaultValue: 0,
    range: { min: -1, max: 1 },
  },
];

describe("buildGraphFromDrivers", () => {
  it("builds a centered remap graph for a single driver", () => {
    const graph: RigDriverGraph = {
      faceId: "robot",
      drivers: [
        {
          id: "remap:jaw_open",
          kind: "remap",
          source: {
            type: "standard-input",
            id: "mouth_pos_x",
            path: "/mouth/pos/x",
            label: "Mouth Pos X",
          },
          outputs: [
            {
              target: {
                type: "animatable",
                id: "rig/robot/jaw/open",
                path: "rig/robot/jaw/open",
                label: "Jaw Open",
              },
              transform: {
                type: "centered-remap",
                inLow: -1,
                inAnchor: 0,
                inHigh: 1,
                outLow: 0,
                outAnchor: 0.5,
                outHigh: 1,
              },
            },
          ],
        },
      ],
      standardInputs: STANDARD_INPUTS,
    };

    const spec = buildGraphFromDrivers({ driverGraph: graph });

    expect(spec.nodes.some((node) => node.type === "input")).toBe(true);
    expect(spec.nodes.some((node) => node.type === "centered_remap")).toBe(
      true,
    );
    const outputNode = spec.nodes.find((node) => node.type === "output");
    expect(outputNode?.params).toMatchObject({ path: "rig/robot/jaw/open" });
  });

  it("creates blend nodes when multiple drivers target the same rig input", () => {
    const graph: RigDriverGraph = {
      faceId: "robot",
      drivers: [
        {
          id: "remap:brow",
          kind: "remap",
          source: {
            type: "standard-input",
            id: "mouth_pos_x",
            path: "/mouth/pos/x",
          },
          outputs: [
            {
              target: {
                type: "rig-input",
                id: "mouth_pos_x",
                path: "rig/robot/mouth/pos/x",
              },
              transform: {
                type: "centered-remap",
                inLow: -1,
                inAnchor: 0,
                inHigh: 1,
                outLow: -0.5,
                outAnchor: 0,
                outHigh: 0.5,
              },
            },
          ],
        },
        {
          id: "pose:happy",
          kind: "pose",
          source: {
            type: "pose-weight",
            id: "happy",
            path: "rig/robot/poses/happy.weight",
          },
          outputs: [
            {
              target: {
                type: "rig-input",
                id: "mouth_pos_x",
                path: "rig/robot/mouth/pos/x",
              },
              transform: {
                type: "pose-delta",
                neutral: 0,
                value: 0.8,
                delta: 0.8,
              },
            },
          ],
        },
      ],
      standardInputs: STANDARD_INPUTS,
    };

    const spec = buildGraphFromDrivers({ driverGraph: graph });

    expect(spec.nodes.some((node) => node.type === "default-blend")).toBe(true);
    const outputNode = spec.nodes.find(
      (node) =>
        node.type === "output" && node.params?.path === "rig/robot/mouth/pos/x",
    );
    expect(outputNode).toBeDefined();
  });
});
