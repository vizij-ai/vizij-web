import type { AnimationTrackIR } from "../types/animationClipIr";

/**
 * Evaluate one scalar track at an arbitrary time.
 *
 * Baking and graph sampling both need values *between* keys, at frame times
 * that have no relationship to where the author put keyframes. Held flat
 * outside the key range, matching glTF's clamped sampler.
 */
export function sampleTrackAt(track: AnimationTrackIR, time: number): number {
  const keyframes = track.keyframes;
  if (keyframes.length === 0) {
    return 0;
  }
  const first = keyframes[0]!;
  if (time <= first.time) {
    return first.value;
  }
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time) {
    return last.value;
  }

  for (let index = 0; index < keyframes.length - 1; index += 1) {
    const start = keyframes[index]!;
    const end = keyframes[index + 1]!;
    if (time < start.time || time > end.time) {
      continue;
    }
    const span = end.time - start.time;
    if (span <= 0) {
      return end.value;
    }
    const alpha = (time - start.time) / span;
    const interpolation = start.interpolation ?? track.interpolation;

    if (interpolation === "step") {
      return start.value;
    }

    if (interpolation === "cubic") {
      // glTF CUBICSPLINE: tangents are derivatives per second, so each is
      // scaled by the segment duration. Falls back to linear when either
      // tangent is absent — a cubic flag without tangents is not enough to
      // reconstruct the curve, and guessing one bends the result.
      const outTangent = start.outTangent;
      const inTangent = end.inTangent;
      if (
        typeof outTangent === "number" &&
        typeof inTangent === "number" &&
        Number.isFinite(outTangent) &&
        Number.isFinite(inTangent)
      ) {
        const t2 = alpha * alpha;
        const t3 = t2 * alpha;
        return (
          (2 * t3 - 3 * t2 + 1) * start.value +
          span * (t3 - 2 * t2 + alpha) * outTangent +
          (-2 * t3 + 3 * t2) * end.value +
          span * (t3 - t2) * inTangent
        );
      }
    }

    return start.value + (end.value - start.value) * alpha;
  }
  return last.value;
}

/** Sorted union of every track's key times. */
export function unionKeyTimes(
  tracks: ReadonlyArray<AnimationTrackIR>,
): number[] {
  const seen = new Set<number>();
  for (const track of tracks) {
    for (const keyframe of track.keyframes) {
      seen.add(keyframe.time);
    }
  }
  return [...seen].sort((left, right) => left - right);
}
