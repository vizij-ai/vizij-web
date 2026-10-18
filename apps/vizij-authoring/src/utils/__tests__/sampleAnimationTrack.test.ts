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

  describe("two keys sharing a time (an instantaneous jump)", () => {
    const jump = () =>
      track([
        { time: 0, value: 0 },
        { time: 1, value: 5 },
        { time: 1, value: 9 },
        { time: 2, value: 9 },
      ]);

    it("has not yet jumped at the shared time itself", () => {
      // The value the scan this replaced returned. Landing on the second key
      // instead would move every authored jump one sample earlier — which is
      // exactly what a bake samples at.
      expect(sampleTrackAt(jump(), 1)).toBeCloseTo(5, 10);
    });

    it("has jumped just after it", () => {
      expect(sampleTrackAt(jump(), 1.5)).toBeCloseTo(9, 10);
    });

    it("interpolates out of the second key, not the first", () => {
      const subject = track([
        { time: 1, value: 0 },
        { time: 1, value: 5 },
        { time: 2, value: 1 },
      ]);
      expect(sampleTrackAt(subject, 1.5)).toBeCloseTo(3, 10);
    });
  });

  describe("keys read per sample", () => {
    // A bake samples a track once per key, so anything that touches every key
    // on every sample — a per-sample sort, an unmemoized sortedness check, a
    // linear segment scan — makes a three-minute 60fps channel cost ~10^8
    // operations. The bound is stated as keys read rather than time taken:
    // the count is a property of the code, while a timing on a shared runner
    // is a property of the runner.

    /**
     * A sorted track of `keys` keys whose array counts every element read.
     * Copying to sort, scanning and indexing all read through the
     * proxy, so each of the regressions above shows up in the count.
     */
    const countedTrack = (keys: number) => {
      const counter = { reads: 0 };
      const keyframes = Array.from({ length: keys }, (_, index) => ({
        id: `k${index}`,
        time: index / 60,
        value: index % 2,
      }));
      const counted = new Proxy(keyframes, {
        get(target, property, receiver) {
          if (typeof property === "string" && /^\d+$/.test(property)) {
            counter.reads += 1;
          }
          return Reflect.get(target, property, receiver);
        },
      });
      const subject = track([]);
      subject.keyframes = counted;
      return { subject, counter };
    };

    /** A binary search, plus the handful of reads around it. */
    const logarithmicBound = (keys: number) =>
      2 * Math.ceil(Math.log2(keys)) + 8;

    it("reads O(log n) keys per sample across a bake", () => {
      const keys = 10_000;
      const { subject, counter } = countedTrack(keys);

      // The first sample may walk the whole array once, comparing each pair
      // of neighbours to learn that the track is already sorted. That answer
      // is kept for the array, so it is paid once per track, not per sample.
      sampleTrackAt(subject, 0);
      expect(counter.reads).toBeLessThanOrEqual(
        2 * keys + logarithmicBound(keys),
      );

      let worst = 0;
      for (let index = 1; index < keys; index += 1) {
        for (const time of [index / 60, (index - 0.5) / 60]) {
          counter.reads = 0;
          sampleTrackAt(subject, time);
          worst = Math.max(worst, counter.reads);
        }
      }
      expect(
        worst,
        "a sample read more keys than a binary search does, which is what a " +
          "per-sample sort, sortedness check or linear scan looks like",
      ).toBeLessThanOrEqual(logarithmicBound(keys));
    });
  });

  it("sorts keyframes before sampling", () => {
    const subject = track([
      { time: 2, value: 1 },
      { time: 0, value: 0 },
    ]);
    expect(sampleTrackAt(subject, 1)).toBeCloseTo(0.5, 10);
  });
});
