import { describe, expect, it } from "vitest";
import {
  applyRuntimeGraphBundle,
  buildGraphRegistrationConfig,
  buildProgramRegistrationConfig,
  diffAnimationAggregateValues,
  prepareRuntimeAssetBundle,
  prepareRuntimeAssetView,
  planRuntimeGraphBundleApplication,
  planRuntimeProgramControllerSync,
  resolveRuntimeUpdatePlan,
  sampleAnimationClipOutputValues,
  toStoredAnimationClip,
} from "../index";
import type { VizijAssetBundle, VizijGraphAsset } from "../types";

function makeBaseBundle(
  overrides: Partial<VizijAssetBundle> = {},
): VizijAssetBundle {
  return {
    namespace: "test",
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

describe("studio support package", () => {
  it("prepares extracted Studio bundle assets outside runtime-react", () => {
    const prepared = prepareRuntimeAssetBundle(
      makeBaseBundle(),
      {
        version: 1,
        graphs: [
          {
            id: "rig",
            kind: "rig",
            spec: {
              nodes: [
                { id: "in", type: "input", params: { path: "jaw/open" } },
                { id: "out", type: "output", params: { path: "jaw/value" } },
              ],
              edges: [],
            },
          },
        ],
        animations: [
          {
            id: "blink",
            clip: {
              id: "blink",
              tracks: [
                {
                  channel: "eyes/blink",
                  keyframes: [
                    { time: 0, value: 0 },
                    { time: 0.1, value: 1 },
                  ],
                },
              ],
            },
          },
        ],
      },
      undefined,
    );

    expect(prepared.rig?.id).toBe("rig");
    expect(prepared.animations?.map((animation) => animation.id)).toEqual([
      "blink",
    ]);
  });

  it("prepares a runtime asset view with authoritative program overrides", () => {
    const prepared = prepareRuntimeAssetView(
      makeBaseBundle({
        rig: undefined,
        pose: undefined,
        programs: [],
      }),
      {
        version: 1,
        graphs: [
          {
            id: "wave",
            kind: "motiongraph",
            spec: {
              nodes: [
                {
                  id: "out",
                  type: "output",
                  params: { path: "rig/face/smile" },
                },
              ],
              edges: [],
            },
          },
        ],
      },
      undefined,
    );

    expect(prepared.assetBundle.programs).toEqual([]);
    expect(prepared.programs).toEqual([]);
    expect(prepared.assetBundle.rig).toBeUndefined();
    expect(prepared.assetBundle.pose).toBeUndefined();
  });

  it("builds namespaced graph registration configs", () => {
    const asset: VizijGraphAsset = {
      id: "pose-driver",
      spec: {
        nodes: [
          { id: "in", type: "input", params: { path: "pose/open" } },
          { id: "out", type: "output", params: { path: "rig/mouth/open" } },
          {
            id: "debug",
            type: "output",
            params: { path: "debug/rig/eye/blink" },
          },
        ],
        edges: [],
      },
    };

    const result = buildGraphRegistrationConfig({
      asset,
      namespace: "face-a",
      context: "pose-driver graph",
    });

    expect(result?.inputs).toEqual(["pose/open"]);
    expect(result?.outputs).toEqual(["rig/mouth/open", "debug/rig/eye/blink"]);
    expect(result?.config).toMatchObject({
      id: "face-a/graph/pose-driver",
      subs: {
        inputs: ["face-a/pose/open"],
        outputs: ["face-a/rig/mouth/open", "debug/face-a/rig/eye/blink"],
      },
    });
  });

  it("builds namespaced program registrations from support-owned graph semantics", () => {
    const result = buildProgramRegistrationConfig({
      namespace: "face-a",
      program: {
        id: "smile-loop",
        graph: {
          id: "smile-loop.graph",
          spec: {
            nodes: [
              { id: "in", type: "input", params: { path: "controls/smile" } },
              { id: "out", type: "output", params: { path: "rig/face/smile" } },
            ],
            edges: [],
          },
        },
      },
    });

    expect(result).toMatchObject({
      assetId: "smile-loop",
      inputs: ["controls/smile"],
      outputs: ["rig/face/smile"],
      config: {
        id: "face-a/graph/smile-loop.graph",
        subs: {
          inputs: ["face-a/controls/smile"],
          outputs: ["face-a/rig/face/smile"],
        },
      },
    });
  });

  it("plans runtime program controller sync without host calls", () => {
    const registration = buildProgramRegistrationConfig({
      namespace: "face-a",
      program: {
        id: "smile-loop",
        graph: {
          id: "smile-loop.graph",
          spec: {
            nodes: [
              { id: "in", type: "input", params: { path: "controls/smile" } },
              { id: "out", type: "output", params: { path: "rig/face/smile" } },
            ],
            edges: [],
          },
        },
      },
    });

    expect(registration).not.toBeNull();

    const plan = planRuntimeProgramControllerSync({
      availableProgramIds: ["smile-loop", "paused-loop", "waiting-loop"],
      activeControllerIds: new Map([
        ["old-loop", "controller-old"],
        ["paused-loop", "controller-paused"],
        ["already-loop", "controller-already"],
      ]),
      registrationByProgramId: new Map(
        registration ? [["smile-loop", registration]] : [],
      ),
      playbackStates: [
        { id: "old-loop", state: "playing" },
        { id: "paused-loop", state: "paused" },
        { id: "smile-loop", state: "playing" },
        { id: "waiting-loop", state: "playing" },
      ],
    });

    expect(plan).toEqual({
      stalePlaybackIds: ["old-loop"],
      controllerRemovals: [
        {
          programId: "old-loop",
          controllerId: "controller-old",
          reason: "unavailable",
        },
        {
          programId: "paused-loop",
          controllerId: "controller-paused",
          reason: "inactive",
        },
      ],
      controllerRegistrations: [
        {
          programId: "smile-loop",
          registration,
        },
      ],
      waitingProgramIds: ["waiting-loop"],
    });
  });

  it("converts runtime clips into Studio v2 stored animation format", () => {
    const stored = toStoredAnimationClip("fallback", {
      id: "authoring.timeline.main",
      duration: 2,
      tracks: [
        {
          channel: "controls/jaw/open",
          interpolation: "step",
          keyframes: [
            { id: "k0", time: 0, value: 0 },
            { id: "k1", time: 1.5, value: 1 },
          ],
        },
      ],
    });

    expect(stored).toMatchObject({
      id: "authoring.timeline.main",
      formatVersion: 2,
      defaultViewportExtent: 2000,
    });
    expect(stored.tracks).toEqual([
      {
        id: "authoring.timeline.main:track-0000",
        name: "controls/jaw/open",
        animatableId: "controls/jaw/open",
        points: [
          {
            id: "k0",
            stamp: 0,
            value: 0,
            transitions: { in: "linear", out: { x: 0, y: 0 } },
          },
          {
            id: "k1",
            stamp: 1500,
            value: 1,
            transitions: { in: "linear", out: { x: 0, y: 0 } },
          },
        ],
      },
    ]);
  });

  it("samples animation outputs onto bridge target paths", () => {
    const outputs = sampleAnimationClipOutputValues(
      {
        tracks: [
          {
            channel: "controls/jaw/open",
            keyframes: [
              { time: 0, value: 0.2 },
              { time: 1, value: 0.6 },
            ],
          },
          {
            channel: "controls/jaw/open",
            keyframes: [
              { time: 0, value: 0.1 },
              { time: 1, value: 0.4 },
            ],
          },
        ],
      },
      1,
      1,
      "hugo",
    );

    expect(outputs.get("controls/jaw/open")).toBeCloseTo(1, 6);
    expect(outputs.get("rig/hugo/controls/jaw/open")).toBeCloseTo(1, 6);
  });

  it("diffs aggregate animation outputs without converting clears to zero writes", () => {
    expect(
      diffAnimationAggregateValues(
        new Map([["rig/hugo/poses/pose_happy.weight", 0.75]]),
        new Map(),
      ),
    ).toEqual([
      {
        kind: "clear",
        path: "rig/hugo/poses/pose_happy.weight",
      },
    ]);

    expect(
      diffAnimationAggregateValues(
        new Map([["rig/hugo/poses/pose_happy.weight", 0.75]]),
        new Map([["rig/hugo/poses/pose_happy.weight", 0]]),
      ),
    ).toEqual([
      {
        kind: "set",
        path: "rig/hugo/poses/pose_happy.weight",
        value: 0,
      },
    ]);
  });

  it("plans Studio bundle graph updates outside runtime-react", () => {
    const previous = makeBaseBundle({
      rig: {
        id: "rig",
        spec: { nodes: [], edges: [] },
      },
    });
    const next = applyRuntimeGraphBundle(previous, {
      rig: {
        id: "rig",
        spec: { nodes: [{ id: "jaw", type: "input" }], edges: [] },
      },
    });

    const plan = resolveRuntimeUpdatePlan(previous, next, "graphs");

    expect(next.rig?.spec).toEqual({
      nodes: [{ id: "jaw", type: "input" }],
      edges: [],
    });
    expect(plan).toEqual({ reloadAssets: false, reregisterGraphs: true });
  });

  it("plans runtime graph bundle application with extracted bundle retention and pending update metadata", () => {
    const extractedBundle = {
      version: 1 as const,
      graphs: [],
    };
    const result = planRuntimeGraphBundleApplication({
      baseAssetBundle: makeBaseBundle({ bundle: null }),
      extractedBundle,
      graphBundle: {
        animations: [
          {
            id: "blink",
            clip: {
              id: "blink",
              duration: 1,
              tracks: [],
            },
          },
        ],
      },
      tier: "graphs",
      source: { key: "animation" },
      revision: 7,
    });

    expect(result.baseAssetBundle.bundle).toBe(extractedBundle);
    expect(result.nextAssetBundle.animations?.map((entry) => entry.id)).toEqual(
      ["blink"],
    );
    expect(result.updatePlan).toEqual({
      reloadAssets: false,
      reregisterGraphs: true,
    });
    expect(result.pendingUpdate).toEqual({
      revision: 7,
      source: {
        key: "animation",
        signature: null,
      },
      reregistered: true,
      reloadedAssets: false,
    });
  });

  it("plans rig re-registration when only subscriptions change", () => {
    const previous = makeBaseBundle({
      rig: {
        id: "rig",
        spec: { nodes: [], edges: [] },
        subscriptions: { inputs: ["controls/smile"], outputs: [] },
      },
    });
    const next = makeBaseBundle({
      rig: {
        id: "rig",
        spec: previous.rig?.spec,
        subscriptions: {
          inputs: ["controls/smile"],
          outputs: ["rig/face/smile"],
        },
      },
    });

    expect(resolveRuntimeUpdatePlan(previous, next, "graphs")).toEqual({
      reloadAssets: false,
      reregisterGraphs: true,
    });
  });

  it("plans rig re-registration when only input metadata changes", () => {
    const previous = makeBaseBundle({
      rig: {
        id: "rig",
        spec: { nodes: [], edges: [] },
        inputMetadata: [
          {
            id: "smile",
            path: "rig/face/smile",
            defaultValue: 0,
          },
        ],
      },
    });
    const next = makeBaseBundle({
      rig: {
        id: "rig",
        spec: previous.rig?.spec,
        inputMetadata: [
          {
            id: "smile",
            path: "rig/face/smile",
            defaultValue: 0.5,
          },
        ],
      },
    });

    expect(resolveRuntimeUpdatePlan(previous, next, "graphs")).toEqual({
      reloadAssets: false,
      reregisterGraphs: true,
    });
  });

  it("plans program re-registration when only program graph subscriptions change", () => {
    const graph = {
      id: "program.graph",
      spec: { nodes: [], edges: [] },
    };
    const previous = makeBaseBundle({
      programs: [
        {
          id: "program",
          graph: {
            ...graph,
            subscriptions: { inputs: ["controls/smile"], outputs: [] },
          },
        },
      ],
    });
    const next = makeBaseBundle({
      programs: [
        {
          id: "program",
          graph: {
            ...graph,
            subscriptions: {
              inputs: ["controls/smile"],
              outputs: ["rig/face/smile"],
            },
          },
        },
      ],
    });

    expect(resolveRuntimeUpdatePlan(previous, next, "graphs")).toEqual({
      reloadAssets: false,
      reregisterGraphs: true,
    });
  });

  it("plans pose graph re-registration when only pose graph input metadata changes", () => {
    const graph = {
      id: "pose.graph",
      spec: { nodes: [], edges: [] },
    };
    const previous = makeBaseBundle({
      pose: {
        graph: {
          ...graph,
          inputMetadata: [{ path: "rig/face/pose/control/smile" }],
        },
      },
    });
    const next = makeBaseBundle({
      pose: {
        graph: {
          ...graph,
          inputMetadata: [
            {
              path: "rig/face/pose/control/smile",
              defaultValue: 0.25,
            },
          ],
        },
      },
    });

    expect(resolveRuntimeUpdatePlan(previous, next, "graphs")).toEqual({
      reloadAssets: false,
      reregisterGraphs: true,
    });
  });

  it("plans pose graph re-registration when only pose graph IR changes", () => {
    const spec = { nodes: [], edges: [] };
    const previous = makeBaseBundle({
      pose: {
        graph: {
          id: "pose.graph",
          spec,
          ir: {
            id: "pose-ir",
            nodes: [{ id: "input", op: "input" }],
            edges: [],
          } as any,
        },
      },
    });
    const next = makeBaseBundle({
      pose: {
        graph: {
          id: "pose.graph",
          spec,
          ir: {
            id: "pose-ir",
            nodes: [
              { id: "input", op: "input" },
              { id: "output", op: "output" },
            ],
            edges: [],
          } as any,
        },
      },
    });

    expect(resolveRuntimeUpdatePlan(previous, next, "graphs")).toEqual({
      reloadAssets: false,
      reregisterGraphs: true,
    });
  });
});
