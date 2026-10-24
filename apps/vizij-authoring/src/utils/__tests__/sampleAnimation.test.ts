// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  sampleAnimationTrack,
  sampleAnimationTracks,
} from "../sampleAnimation";
import type { AnimationTrackIR } from "../../types/animationClipIr";

/**
 * What authoring reads an animation's values with: Arora's animation module,
 * the engine the face plays it with. The cases are pinned to concrete values
 * — the glTF `CUBICSPLINE` Hermite on the keyframes' tangents, the chord slope
 * where one is absent — rather than compared against a second evaluator,
 * since a second evaluator is what could drift from the face.
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

describe("sampleAnimationTrack", () => {
  describe("tangents and interpolation names", () => {
    it("keeps a lone out tangent instead of going straight", async () => {
      // The straight line would read 0.25 here.
      const subject = track(
        [
          { time: 0, value: 0, outTangent: 3 },
          { time: 2, value: 1 },
        ],
        "cubic",
      );
      expect(await sampleAnimationTrack(subject, 0.5)).toBeCloseTo(
        0.953125,
        10,
      );
    });

    it("keeps a lone in tangent instead of going straight", async () => {
      const subject = track(
        [
          { time: 0, value: 0 },
          { time: 2, value: 1, inTangent: -4 },
        ],
        "cubic",
      );
      expect(await sampleAnimationTrack(subject, 0.5)).toBeCloseTo(
        0.671875,
        10,
      );
    });

    it("reads 'smooth' as cubic", async () => {
      const subject = track(
        [
          { time: 0, value: 0, outTangent: 0 },
          { time: 2, value: 1, inTangent: 0 },
        ],
        "smooth" as AnimationTrackIR["interpolation"],
      );
      expect(await sampleAnimationTrack(subject, 0.5)).toBeCloseTo(0.15625, 10);
    });

    it("does not let a non-finite tangent poison the value", async () => {
      // A NaN tangent reads as absent: the chord slope.
      const subject = track(
        [
          { time: 0, value: 0, outTangent: Number.NaN },
          { time: 2, value: 1, inTangent: 1 },
        ],
        "cubic",
      );
      expect(await sampleAnimationTrack(subject, 0.5)).toBeCloseTo(
        0.203125,
        10,
      );
    });
  });

  it("samples an untangented cubic exactly like a linear one", async () => {
    // Chord-slope Hermite reduces to the straight line when both tangents are
    // missing, so a cubic flag with no tangent data invents no curve.
    const keys = [
      { time: 0, value: 0 },
      { time: 2, value: 1 },
    ];
    for (const time of [0.25, 0.5, 1, 1.75]) {
      expect(
        await sampleAnimationTrack(track(keys, "cubic"), time),
      ).toBeCloseTo(
        await sampleAnimationTrack(track(keys, "linear"), time),
        10,
      );
    }
  });

  it("holds flat outside the key range, like glTF's clamped sampler", async () => {
    const subject = track([
      { time: 1, value: 2 },
      { time: 3, value: 6 },
    ]);
    expect(await sampleAnimationTrack(subject, -1)).toBeCloseTo(2, 10);
    expect(await sampleAnimationTrack(subject, 99)).toBeCloseTo(6, 10);
  });

  it("returns 0 for a track with no keyframes", async () => {
    expect(await sampleAnimationTrack(track([]), 1)).toBe(0);
  });

  it("honours a per-key interpolation override", async () => {
    const subject = track(
      [
        { time: 0, value: 0, interpolation: "step" },
        { time: 1, value: 1 },
      ],
      "linear",
    );
    expect(await sampleAnimationTrack(subject, 0.5)).toBe(0);
  });

  it("plays a step's next key from that key's instant", async () => {
    const subject = track([
      { time: 0, value: 0, interpolation: "step" },
      { time: 1, value: 1, interpolation: "step" },
      { time: 2, value: 4 },
    ]);
    expect(await sampleAnimationTrack(subject, 0.999)).toBe(0);
    expect(await sampleAnimationTrack(subject, 1)).toBeCloseTo(1, 10);
    expect(await sampleAnimationTrack(subject, 1.5)).toBeCloseTo(1, 10);
  });

  describe("two keys sharing a time (an instantaneous jump)", () => {
    const jump = () =>
      track([
        { time: 0, value: 0 },
        { time: 1, value: 5 },
        { time: 1, value: 9 },
        { time: 2, value: 9 },
      ]);

    it("has not yet jumped at the shared time itself", async () => {
      // At a keyframe's instant the segment arriving there still plays, so
      // a bake sampling at that instant keeps the jump where it is authored.
      expect(await sampleAnimationTrack(jump(), 1)).toBeCloseTo(5, 10);
    });

    it("has jumped just after it", async () => {
      expect(await sampleAnimationTrack(jump(), 1.5)).toBeCloseTo(9, 10);
    });

    it("interpolates out of the second key, not the first", async () => {
      const subject = track([
        { time: 1, value: 0 },
        { time: 1, value: 5 },
        { time: 2, value: 1 },
      ]);
      expect(await sampleAnimationTrack(subject, 1.5)).toBeCloseTo(3, 10);
    });
  });

  it("sorts keyframes before sampling", async () => {
    const subject = track([
      { time: 2, value: 1 },
      { time: 0, value: 0 },
    ]);
    expect(await sampleAnimationTrack(subject, 1)).toBeCloseTo(0.5, 10);
  });
});

describe("sampleAnimationTracks", () => {
  const ramp = (id: string, to: number): AnimationTrackIR => ({
    id,
    variableId: id,
    channel: id,
    interpolation: "linear",
    keyframes: [
      { id: `${id}0`, time: 0, value: 0 },
      { id: `${id}1`, time: 1, value: to },
    ],
  });

  it("reads every track at every time, in the order asked", async () => {
    expect(
      await sampleAnimationTracks([ramp("a", 1), ramp("b", -2)], [1, 0, 0.5]),
    ).toEqual([
      [expect.closeTo(1, 10), expect.closeTo(0, 10), expect.closeTo(0.5, 10)],
      [expect.closeTo(-2, 10), expect.closeTo(0, 10), expect.closeTo(-1, 10)],
    ]);
  });

  it("reads two tracks of one channel each in full", async () => {
    // On a face the first track on a key claims it; here each is its own.
    const twin = { ...ramp("a", -1), id: "twin" };
    expect(await sampleAnimationTracks([ramp("a", 1), twin], [1])).toEqual([
      [expect.closeTo(1, 10)],
      [expect.closeTo(-1, 10)],
    ]);
  });

  it("reads an edited track's new curve", async () => {
    const before = ramp("a", 1);
    expect((await sampleAnimationTracks([before], [1]))[0]).toEqual([
      expect.closeTo(1, 10),
    ]);
    const after = {
      ...before,
      keyframes: before.keyframes.map((key) => ({
        ...key,
        value: 3 * key.value,
      })),
    };
    expect((await sampleAnimationTracks([after], [1]))[0]).toEqual([
      expect.closeTo(3, 10),
    ]);
  });

  it("answers concurrent samplings each with its own values", async () => {
    const [left, right] = await Promise.all([
      sampleAnimationTracks([ramp("a", 1)], [0.25, 0.75]),
      sampleAnimationTracks([ramp("b", 2)], [0.5]),
    ]);
    expect(left).toEqual([
      [expect.closeTo(0.25, 10), expect.closeTo(0.75, 10)],
    ]);
    expect(right).toEqual([[expect.closeTo(1, 10)]]);
  });
});
