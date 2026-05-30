import type { AnimationClipLike, AnimationKeyframeLike } from "../types";

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asNumericKeyframe(
  keyframe: AnimationKeyframeLike | undefined,
): { time: number } | null {
  if (!keyframe || typeof keyframe !== "object") {
    return null;
  }
  const time = Number(keyframe.time);
  const value = Number(keyframe.value);
  if (!Number.isFinite(time) || !Number.isFinite(value)) {
    return null;
  }
  return { time };
}

function getNumericKeyframeTimes(clip: AnimationClipLike): number[] {
  const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];
  return tracks.flatMap((track) => {
    const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
    return keyframes
      .map((keyframe) => asNumericKeyframe(keyframe)?.time)
      .filter((time): time is number => Number.isFinite(time));
  });
}

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
  const maxTime = getNumericKeyframeTimes(clip).reduce(
    (max, time) => (time > max ? time : max),
    0,
  );
  return maxTime > 0 ? maxTime : fallback;
}
