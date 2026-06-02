import { describe, expect, it } from "vitest";
import {
  planRuntimeControllerRemoval,
  prepareRuntimeRegistrationPlan,
  summarizeRuntimeControllerRegistration,
} from "../index";
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
          inputMetadata: [
            {
              path: "rig/quori_latest/blink",
              defaultValue: 0.25,
              range: { min: 0, max: 1 },
            },
          ],
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
    const storedAnimation = plan.animationRegistrations[0]?.config.setup
      ?.animation as { tracks?: Array<{ animatableId?: string }> };
    expect(
      (storedAnimation.tracks ?? []).map((track) => track.animatableId).sort(),
    ).toEqual(["demo-face/blink", "demo-face/rig/quori_latest/blink"]);
    expect(plan.rigInputMap).toMatchObject({
      blink: "rig/quori_latest/blink",
      happy: "rig/quori_latest/pose/control/happy",
    });
    expect(plan.inputConstraints).toMatchObject({
      "demo-face/rig/quori_latest/blink": {
        min: 0,
        max: 1,
        defaultValue: 0.25,
      },
      "rig/quori_latest/blink": {
        min: 0,
        max: 1,
        defaultValue: 0.25,
      },
      blink: {
        min: 0,
        max: 1,
        defaultValue: 0.25,
      },
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

  it("preserves Studio animation setup fields in runtime registration", () => {
    const plan = prepareRuntimeRegistrationPlan({
      assetBundle: makeBaseBundle({
        animations: [
          {
            id: "blink",
            clip: {
              id: "blink",
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
            setup: {
              player: { name: "studio-player", loopMode: "once" },
              instance: {
                timeScale: 2,
                offset: 250,
                active: false,
              },
            },
          },
        ],
      }),
      namespace: "demo-face",
      faceId: "quori_latest",
    });

    expect(plan.animationRegistrations[0]?.config).toMatchObject({
      id: "demo-face/animation/blink",
      setup: {
        player: { name: "studio-player", loopMode: "once" },
        instance: {
          timeScale: 2,
          offset: 250,
          active: false,
        },
      },
    });
    expect(plan.animationRegistrations[0]?.config.setup).toHaveProperty(
      "animation",
    );
  });

  it("prepares playable program graph registrations outside the React runtime host", () => {
    const plan = prepareRuntimeRegistrationPlan({
      assetBundle: makeBaseBundle({
        programs: [
          {
            id: "idle-eyes",
            label: "Idle eyes",
            graph: {
              id: "idle-eyes-graph",
              spec: {
                nodes: [
                  {
                    id: "jitter",
                    type: "input",
                    params: {
                      path: "rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude",
                    },
                  },
                  {
                    id: "blink",
                    type: "output",
                    params: { path: "rig/quori_latest/lids/blink" },
                  },
                ],
                edges: [],
              },
            },
            resetValues: {
              "rig/quori_latest/lids/blink": 0,
            },
          },
        ],
      }),
      namespace: "demo-face",
      faceId: "quori_latest",
    });

    expect(plan.diagnostics).toEqual([]);
    expect(plan.programRegistrations).toHaveLength(1);
    expect(plan.programRegistrations[0]).toMatchObject({
      assetId: "idle-eyes",
      outputs: ["rig/quori_latest/lids/blink"],
      config: {
        id: "demo-face/graph/idle-eyes-graph",
        subs: {
          inputs: [
            "demo-face/rig/quori_latest/standard/vmotion/idle/eyes/jitter_amplitude",
          ],
          outputs: ["demo-face/rig/quori_latest/lids/blink"],
        },
      },
    });
    expect(plan.baseOutputPaths).toEqual(["rig/quori_latest/lids/blink"]);
    expect(plan.namespacedOutputPaths).toEqual([
      "demo-face/rig/quori_latest/lids/blink",
    ]);
  });
});

describe("runtime controller application planning", () => {
  it("plans namespace-scoped controller removal outside the runtime host", () => {
    const plan = planRuntimeControllerRemoval({
      controllers: {
        graphs: [
          "face-a/graph/rig",
          "face-a/merged/merged-face-a",
          "face-b/graph/rig",
          "loose-graph",
        ],
        anims: [
          "face-a/animation/blink",
          "face-b/animation/blink",
          "loose-anim",
        ],
      },
      namespace: "face-a",
    });

    expect(plan).toEqual({
      graphIds: ["face-a/graph/rig", "face-a/merged/merged-face-a"],
      animationIds: ["face-a/animation/blink"],
    });
  });

  it("plans explicit controller removal without touching unrelated controllers", () => {
    const plan = planRuntimeControllerRemoval({
      controllers: {
        graphs: [
          "owned-graph",
          "owned-program-graph",
          "other-face/graph/rig",
          "loose-graph",
        ],
        anims: ["owned-anim", "other-face/animation/blink", "loose-anim"],
      },
      graphIds: ["owned-graph", "owned-program-graph"],
      animationIds: ["owned-anim"],
    });

    expect(plan).toEqual({
      graphIds: ["owned-graph", "owned-program-graph"],
      animationIds: ["owned-anim"],
    });
  });

  it("summarizes registered controller bookkeeping from a support-owned registration plan", () => {
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
                id: "out",
                type: "output",
                params: { path: "rig/quori_latest/blink/value" },
              },
            ],
            edges: [],
          },
        },
        animations: [
          {
            id: "blink",
            clip: {
              id: "blink",
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
        programs: [
          {
            id: "idle-eyes",
            graph: {
              id: "idle-eyes-graph",
              spec: {
                nodes: [
                  {
                    id: "blink",
                    type: "output",
                    params: { path: "rig/quori_latest/lids/blink" },
                  },
                ],
                edges: [],
              },
            },
          },
        ],
      }),
      namespace: "demo-face",
      faceId: "quori_latest",
    });

    const summary = summarizeRuntimeControllerRegistration({
      plan,
      graphIds: ["merged-controller"],
      animationIds: ["animation-controller"],
      animationControllerIds: [["blink", "animation-controller"]],
    });

    expect(summary.graphIds).toEqual(["merged-controller"]);
    expect(summary.animationIds).toEqual(["animation-controller"]);
    expect(summary.animationControllerIds.get("blink")).toBe(
      "animation-controller",
    );
    expect(summary.programRegistrationMap.get("idle-eyes")?.assetId).toBe(
      "idle-eyes",
    );
    expect(
      summary.outputPaths.has("demo-face/rig/quori_latest/lids/blink"),
    ).toBe(true);
    expect(summary.baseOutputPaths.has("rig/quori_latest/blink/value")).toBe(
      true,
    );
    expect(
      summary.namespacedOutputPaths.has(
        "demo-face/rig/quori_latest/blink/value",
      ),
    ).toBe(true);
  });
});
