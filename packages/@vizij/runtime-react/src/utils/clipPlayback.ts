import type {
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
} from "../types";

const EPSILON = 1e-6;

type NumericKeyframe = {
  time: number;
  value: number;
  inTangent?: number | null;
  outTangent?: number | null;
};

export type TrackSample = {
  path: string;
  value: number;
};

export type AdvanceClipTimeInput = {
  time: number;
  duration: number;
  speed: number;
  loop: boolean;
  playing: boolean;
};

export type AdvanceClipTimeResult = {
  time: number;
  completed: boolean;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normaliseInterpolation(
  interpolation: AnimationTrackLike["interpolation"],
): "linear" | "step" | "cubic" {
  const mode =
    typeof interpolation === "string"
      ? interpolation.trim().toLowerCase()
      : "linear";
  if (mode === "step") {
    return "step";
  }
  if (mode === "cubic" || mode === "cubicspline") {
    return "cubic";
  }
  return "linear";
}

function asNumericKeyframe(
  keyframe: AnimationKeyframeLike | undefined,
): NumericKeyframe | null {
  if (!keyframe || typeof keyframe !== "object") {
    return null;
  }
  const time = Number(keyframe.time);
  const value = Number(keyframe.value);
  if (!Number.isFinite(time) || !Number.isFinite(value)) {
    return null;
  }
  const inTangentRaw = keyframe.inTangent;
  const outTangentRaw = keyframe.outTangent;
  const inTangent =
    inTangentRaw == null || Number.isFinite(Number(inTangentRaw))
      ? (inTangentRaw as number | null | undefined)
      : undefined;
  const outTangent =
    outTangentRaw == null || Number.isFinite(Number(outTangentRaw))
      ? (outTangentRaw as number | null | undefined)
      : undefined;
  return {
    time,
    value,
    inTangent,
    outTangent,
  };
}

function getNumericKeyframes(track: AnimationTrackLike): NumericKeyframe[] {
  const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
  const numeric = keyframes
    .map((keyframe) => asNumericKeyframe(keyframe))
    .filter((keyframe): keyframe is NumericKeyframe => Boolean(keyframe));
  if (numeric.length <= 1) {
    return numeric;
  }
  return [...numeric].sort((a, b) => a.time - b.time);
}

function resolveTangent(
  value: number | null | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  return fallback;
}

function sampleHermite(
  startValue: number,
  endValue: number,
  outTangent: number,
  inTangent: number,
  factor: number,
  duration: number,
): number {
  const t = factor;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return (
    h00 * startValue +
    h10 * outTangent * duration +
    h01 * endValue +
    h11 * inTangent * duration
  );
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
  const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];
  let maxTime = 0;
  tracks.forEach((track) => {
    const keyframes = getNumericKeyframes(track);
    const last = keyframes[keyframes.length - 1];
    if (last && last.time > maxTime) {
      maxTime = last.time;
    }
  });
  return maxTime > 0 ? maxTime : fallback;
}

export function clampAnimationTime(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  if (!Number.isFinite(time)) {
    return 0;
  }
  if (time <= 0) {
    return 0;
  }
  if (time >= duration) {
    return duration;
  }
  return time;
}

export function advanceClipTime(
  state: AdvanceClipTimeInput,
  dt: number,
): AdvanceClipTimeResult {
  const duration = Math.max(0, toFiniteNumber(state.duration, 0));
  const speed =
    Number.isFinite(state.speed) && state.speed > 0 ? state.speed : 1;
  const currentTime = clampAnimationTime(state.time, duration);
  const delta = Number.isFinite(dt) && dt > 0 ? Math.max(0, dt) * speed : 0;

  if (!state.playing || delta <= 0) {
    return { time: currentTime, completed: false };
  }

  if (duration <= 0) {
    return { time: 0, completed: true };
  }

  const nextTime = currentTime + delta;
  if (state.loop) {
    if (nextTime < duration) {
      return { time: nextTime, completed: false };
    }
    const wrapped = ((nextTime % duration) + duration) % duration;
    return { time: wrapped, completed: false };
  }

  if (nextTime >= duration - EPSILON) {
    return { time: duration, completed: true };
  }
  return { time: nextTime, completed: false };
}

export function resolveTrackInputPath(
  clipId: string,
  track: AnimationTrackLike,
): string | null {
  const channel =
    typeof track.channel === "string"
      ? track.channel.trim().replace(/^\/+/, "")
      : "";
  if (!channel) {
    return null;
  }
  return `animation/${clipId}/${channel}`;
}

export function sampleTrackAtTime(
  track: AnimationTrackLike,
  timeSeconds: number,
): number {
  const keyframes = getNumericKeyframes(track);
  if (keyframes.length === 0) {
    return 0;
  }
  if (keyframes.length === 1) {
    return keyframes[0]!.value;
  }
  const mode = normaliseInterpolation(track.interpolation);
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const first = keyframes[0]!;
  if (time <= first.time + EPSILON) {
    return first.value;
  }
  const last = keyframes[keyframes.length - 1]!;
  if (time >= last.time - EPSILON) {
    return last.value;
  }

  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const current = keyframes[i]!;
    const next = keyframes[i + 1]!;
    const start = current.time;
    const end = next.time;
    const duration = end - start;

    if (duration <= EPSILON) {
      if (time <= end + EPSILON) {
        return next.value;
      }
      continue;
    }

    if (Math.abs(time - end) <= EPSILON) {
      return next.value;
    }

    if (time < end) {
      const factor = (time - start) / duration;
      if (mode === "step") {
        return current.value;
      }
      if (mode === "cubic") {
        const slope = (next.value - current.value) / duration;
        const outTangent = resolveTangent(current.outTangent, slope);
        const inTangent = resolveTangent(next.inTangent, slope);
        return sampleHermite(
          current.value,
          next.value,
          outTangent,
          inTangent,
          factor,
          duration,
        );
      }
      return current.value + (next.value - current.value) * factor;
    }
  }
  return last.value;
}

export function sampleClipAtTime(
  clipId: string,
  clip: AnimationClipLike,
  timeSeconds: number,
  weight = 1,
): TrackSample[] {
  const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];
  if (tracks.length === 0) {
    return [];
  }
  const appliedWeight =
    Number.isFinite(weight) && weight >= 0 ? Number(weight) : 1;
  const samples: TrackSample[] = [];
  tracks.forEach((track) => {
    const path = resolveTrackInputPath(clipId, track);
    if (!path) {
      return;
    }
    samples.push({
      path,
      value: sampleTrackAtTime(track, timeSeconds) * appliedWeight,
    });
  });
  return samples;
}
