import { describe, expect, it } from "vitest";
import {
  buildGraphRegistrationConfig,
  prepareRuntimeAssetBundle,
} from "../studioSupport";
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

describe("studioSupport", () => {
  it("prepares extracted Studio bundle assets without requiring the provider", () => {
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

  it("builds namespaced graph registration configs from Studio graph assets", () => {
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
    expect(result?.config.spec?.nodes).toEqual([
      { id: "in", type: "input", params: { path: "face-a/pose/open" } },
      {
        id: "out",
        type: "output",
        params: { path: "face-a/rig/mouth/open" },
      },
      {
        id: "debug",
        type: "output",
        params: { path: "debug/face-a/rig/eye/blink" },
      },
    ]);
  });
});
