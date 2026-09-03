import { describe, expect, it } from "vitest";
import {
  expandChannelToScalarTargets,
  extractGltfAnimationChannels,
  type GltfAnimationChannel,
  type GltfJsonLike,
} from "../gltfAnimationChannels";

function makeJson(overrides: Partial<GltfJsonLike> = {}): GltfJsonLike {
  return {
    nodes: [{ name: "L_TLid", mesh: 0 }, { name: "Face_Tran_Rot_C" }],
    meshes: [{ extras: { targetNames: ["Lid_UpDn", "CurveUp"] } }],
    animations: [
      {
        name: "Key.003Action",
        channels: [{ sampler: 0, target: { node: 0, path: "weights" } }],
        samplers: [{ interpolation: "LINEAR" }],
      },
    ],
    ...overrides,
  };
}

describe("extractGltfAnimationChannels", () => {
  it("reads node name, interpolation and morph names", () => {
    const [channel] = extractGltfAnimationChannels(makeJson());
    expect(channel).toMatchObject({
      animationName: "Key.003Action",
      nodeName: "L_TLid",
      path: "weights",
      interpolation: "LINEAR",
      morphNames: ["Lid_UpDn", "CurveUp"],
    });
  });

  it("defaults a missing or unknown interpolation to LINEAR", () => {
    const channels = extractGltfAnimationChannels(
      makeJson({
        animations: [
          {
            name: "a",
            channels: [
              { sampler: 0, target: { node: 1, path: "translation" } },
              { sampler: 1, target: { node: 1, path: "scale" } },
            ],
            samplers: [{}, { interpolation: "NONSENSE" }],
          },
        ],
      }),
    );
    expect(channels.map((c) => c.interpolation)).toEqual(["LINEAR", "LINEAR"]);
  });

  it("preserves CUBICSPLINE and STEP", () => {
    const channels = extractGltfAnimationChannels(
      makeJson({
        animations: [
          {
            name: "a",
            channels: [
              { sampler: 0, target: { node: 1, path: "translation" } },
              { sampler: 1, target: { node: 1, path: "scale" } },
            ],
            samplers: [
              { interpolation: "CUBICSPLINE" },
              { interpolation: "STEP" },
            ],
          },
        ],
      }),
    );
    expect(channels.map((c) => c.interpolation)).toEqual([
      "CUBICSPLINE",
      "STEP",
    ]);
  });

  it("skips unsupported target paths and dangling nodes", () => {
    const channels = extractGltfAnimationChannels(
      makeJson({
        animations: [
          {
            name: "a",
            channels: [
              { sampler: 0, target: { node: 1, path: "pointer" } },
              { sampler: 0, target: { node: 99, path: "translation" } },
              { sampler: 0, target: { node: 1, path: "translation" } },
            ],
            samplers: [{ interpolation: "LINEAR" }],
          },
        ],
      }),
    );
    expect(channels).toHaveLength(1);
    expect(channels[0]?.nodeName).toBe("Face_Tran_Rot_C");
  });

  it("returns an empty morph name list when the mesh declares no targetNames", () => {
    const [channel] = extractGltfAnimationChannels(
      makeJson({ meshes: [{ extras: null }] }),
    );
    expect(channel?.morphNames).toEqual([]);
  });

  it("names animations by index when unnamed", () => {
    const [channel] = extractGltfAnimationChannels(
      makeJson({
        animations: [
          {
            channels: [{ sampler: 0, target: { node: 1, path: "scale" } }],
            samplers: [{}],
          },
        ],
      }),
    );
    expect(channel?.animationName).toBe("animation-0");
  });
});

describe("expandChannelToScalarTargets", () => {
  const base: GltfAnimationChannel = {
    animationIndex: 0,
    animationName: "a",
    channelIndex: 0,
    nodeIndex: 0,
    nodeName: "L_TLid",
    path: "translation",
    samplerIndex: 0,
    interpolation: "LINEAR",
  };

  it("expands vector channels to x/y/z with stride indices", () => {
    const targets = expandChannelToScalarTargets(base);
    expect(targets.map((t) => t.component)).toEqual(["x", "y", "z"]);
    expect(targets.map((t) => t.valueIndex)).toEqual([0, 1, 2]);
  });

  it("expands weights to one target per morph, keyed like import", () => {
    const targets = expandChannelToScalarTargets({
      ...base,
      path: "weights",
      morphNames: ["Lid_UpDn", "CurveUp", "CurveDn"],
    });
    expect(targets.map((t) => t.morphFeatureKey)).toEqual([
      "lid_updn",
      "curveup",
      "curvedn",
    ]);
    expect(targets.map((t) => t.valueIndex)).toEqual([0, 1, 2]);
  });

  it("dedupes morph names that slugify identically", () => {
    const targets = expandChannelToScalarTargets({
      ...base,
      path: "weights",
      morphNames: ["Lid Up", "Lid_Up"],
    });
    expect(targets.map((t) => t.morphFeatureKey)).toEqual([
      "lid_up",
      "lid_up_1",
    ]);
  });

  it("yields nothing for a weights channel with no morph targets", () => {
    expect(
      expandChannelToScalarTargets({
        ...base,
        path: "weights",
        morphNames: [],
      }),
    ).toEqual([]);
  });
});
