import { describe, expect, it } from "vitest";
import { sampleTrackAt } from "../sampleAnimationTrack";
import type { AnimationTrackIR } from "../../types/animationClipIr";

/**
 * There were two samplers with this signature: one behind the timeline
 * preview and the store, one behind the GLB bake and pose capture. Both were
 * tested, separately, and neither test could see the other implementation —
 * so three disagreements sat in the middle of a round trip whose premise is
 * that the exported file plays what the timeline showed.
 *
 * The cases below are those three. They are pinned to concrete values rather
 * than compared against a second implementation, because there is no longer a
 * second implementation to compare against — that was the bug.
 */

function track(
  keyframes: Array<Partial<AnimationTrackIR["keyframes"][number]>>,
  interpolation: AnimationTrackIR["interpolation"] = "linear",
): AnimationTrackIR {
  return {
    id: "t",
    variableId: "v",
    channel: "propsrig/v",
    interpolation,
    keyframes: keyframes.map((keyframe, index) => ({
      id: `k${index}`,
      time: 0,
      value: 0,
      ...keyframe,
    })),
  };
}

describe("sampleTrackAt", () => {
  describe("cases the bake and the editor used to disagree on", () => {
    it("keeps a lone out tangent instead of going straight", () => {
      // The bake discarded the tangent unless *both* were present and drew a
      // straight line: 0.25 here, against the real curve's 0.953.
      const subject = track(
        [
          { time: 0, value: 0, outTangent: 3 },
          { time: 2, value: 1 },
        ],
        "cubic",
      );
      expect(sampleTrackAt(subject, 0.5)).toBeCloseTo(0.953125, 10);
    });

    it("keeps a lone in tangent instead of going straight", () => {
      const subject = track(
        [
          { time: 0, value: 0 },
          { time: 2, value: 1, inTangent: -4 },
        ],
        "cubic",
      );
      expect(sampleTrackAt(subject, 0.5)).toBeCloseTo(0.671875, 10);
    });

    it("reads 'smooth' as cubic", () => {
      // The bake did not normalize the alias, so every smooth curve baked as
      // straight segments.
      const subject = track(
        [
          { time: 0, value: 0, outTangent: 0 },
          { time: 2, value: 1, inTangent: 0 },
        ],
        "smooth" as AnimationTrackIR["interpolation"],
      );
      expect(sampleTrackAt(subject, 0.5)).toBeCloseTo(0.15625, 10);
    });

    it("does not let a non-finite tangent poison the value", () => {
      // The editor accepted any `typeof === "number"`, NaN included, and
      // returned NaN for the whole segment.
      const subject = track(
        [
          { time: 0, value: 0, outTangent: Number.NaN },
          { time: 2, value: 1, inTangent: 1 },
        ],
        "cubic",
      );
      expect(sampleTrackAt(subject, 0.5)).toBeCloseTo(0.203125, 10);
    });
  });

  it("samples an untangented cubic exactly like a linear one", () => {
    // Chord-slope Hermite reduces to the straight line when both tangents are
    // missing, so a cubic flag with no tangent data invents no curve.
    const keys = [
      { time: 0, value: 0 },
      { time: 2, value: 1 },
    ];
    for (const time of [0.25, 0.5, 1, 1.75]) {
      expect(sampleTrackAt(track(keys, "cubic"), time)).toBeCloseTo(
        sampleTrackAt(track(keys, "linear"), time),
        10,
      );
    }
  });

  it("holds flat outside the key range, like glTF's clamped sampler", () => {
    const subject = track([
      { time: 1, value: 2 },
      { time: 3, value: 6 },
    ]);
    expect(sampleTrackAt(subject, -1)).toBe(2);
    expect(sampleTrackAt(subject, 99)).toBe(6);
  });

  it("returns 0 for a track with no keyframes", () => {
    expect(sampleTrackAt(track([]), 1)).toBe(0);
  });

  it("honours a per-key interpolation override", () => {
    const subject = track(
      [
        { time: 0, value: 0, interpolation: "step" },
        { time: 1, value: 1 },
      ],
      "linear",
    );
    expect(sampleTrackAt(subject, 0.5)).toBe(0);
  });

  it("sorts keyframes before sampling", () => {
    const subject = track([
      { time: 2, value: 1 },
      { time: 0, value: 0 },
    ]);
    expect(sampleTrackAt(subject, 1)).toBeCloseTo(0.5, 10);
  });
});
