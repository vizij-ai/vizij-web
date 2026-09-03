import { describe, expect, it } from "vitest";
import { decimateClip, DEFAULT_DECIMATE_TOLERANCE } from "../decimateClip";
import { sampleTrackAt } from "../sampleTrack";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  type AnimationClipIR,
  type AnimationInterpolation,
  type AnimationTrackIR,
} from "../../types/animationClipIr";

function trackFrom(
  values: number[],
  interpolation: AnimationInterpolation = "linear",
): AnimationTrackIR {
  return {
    id: "t",
    variableId: "/propsrig/x/translation/y",
    channel: "/propsrig/x/translation/y",
    interpolation,
    keyframes: values.map((value, index) => ({
      id: `k${index}`,
      time: index / 60,
      value,
    })),
  };
}

function clipFrom(track: AnimationTrackIR): AnimationClipIR {
  return {
    schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
    id: "sampled",
    duration: (track.keyframes.length - 1) / 60,
    tracks: [track],
  };
}

/**
 * Largest error a linear sampler makes reading the decimated track at each
 * of the original key times. This is the property that matters: decimation is
 * only correct if what plays back still matches what was sampled.
 */
function maxReconstructionError(
  original: AnimationTrackIR,
  decimated: AnimationTrackIR,
): number {
  let worst = 0;
  for (const keyframe of original.keyframes) {
    const error = Math.abs(
      sampleTrackAt(decimated, keyframe.time) - keyframe.value,
    );
    worst = Math.max(worst, error);
  }
  return worst;
}

describe("decimateClip", () => {
  it("collapses a straight ramp to its endpoints", () => {
    const values = Array.from({ length: 61 }, (_, index) => index / 60);
    const { clip, report } = decimateClip({
      clip: clipFrom(trackFrom(values)),
    });

    expect(report.keyframesBefore).toBe(61);
    expect(clip.tracks[0]!.keyframes).toHaveLength(2);
    expect(report.keyframesAfter).toBe(2);
    expect(report.perChannel).toEqual([
      { channel: "/propsrig/x/translation/y", before: 61, after: 2 },
    ]);
  });

  it("keeps a curve within tolerance everywhere, not just at kept keys", () => {
    // A sine is the honest case: every key is slightly off the chord through
    // its neighbours, so a scheme that drops keys pairwise passes its own
    // local check while the curve as a whole drifts. Asserting the error at
    // *every original time* is what distinguishes the two.
    const values = Array.from({ length: 241 }, (_, index) =>
      Math.sin((index / 240) * Math.PI * 4),
    );
    const original = trackFrom(values);
    const { clip, report } = decimateClip({ clip: clipFrom(original) });
    const decimated = clip.tracks[0]!;

    expect(decimated.keyframes.length).toBeLessThan(values.length);
    expect(maxReconstructionError(original, decimated)).toBeLessThanOrEqual(
      DEFAULT_DECIMATE_TOLERANCE,
    );
    expect(report.keyframesAfter).toBe(decimated.keyframes.length);
  });

  it("honours a loose tolerance by dropping more, still within bound", () => {
    const values = Array.from({ length: 241 }, (_, index) =>
      Math.sin((index / 240) * Math.PI * 4),
    );
    const original = trackFrom(values);
    const tight = decimateClip({ clip: clipFrom(original), tolerance: 1e-5 });
    const loose = decimateClip({ clip: clipFrom(original), tolerance: 1e-2 });

    expect(loose.clip.tracks[0]!.keyframes.length).toBeLessThan(
      tight.clip.tracks[0]!.keyframes.length,
    );
    expect(
      maxReconstructionError(original, loose.clip.tracks[0]!),
    ).toBeLessThanOrEqual(1e-2);
  });

  it("always keeps the first and last keyframe", () => {
    // They carry the clip's start and end pose; dropping either shifts the
    // whole clip's rest position.
    const values = Array.from({ length: 61 }, () => 0.25);
    const { clip } = decimateClip({ clip: clipFrom(trackFrom(values)) });
    const keyframes = clip.tracks[0]!.keyframes;

    expect(keyframes).toHaveLength(2);
    expect(keyframes[0]!.time).toBe(0);
    expect(keyframes[1]!.time).toBeCloseTo(1, 6);
  });

  it("leaves step and cubic tracks alone", () => {
    // A step track's keys *are* the signal, and a cubic track's shape lives
    // in tangents this linear error metric cannot see.
    for (const interpolation of ["step", "cubic"] as const) {
      const values = Array.from({ length: 61 }, (_, index) => index / 60);
      const { clip, report } = decimateClip({
        clip: clipFrom(trackFrom(values, interpolation)),
      });
      expect(clip.tracks[0]!.keyframes).toHaveLength(61);
      expect(report.keyframesAfter).toBe(61);
      expect(report.perChannel).toEqual([]);
    }
  });

  it("does not choke on a very long track", () => {
    // Recursive RDP overflows the stack on a pathological curve; a 60fps
    // three-minute channel is long enough to matter.
    const values = Array.from({ length: 10_800 }, (_, index) =>
      index % 2 === 0 ? 0 : 1,
    );
    const original = trackFrom(values);
    const { clip } = decimateClip({ clip: clipFrom(original) });
    expect(
      maxReconstructionError(original, clip.tracks[0]!),
    ).toBeLessThanOrEqual(DEFAULT_DECIMATE_TOLERANCE);
  });
});

describe("sampleTrackAt cubic", () => {
  it("uses glTF CUBICSPLINE tangents rather than falling back to linear", () => {
    // Import preserves CUBICSPLINE tangents; if sampling ignored them the
    // preservation would be pointless and every imported curve would bake
    // as straight segments.
    const track: AnimationTrackIR = {
      id: "t",
      variableId: "v",
      channel: "v",
      interpolation: "cubic",
      keyframes: [
        { id: "k0", time: 0, value: 0, inTangent: 0, outTangent: 0 },
        { id: "k1", time: 1, value: 1, inTangent: 0, outTangent: 0 },
      ],
    };
    // Zero tangents at both ends give a smoothstep, whose midpoint is 0.5 but
    // whose quarter point is well below the linear 0.25.
    expect(sampleTrackAt(track, 0.5)).toBeCloseTo(0.5, 6);
    expect(sampleTrackAt(track, 0.25)).toBeCloseTo(0.15625, 6);
    expect(sampleTrackAt(track, 0.25)).not.toBeCloseTo(0.25, 3);
  });

  it("falls back to linear when a cubic key has no tangents", () => {
    // A cubic flag without tangents cannot reconstruct the curve, and
    // inventing one bends the result.
    const track: AnimationTrackIR = {
      id: "t",
      variableId: "v",
      channel: "v",
      interpolation: "cubic",
      keyframes: [
        { id: "k0", time: 0, value: 0 },
        { id: "k1", time: 1, value: 1 },
      ],
    };
    expect(sampleTrackAt(track, 0.25)).toBeCloseTo(0.25, 6);
  });

  it("holds flat outside the key range, like glTF's clamped sampler", () => {
    const track = trackFrom([2, 4, 6]);
    expect(sampleTrackAt(track, -1)).toBe(2);
    expect(sampleTrackAt(track, 99)).toBe(6);
  });
});
