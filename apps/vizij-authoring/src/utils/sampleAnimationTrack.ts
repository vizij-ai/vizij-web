import type {
  AnimationInterpolation,
  AnimationTrackIR,
} from "../types/animationClipIr";

/**
 * The one place a keyframe track is turned into a value.
 *
 * There used to be two of these — one behind the timeline preview and the
 * store, one behind the GLB bake and pose capture — with the same signature
 * over the same type and no test comparing them. They agreed on the common
 * cases and disagreed on three: a cubic key with only one tangent, an
 * interpolation of `"smooth"`, and a non-finite tangent. For a round trip
 * whose whole premise is that the exported file plays what the timeline
 * showed, that is the premise failing quietly. `samplerParity.test.ts` now
 * fails if they ever diverge again.
 *
 * Held flat outside the key range, matching glTF's clamped sampler.
 */

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeInterpolation(value: unknown): AnimationInterpolation {
  if (value === "linear" || value === "step" || value === "cubic") {
    return value;
  }
  if (value === "smooth") {
    return "cubic";
  }
  return "linear";
}

/**
 * A tangent is only usable if it is actually a finite number. Anything else
 * falls back to the segment's chord slope, which makes the Hermite reduce to
 * the straight line between the two keys when *both* tangents are missing —
 * so an untangented cubic and a linear key sample identically, and one bad
 * tangent bends its own half of the segment instead of poisoning the value.
 */
function tangentOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Keyframes are almost always already in order — `compileAnimationClipIr`
 * sorts them, and the editor inserts in place. Checking is O(n) and lets the
 * common case skip an allocation and a sort *per sample*; a bake of a
 * 10,000-key track samples it 10,000 times.
 */
function isSorted(keyframes: AnimationTrackIR["keyframes"]): boolean {
  for (let index = 1; index < keyframes.length; index += 1) {
    if (keyframes[index]!.time < keyframes[index - 1]!.time) {
      return false;
    }
  }
  return true;
}

/**
 * Start index of the *first* segment that contains `time` — the smallest `i`
 * where `keyframes[i + 1].time >= time`.
 *
 * "First" matters only when two keys share a time, which is how an author
 * writes an instantaneous jump. Landing on the last such key instead would
 * move the jump a frame earlier, so this reproduces what the scan it replaced
 * did rather than picking the nicer-looking answer.
 */
function segmentStartIndex(
  keyframes: AnimationTrackIR["keyframes"],
  time: number,
): number {
  let low = 0;
  let high = keyframes.length - 2;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (keyframes[mid + 1]!.time >= time - EPSILON) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

export function sampleTrackAt(track: AnimationTrackIR, time: number): number {
  const raw = track.keyframes;
  if (!Array.isArray(raw) || raw.length === 0) {
    return 0;
  }

  const keyframes = isSorted(raw)
    ? raw
    : [...raw].sort((left, right) => {
        if (left.time !== right.time) {
          return left.time - right.time;
        }
        return left.id.localeCompare(right.id);
      });

  if (time <= keyframes[0]!.time + EPSILON) {
    return keyframes[0]!.value;
  }

  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time - EPSILON) {
    return last.value;
  }

  const index = segmentStartIndex(keyframes, time);
  const start = keyframes[index]!;
  const end = keyframes[index + 1]!;

  const span = end.time - start.time;
  if (span <= EPSILON) {
    return end.value;
  }

  const alpha = clamp((time - start.time) / span, 0, 1);
  const interpolation = normalizeInterpolation(
    start.interpolation ?? track.interpolation,
  );

  if (interpolation === "step") {
    return start.value;
  }

  if (interpolation === "cubic") {
    // glTF CUBICSPLINE: tangents are derivatives per second, so each is
    // scaled by the segment duration.
    const slope = (end.value - start.value) / span;
    const startTangent = tangentOr(start.outTangent, slope);
    const endTangent = tangentOr(end.inTangent, slope);
    const t2 = alpha * alpha;
    const t3 = t2 * alpha;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + alpha;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    return (
      h00 * start.value +
      h10 * startTangent * span +
      h01 * end.value +
      h11 * endTangent * span
    );
  }

  return start.value + (end.value - start.value) * alpha;
}
