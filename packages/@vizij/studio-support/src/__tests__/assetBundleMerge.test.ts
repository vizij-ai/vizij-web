import { describe, expect, it } from "vitest";
import { mergeAssetBundle, toStoredAnimationClip } from "../index";
import type {
  VizijAnimationAsset,
  VizijAssetBundle,
  VizijBundleExtension,
  VizijProgramAsset,
} from "../types";

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

function makeExtractedBundle(
  overrides: Partial<VizijBundleExtension> = {},
): VizijBundleExtension {
  return {
    graphs: [
      {
        id: "rig",
        kind: "rig",
        spec: { nodes: [{ id: "rig-node", type: "input" }], edges: [] },
      },
    ],
    animations: [
      {
        id: "bundle-animation",
        clip: { id: "bundle-animation", tracks: [] },
      },
    ],
    ...overrides,
  } as VizijBundleExtension;
}

describe("mergeAssetBundle", () => {
  it("respects explicit empty animation overrides", () => {
    const merged = mergeAssetBundle(
      makeBaseBundle({ animations: [] }),
      makeExtractedBundle(),
      undefined,
    );

    expect(merged.animations).toEqual([]);
  });

  it("respects explicit rig removals", () => {
    const base = makeBaseBundle({ rig: undefined });
    const merged = mergeAssetBundle(base, makeExtractedBundle(), undefined);

    expect(Object.prototype.hasOwnProperty.call(merged, "rig")).toBe(true);
    expect(merged.rig).toBeUndefined();
  });

  it("respects explicit empty program overrides", () => {
    const extractedPrograms: VizijProgramAsset[] = [
      {
        id: "wave",
        graph: {
          id: "wave",
          spec: { nodes: [{ id: "out", type: "output" }], edges: [] },
        },
      },
    ];
    const merged = mergeAssetBundle(
      makeBaseBundle({ programs: [] }),
      makeExtractedBundle({
        graphs: extractedPrograms.map((program) => ({
          id: program.id,
          kind: "motiongraph",
          spec: program.graph.spec,
        })),
      }),
      undefined,
    );

    expect(merged.programs).toEqual([]);
  });

  it("round-trips motiongraph reset values from bundle metadata", () => {
    const merged = mergeAssetBundle(
      makeBaseBundle(),
      makeExtractedBundle({
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
            metadata: {
              resetValues: {
                "rig/face/smile": 0.25,
              },
            },
          },
        ],
      }),
      undefined,
    );

    expect(merged.programs?.[0]).toMatchObject({
      id: "wave",
      resetValues: {
        "rig/face/smile": 0.25,
      },
    });
  });

  it("still merges explicit authored animations with extracted animations", () => {
    const authoredAnimations: VizijAnimationAsset[] = [
      {
        id: "authoring.timeline.main",
        clip: { id: "authoring.timeline.main", tracks: [] },
      },
    ];

    const merged = mergeAssetBundle(
      makeBaseBundle({ animations: authoredAnimations }),
      makeExtractedBundle(),
      undefined,
    );

    expect(merged.animations?.map((animation) => animation.id)).toEqual([
      "authoring.timeline.main",
      "bundle-animation",
    ]);
  });

  it("converts bundle clips to Studio v2 stored animations", () => {
    const stored = toStoredAnimationClip("fallback", {
      id: "authoring.timeline.main",
      name: "Main Timeline",
      duration: 2,
      tracks: [
        {
          id: "jaw-open",
          name: "Jaw Open",
          channel: "controls/jaw/open",
          interpolation: "linear",
          keyframes: [
            { id: "k0", time: 0, value: 0 },
            { id: "k1", time: 1.5, value: 1 },
          ],
        },
      ],
    });

    expect(stored).toMatchObject({
      id: "authoring.timeline.main",
      name: "Main Timeline",
      formatVersion: 2,
      defaultViewportExtent: 2000,
      groups: {},
    });
    expect(stored).not.toHaveProperty("duration");

    const track = (stored.tracks as Array<Record<string, unknown>>)[0];
    expect(track).toMatchObject({
      id: "jaw-open",
      name: "Jaw Open",
      animatableId: "controls/jaw/open",
    });
    expect(track.points).toEqual([
      {
        id: "k0",
        stamp: 0,
        value: 0,
        transitions: { in: "linear", out: "linear" },
      },
      {
        id: "k1",
        stamp: 1500,
        value: 1,
        transitions: { in: "linear", out: "linear" },
      },
    ]);
  });
});
