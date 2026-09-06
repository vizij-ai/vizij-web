import { describe, expect, it } from "vitest";
import {
  classifyGltfAnimation,
  gltfAnimationFingerprint,
  readBakedAnimationRecords,
  type BakedAnimationRecords,
} from "../bakedAnimationProvenance";
import type { GltfAnimationEntry } from "../gltfAnimationDocument";

/**
 * The round trip, enumerated.
 *
 * Export writes every clip twice — losslessly into `VIZIJ_bundle.animations`
 * and baked into glTF channels — so loading our own export offers the same
 * clip from two directions. These pin what happens in each case, including the
 * one that matters most: a baked animation someone changed in Blender is new
 * information, not a duplicate.
 */

function animation(
  name: string,
  values: number[],
  overrides: Partial<GltfAnimationEntry["curves"][number]> = {},
  index = 0,
): Pick<GltfAnimationEntry, "name" | "index" | "curves"> {
  return {
    name,
    index,
    curves: [
      {
        nodeName: "L_Lid",
        path: "translation",
        interpolation: "LINEAR",
        times: [0, 1],
        values,
        stride: 3,
        ...overrides,
      },
    ],
  };
}

function recordsFor(
  name: string,
  clipId: string,
  animationForFingerprint: Pick<GltfAnimationEntry, "curves">,
  index = 0,
): BakedAnimationRecords {
  return readBakedAnimationRecords([
    {
      animationIndex: index,
      animationName: name,
      clipId,
      fingerprint: gltfAnimationFingerprint(animationForFingerprint),
    },
  ]);
}

const BAKED = animation("Blink", [0, 0, 0, 0, 1, 0]);

describe("round trip: what happens to a baked animation on re-import", () => {
  it("unchanged baked animation is skipped — the bundle clip loads once", () => {
    // Two clips out must be two clips in. Importing the baked copy on top of
    // the bundle clip is how two became three.
    expect(
      classifyGltfAnimation({
        animation: BAKED,
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.1" });
  });

  it("baked animation edited in the GLB is kept alongside the authored clip", () => {
    // Someone opened the export in Blender and moved it. That is the entire
    // point of baking, so it must not be discarded as a duplicate — both are
    // kept and the user decides.
    const editedInBlender = animation("Blink", [0, 0, 0, 0, 5, 0]);
    expect(
      classifyGltfAnimation({
        animation: editedInBlender,
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "keep-both-edited", clipId: "clip.1" });
  });

  it("an animation the bundle never baked is imported normally", () => {
    // A clip authored entirely in Blender: appended, so it sits past the
    // indices export recorded, and its name matches nothing.
    expect(
      classifyGltfAnimation({
        animation: animation("HandWave", [0, 0, 0, 1, 1, 1], {}, 1),
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "import-new" });
  });

  it("reads a changed animation in a recorded slot as edited, not new", () => {
    // Deliberate: something occupying a slot we baked into is more likely our
    // clip after an edit than an unrelated animation, and "edited" keeps both
    // copies. The failure direction that matters is dropping a clip, and
    // neither branch does that.
    expect(
      classifyGltfAnimation({
        animation: animation("HandWave", [0, 0, 0, 1, 1, 1], {}, 0),
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "keep-both-edited", clipId: "clip.1" });
  });

  it("a rename alone still matches, because position identifies it", () => {
    // A rename in Blender used to read as a whole new animation. Position is
    // the stronger identity and survives it, so the round trip stays stable.
    expect(
      classifyGltfAnimation({
        animation: { ...BAKED, name: "Blink.001" },
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.1" });
  });

  it("a rename and a reorder together import as new", () => {
    // Nothing identifies it any more. Importing loses nothing; the
    // alternative would be silently dropping it.
    expect(
      classifyGltfAnimation({
        animation: { ...BAKED, name: "Blink.001", index: 7 },
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "import-new" });
  });

  it("matches a reordered animation by name when the index moved", () => {
    // An editor that reorders animations must not resurrect the duplicate
    // bug; the name carries the match when position no longer does.
    expect(
      classifyGltfAnimation({
        animation: { ...BAKED, index: 4 },
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.1" });
  });

  it("does not match on a name two clips share", () => {
    // The bug this keying replaces: a name-keyed map kept only the last of a
    // duplicate pair, so the other clip's baked copy came back as a third
    // clip. Ambiguous names now match nothing, and both records stay
    // reachable by position.
    const records = readBakedAnimationRecords([
      {
        animationIndex: 0,
        animationName: "Blink",
        clipId: "clip.1",
        fingerprint: gltfAnimationFingerprint(BAKED),
      },
      {
        animationIndex: 1,
        animationName: "Blink",
        clipId: "clip.2",
        fingerprint: gltfAnimationFingerprint(BAKED),
      },
    ]);

    // Position still resolves each one.
    expect(
      classifyGltfAnimation({ animation: BAKED, bakedRecords: records }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.1" });
    expect(
      classifyGltfAnimation({
        animation: { ...BAKED, index: 1 },
        bakedRecords: records,
      }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.2" });
    // The ambiguous name alone does not.
    expect(
      classifyGltfAnimation({
        animation: { ...BAKED, index: 9 },
        bakedRecords: records,
      }),
    ).toEqual({ kind: "import-new" });
  });

  it("treats a record without a fingerprint as a duplicate", () => {
    // Export cannot yet record a fingerprint that survives the GLB round trip
    // (GLTFExporter merges morph tracks; floats become float32). Without one
    // an edit is undetectable, and keeping the round trip stable matters more
    // than a detection we cannot make reliably.
    expect(
      classifyGltfAnimation({
        animation: animation("Blink", [0, 0, 0, 0, 9, 0]),
        bakedRecords: readBakedAnimationRecords([
          { animationIndex: 0, animationName: "Blink", clipId: "clip.1" },
        ]),
      }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.1" });
  });

  it("imports everything when the file carries no bake records", () => {
    // A plain Blender export, or a GLB written before bake provenance existed.
    expect(
      classifyGltfAnimation({
        animation: BAKED,
        bakedRecords: readBakedAnimationRecords([]),
      }),
    ).toEqual({ kind: "import-new" });
  });
});

describe("gltfAnimationFingerprint", () => {
  it("ignores the animation name", () => {
    // Renaming is handled by the name match; the fingerprint answers only
    // "did the motion change".
    expect(gltfAnimationFingerprint(animation("A", [0, 1, 0, 0, 2, 0]))).toBe(
      gltfAnimationFingerprint(animation("B", [0, 1, 0, 0, 2, 0])),
    );
  });

  it("ignores curve order", () => {
    // A re-export may emit channels in another order; that is not an edit.
    const forward = {
      curves: [
        ...animation("x", [0, 1, 0, 0, 2, 0]).curves,
        ...animation("x", [0, 3, 0, 0, 4, 0], { nodeName: "R_Lid" }).curves,
      ],
    };
    const reversed = { curves: [...forward.curves].reverse() };
    expect(gltfAnimationFingerprint(forward)).toBe(
      gltfAnimationFingerprint(reversed),
    );
  });

  it("tolerates float drift from a GLB round trip", () => {
    // Values survive a float32 round trip approximately, not exactly. Treating
    // that as an edit would make every re-import a conflict.
    expect(
      gltfAnimationFingerprint(animation("x", [0, 1.000000004, 0, 0, 2, 0])),
    ).toBe(gltfAnimationFingerprint(animation("x", [0, 1, 0, 0, 2, 0])));
  });

  it("detects a changed value", () => {
    expect(
      gltfAnimationFingerprint(animation("x", [0, 1, 0, 0, 2, 0])),
    ).not.toBe(gltfAnimationFingerprint(animation("x", [0, 1, 0, 0, 9, 0])));
  });

  it("detects a changed key time", () => {
    expect(
      gltfAnimationFingerprint(animation("x", [0, 1, 0, 0, 2, 0])),
    ).not.toBe(
      gltfAnimationFingerprint(
        animation("x", [0, 1, 0, 0, 2, 0], { times: [0, 2] }),
      ),
    );
  });

  it("detects a changed interpolation", () => {
    expect(
      gltfAnimationFingerprint(animation("x", [0, 1, 0, 0, 2, 0])),
    ).not.toBe(
      gltfAnimationFingerprint(
        animation("x", [0, 1, 0, 0, 2, 0], { interpolation: "STEP" }),
      ),
    );
  });

  it("detects a curve retargeted to another node", () => {
    expect(
      gltfAnimationFingerprint(animation("x", [0, 1, 0, 0, 2, 0])),
    ).not.toBe(
      gltfAnimationFingerprint(
        animation("x", [0, 1, 0, 0, 2, 0], { nodeName: "R_Lid" }),
      ),
    );
  });
});

describe("readBakedAnimationRecords", () => {
  it("reads what export recorded, both ways", () => {
    const records = readBakedAnimationRecords([
      {
        animationIndex: 0,
        animationName: "Blink",
        clipId: "clip.1",
        fingerprint: "abc",
      },
    ]);
    const expected = { clipId: "clip.1", fingerprint: "abc" };
    expect(records.byIndex.get(0)).toEqual(expected);
    expect(records.byName.get("Blink")).toEqual(expected);
  });

  it("still reads a record written before the index existed", () => {
    // Bundles exported by an earlier build carry only the name.
    const records = readBakedAnimationRecords([
      { animationName: "Blink", clipId: "clip.1", fingerprint: "abc" },
    ]);
    expect(records.byIndex.size).toBe(0);
    expect(records.byName.get("Blink")).toEqual({
      clipId: "clip.1",
      fingerprint: "abc",
    });
  });

  it("marks a name shared by two records as ambiguous", () => {
    const records = readBakedAnimationRecords([
      { animationIndex: 0, animationName: "Blink", clipId: "clip.1" },
      { animationIndex: 1, animationName: "Blink", clipId: "clip.2" },
    ]);
    expect(records.byName.get("Blink")).toBeNull();
    expect(records.byIndex.size).toBe(2);
  });

  it("tolerates a missing or malformed record set", () => {
    // Older exports have no records at all; they must import, not throw.
    expect(readBakedAnimationRecords(undefined).byName.size).toBe(0);
    expect(readBakedAnimationRecords("nope").byName.size).toBe(0);
    const junk = readBakedAnimationRecords([
      null,
      7,
      {},
      { animationName: "x" },
    ]);
    expect(junk.byName.size).toBe(0);
    expect(junk.byIndex.size).toBe(0);
  });
});
