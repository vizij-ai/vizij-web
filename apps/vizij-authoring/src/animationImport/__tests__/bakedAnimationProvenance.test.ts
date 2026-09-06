import { describe, expect, it } from "vitest";
import {
  classifyGltfAnimation,
  gltfAnimationFingerprint,
  readBakedAnimationRecords,
  type BakedAnimationRecord,
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
): Pick<GltfAnimationEntry, "name" | "curves"> {
  return {
    name,
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
): Map<string, BakedAnimationRecord> {
  return new Map([
    [
      name,
      {
        clipId,
        fingerprint: gltfAnimationFingerprint(animationForFingerprint),
      },
    ],
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
    // A clip authored entirely in Blender.
    expect(
      classifyGltfAnimation({
        animation: animation("HandWave", [0, 0, 0, 1, 1, 1]),
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
      }),
    ).toEqual({ kind: "import-new" });
  });

  it("a baked animation renamed in the GLB imports as new", () => {
    // glTF gives a clip no identity but its name, so a rename is
    // indistinguishable from a new animation. Importing loses nothing; the
    // alternative would be silently dropping it.
    expect(
      classifyGltfAnimation({
        animation: { ...BAKED, name: "Blink.001" },
        bakedRecords: recordsFor("Blink", "clip.1", BAKED),
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
        bakedRecords: new Map([["Blink", { clipId: "clip.1" }]]),
      }),
    ).toEqual({ kind: "skip-duplicate", clipId: "clip.1" });
  });

  it("imports everything when the file carries no bake records", () => {
    // A plain Blender export, or a GLB written before bake provenance existed.
    expect(
      classifyGltfAnimation({
        animation: BAKED,
        bakedRecords: new Map(),
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
  it("reads what export recorded", () => {
    const records = readBakedAnimationRecords([
      { animationName: "Blink", clipId: "clip.1", fingerprint: "abc" },
    ]);
    expect(records.get("Blink")).toEqual({
      clipId: "clip.1",
      fingerprint: "abc",
    });
  });

  it("tolerates a missing or malformed record set", () => {
    // Older exports have no records at all; they must import, not throw.
    expect(readBakedAnimationRecords(undefined).size).toBe(0);
    expect(readBakedAnimationRecords("nope").size).toBe(0);
    expect(
      readBakedAnimationRecords([null, 7, {}, { animationName: "x" }]).size,
    ).toBe(0);
  });
});
