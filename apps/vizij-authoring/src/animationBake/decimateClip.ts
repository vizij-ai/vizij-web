import type {
  AnimationClipIR,
  AnimationTrackIR,
} from "../types/animationClipIr";

/**
 * Sampling emits one key per frame per channel, which is correct and far too
 * large: a 22-second clip at 60fps across 80 channels is ~105k keyframes, most
 * of them on straight lines. Decimation removes the keys a linear sampler
 * would have reconstructed anyway.
 *
 * Uses Ramer-Douglas-Peucker on (time, value), which keeps the error bound
 * *global* to the curve. Dropping keys pairwise instead lets error accumulate
 * across a long ramp — each step looks acceptable next to its neighbours while
 * the curve as a whole drifts away from the sampled one.
 *
 * Endpoints are always kept: they carry the clip's start and end pose.
 */

export interface DecimateReport {
  /** Keyframes before decimation, summed across tracks. */
  keyframesBefore: number;
  keyframesAfter: number;
  /** Per-channel counts, for the export preflight. */
  perChannel: Array<{ channel: string; before: number; after: number }>;
}

export interface DecimateResult {
  clip: AnimationClipIR;
  report: DecimateReport;
}

/**
 * Maximum value error introduced by dropping a keyframe, in channel units.
 *
 * Rig channels are a mix of radians, metres and 0..1 weights, so one tolerance
 * cannot be right for all of them; this default is deliberately tight enough
 * to be invisible on all three rather than optimal for any.
 */
export const DEFAULT_DECIMATE_TOLERANCE = 1e-4;

function decimateKeyframes(
  keyframes: AnimationTrackIR["keyframes"],
  tolerance: number,
): AnimationTrackIR["keyframes"] {
  if (keyframes.length <= 2) {
    return keyframes;
  }

  const keep = new Uint8Array(keyframes.length);
  keep[0] = 1;
  keep[keyframes.length - 1] = 1;

  // Iterative rather than recursive: a 60fps multi-minute clip is deep enough
  // to overflow the stack on a pathological curve.
  const stack: Array<[number, number]> = [[0, keyframes.length - 1]];
  while (stack.length > 0) {
    const [startIndex, endIndex] = stack.pop()!;
    if (endIndex - startIndex < 2) {
      continue;
    }
    const start = keyframes[startIndex]!;
    const end = keyframes[endIndex]!;
    const span = end.time - start.time;

    let worstIndex = -1;
    let worstError = -1;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const current = keyframes[index]!;
      const expected =
        span <= 0
          ? start.value
          : start.value +
            ((end.value - start.value) * (current.time - start.time)) / span;
      const error = Math.abs(current.value - expected);
      if (error > worstError) {
        worstError = error;
        worstIndex = index;
      }
    }

    if (worstIndex >= 0 && worstError > tolerance) {
      keep[worstIndex] = 1;
      stack.push([startIndex, worstIndex], [worstIndex, endIndex]);
    }
  }

  return keyframes.filter((_, index) => keep[index] === 1);
}

/** Drop keyframes a linear sampler can reconstruct within `tolerance`. */
export function decimateClip(options: {
  clip: AnimationClipIR;
  tolerance?: number;
}): DecimateResult {
  const { clip } = options;
  const tolerance = options.tolerance ?? DEFAULT_DECIMATE_TOLERANCE;
  const perChannel: DecimateReport["perChannel"] = [];
  let keyframesBefore = 0;
  let keyframesAfter = 0;

  const tracks = clip.tracks.map((track) => {
    // Only linear tracks are safe to decimate on a linear error metric.
    // A step track's keys *are* the signal, and a cubic track's shape lives
    // in its tangents, which this metric cannot see.
    if (track.interpolation !== "linear") {
      keyframesBefore += track.keyframes.length;
      keyframesAfter += track.keyframes.length;
      return track;
    }
    const decimated = decimateKeyframes(track.keyframes, tolerance);
    keyframesBefore += track.keyframes.length;
    keyframesAfter += decimated.length;
    perChannel.push({
      channel: track.channel,
      before: track.keyframes.length,
      after: decimated.length,
    });
    return decimated.length === track.keyframes.length
      ? track
      : { ...track, keyframes: decimated };
  });

  return {
    clip: { ...clip, tracks },
    report: { keyframesBefore, keyframesAfter, perChannel },
  };
}
