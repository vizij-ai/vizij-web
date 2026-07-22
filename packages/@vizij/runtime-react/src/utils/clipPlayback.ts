/**
 * Clip metadata helpers. Sampling and playback advance live INSIDE the
 * device (the animation module, driven by the composed animations graph
 * source); JS only derives clip-level metadata such as the duration used to
 * seed the control surface before the device's player feedback arrives.
 */
import type {
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
} from "../types";

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function lastKeyframeTime(track: AnimationTrackLike): number {
  const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
  let maxTime = 0;
  keyframes.forEach((keyframe: AnimationKeyframeLike | undefined) => {
    const time = Number(keyframe?.time);
    if (Number.isFinite(time) && time > maxTime) {
      maxTime = time;
    }
  });
  return maxTime;
}

/** The clip's length in seconds: its declared duration, else its last keyframe. */
export function resolveClipDurationSeconds(
  clip: AnimationClipLike | undefined,
  fallbackDurationSeconds = 0,
): number {
  const fallback = Math.max(0, toFiniteNumber(fallbackDurationSeconds, 0));
  if (!clip || typeof clip !== "object") {
    return fallback;
  }
  const clipDuration = Number(clip.duration);
  if (Number.isFinite(clipDuration) && clipDuration > 0) {
    return clipDuration;
  }
  const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];
  let maxTime = 0;
  tracks.forEach((track) => {
    const time = lastKeyframeTime(track);
    if (time > maxTime) {
      maxTime = time;
    }
  });
  return maxTime > 0 ? maxTime : fallback;
}
