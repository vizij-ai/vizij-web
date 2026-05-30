import { describe, expect, it } from "vitest";
import {
  applyRuntimeGraphBundle,
  buildGraphRegistrationConfig,
  prepareRuntimeAssetBundle,
  resolveRuntimeUpdatePlan,
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
});
