import { describe, expect, it } from "vitest";
import { prepareRuntimeRegistrationPlan } from "../index";
import type { VizijAssetBundle } from "../types";

function makeBaseBundle(
  overrides: Partial<VizijAssetBundle> = {},
): VizijAssetBundle {
  return {
    namespace: "demo-face",
    faceId: "quori_latest",
    glb: {
      kind: "world",
      world: {},
      animatables: {},
      bundle: null,
    },
    bundle: null,
    ...overrides,
  };
}

describe("prepareRuntimeRegistrationPlan", () => {
  it("builds graph and animation controller inputs outside the React runtime host", () => {
    const plan = prepareRuntimeRegistrationPlan({
      assetBundle: makeBaseBundle({
        rig: {
          id: "rig",
          spec: {
            nodes: [
              {
                id: "input_blink",
                type: "input",
                params: { path: "rig/quori_latest/blink" },
              },
              {
                id: "pose_control_happy",
                type: "input",
                params: { path: "rig/quori_latest/pose/control/happy" },
              },
              {
                id: "out",
                type: "output",
                params: { path: "rig/quori_latest/blink/value" },
              },
            ],
            edges: [],
          },
        },
        pose: {
          graph: {
            id: "pose",
            spec: {
              nodes: [
                {
                  id: "pose-out",
                  type: "output",
                  params: { path: "rig/quori_latest/pose/control/happy" },
                },
              ],
              edges: [],
            },
          },
        },
        animations: [
          {
            id: "blink",
            clip: {
              id: "blink",
              duration: 1,
              tracks: [
                {
                  channel: "blink",
                  keyframes: [
                    { time: 0, value: 0 },
                    { time: 1, value: 1 },
                  ],
                },
              ],
            },
          },
        ],
      }),
      namespace: "demo-face",
      faceId: "quori_latest",
    });

    expect(plan.diagnostics).toEqual([]);
    expect(plan.graphConfigs.map((config) => config.id)).toEqual([
      "demo-face/graph/rig",
      "demo-face/graph/pose",
    ]);
    expect(plan.animationRegistrations).toHaveLength(1);
    expect(plan.animationRegistrations[0]?.assetId).toBe("blink");
    expect(plan.animationRegistrations[0]?.config).toMatchObject({
      id: "demo-face/animation/blink",
      setup: {
        animation: {
          id: "blink",
          formatVersion: 2,
        },
      },
    });
    expect(plan.rigInputMap).toMatchObject({
      blink: "rig/quori_latest/blink",
      happy: "rig/quori_latest/pose/control/happy",
    });
    expect(plan.rigPoseControlInputIds).toEqual(["happy"]);
    expect(plan.baseOutputPaths).toEqual([
      "rig/quori_latest/blink/value",
      "rig/quori_latest/pose/control/happy",
      "blink",
      "rig/quori_latest/blink",
    ]);
    expect(plan.namespacedOutputPaths).toEqual([
      "demo-face/rig/quori_latest/blink/value",
      "demo-face/rig/quori_latest/pose/control/happy",
      "demo-face/blink",
      "demo-face/rig/quori_latest/blink",
    ]);
  });

  it("returns structured diagnostics for unusable graph assets", () => {
    const plan = prepareRuntimeRegistrationPlan({
      assetBundle: makeBaseBundle({
        rig: { id: "rig" },
        pose: { graph: { id: "pose" } },
        programs: [{ id: "program", graph: { id: "program-graph" } }],
      }),
      namespace: "demo-face",
      faceId: "quori_latest",
    });

    expect(plan.graphConfigs).toEqual([]);
    expect(plan.diagnostics).toEqual([
      {
        level: "error",
        target: "rig",
        id: "rig",
        message: "Rig graph is missing a usable spec or IR payload.",
      },
      {
        level: "warn",
        target: "pose",
        id: "pose",
        message:
          "Pose graph is missing a usable spec or IR payload; skipping registration.",
      },
      {
        level: "warn",
        target: "program",
        id: "program",
        message: "Program program is missing a usable graph payload.",
      },
    ]);
  });
});
