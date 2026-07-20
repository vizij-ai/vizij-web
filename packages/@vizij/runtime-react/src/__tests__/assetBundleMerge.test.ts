import { describe, expect, it } from "vitest";
import type { VizijBundleExtension } from "@vizij/face-core";
import { mergeAssetBundle } from "../VizijRuntimeProvider";
import type {
  VizijAnimationAsset,
  VizijAssetBundle,
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
          spec: program.graph.spec ?? {},
        })),
      }),
      undefined,
    );

    expect(merged.programs).toEqual([]);
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
});
