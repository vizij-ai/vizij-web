import type {
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
} from "../types";

const EPSILON = 1e-6;
const CUBIC_EASE_HANDLE_X = 0.65;
const STEP_HOLD_HANDLE_X = 0.98;

type NumericKeyframe = {
  time: number;
  value: number;
  interpolation?: AnimationTrackLike["interpolation"];
  inTangent?: number | null;
  outTangent?: number | null;
  inHandle?: { x: number; y: number } | null;
  outHandle?: { x: number; y: number } | null;
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
  const inHandle = asNumericHandle(keyframe.inHandle);
  const outHandle = asNumericHandle(keyframe.outHandle);
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
    interpolation: keyframe.interpolation as
      | AnimationTrackLike["interpolation"]
      | undefined,
    inTangent,
    outTangent,
    inHandle,
    outHandle,
  };
}

function asNumericHandle(value: unknown): { x: number; y: number } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as { x?: unknown; y?: unknown };
  const x = Number(record.x);
  const y = Number(record.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
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

function normaliseInterpolation(
  interpolation: AnimationTrackLike["interpolation"],
): "linear" | "step" | "cubic" | "spline" {
  const mode =
    typeof interpolation === "string"
      ? interpolation.trim().toLowerCase()
      : "linear";
  if (mode === "step") {
    return "step";
  }
  if (mode === "spline") {
    return "spline";
  }
  if (mode === "cubic" || mode === "cubicspline") {
    return "cubic";
  }
  return "linear";
}

function resolveHandleTangent(
  handle: NumericKeyframe["inHandle"] | NumericKeyframe["outHandle"],
  fallback: number,
): number {
  if (
    handle &&
    Number.isFinite(handle.x) &&
    Number.isFinite(handle.y) &&
    Math.abs(handle.x) > EPSILON
  ) {
    return handle.y / handle.x;
  }
  return fallback;
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

function resolveDefaultCubicHandles(
  current: NumericKeyframe,
  next: NumericKeyframe,
): {
  outHandle: NonNullable<NumericKeyframe["outHandle"]>;
  inHandle: NonNullable<NumericKeyframe["inHandle"]>;
} {
  const duration = next.time - current.time;
  return {
    outHandle: {
      x: duration * CUBIC_EASE_HANDLE_X,
      y: 0,
    },
    inHandle: {
      x: -duration * CUBIC_EASE_HANDLE_X,
      y: 0,
    },
  };
}

function resolvePresetHandles(
  mode: "linear" | "step" | "cubic",
  current: NumericKeyframe,
  next: NumericKeyframe,
): {
  outHandle: NonNullable<NumericKeyframe["outHandle"]>;
  inHandle: NonNullable<NumericKeyframe["inHandle"]>;
} {
  const duration = next.time - current.time;
  const valueDelta = next.value - current.value;
  if (mode === "linear") {
    return {
      outHandle: {
        x: duration / 3,
        y: valueDelta / 3,
      },
      inHandle: {
        x: -duration / 3,
        y: -valueDelta / 3,
      },
    };
  }
  if (mode === "step") {
    return {
      outHandle: {
        x: duration * STEP_HOLD_HANDLE_X,
        y: 0,
      },
      inHandle: {
        x: -duration * (1 - STEP_HOLD_HANDLE_X),
        y: -valueDelta,
      },
    };
  }
  return resolveDefaultCubicHandles(current, next);
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

function cubicCoordinate(
  start: number,
  cp1: number,
  cp2: number,
  end: number,
  t: number,
): number {
  const inverse = 1 - t;
  return (
    inverse * inverse * inverse * start +
    3 * inverse * inverse * t * cp1 +
    3 * inverse * t * t * cp2 +
    t * t * t * end
  );
}

function solveCubicParameterForTime(
  startTime: number,
  cp1Time: number,
  cp2Time: number,
  endTime: number,
  time: number,
): number {
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 28; iteration += 1) {
    const mid = (low + high) / 2;
    const candidate = cubicCoordinate(
      startTime,
      cp1Time,
      cp2Time,
      endTime,
      mid,
    );
    if (candidate < time) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}

function sampleExplicitHandleSegment(
  current: NumericKeyframe,
  next: NumericKeyframe,
  time: number,
): number | null {
  if (!current.outHandle && !next.inHandle) {
    return null;
  }
  const { outHandle: fallbackOut, inHandle: fallbackIn } =
    resolveDefaultCubicHandles(current, next);
  const outHandle = current.outHandle ?? fallbackOut;
  const inHandle = next.inHandle ?? fallbackIn;
  return sampleHandleSegment(current, next, time, outHandle, inHandle);
}

function sampleDefaultCubicSegment(
  current: NumericKeyframe,
  next: NumericKeyframe,
  time: number,
): number {
  const { outHandle, inHandle } = resolveDefaultCubicHandles(current, next);
  return sampleHandleSegment(current, next, time, outHandle, inHandle);
}

function samplePresetHandleSegment(
  mode: "linear" | "step" | "cubic",
  current: NumericKeyframe,
  next: NumericKeyframe,
  time: number,
): number {
  const { outHandle, inHandle } = resolvePresetHandles(mode, current, next);
  return sampleHandleSegment(current, next, time, outHandle, inHandle);
}

function sampleHandleSegment(
  current: NumericKeyframe,
  next: NumericKeyframe,
  time: number,
  outHandle: NonNullable<NumericKeyframe["outHandle"]>,
  inHandle: NonNullable<NumericKeyframe["inHandle"]>,
): number {
  const t = solveCubicParameterForTime(
    current.time,
    current.time + outHandle.x,
    next.time + inHandle.x,
    next.time,
    time,
  );
  return cubicCoordinate(
    current.value,
    current.value + outHandle.y,
    next.value + inHandle.y,
    next.value,
    t,
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
  const trackMode = normaliseInterpolation(track.interpolation);
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
      const mode = normaliseInterpolation(current.interpolation ?? trackMode);
      if (mode === "linear" || mode === "step" || mode === "cubic") {
        return samplePresetHandleSegment(mode, current, next, time);
      }
      if (mode === "spline") {
        const explicitSample = sampleExplicitHandleSegment(current, next, time);
        if (explicitSample !== null) {
          return explicitSample;
        }
        const hasTangent =
          typeof current.outTangent === "number" ||
          typeof next.inTangent === "number";
        if (!hasTangent) {
          return sampleDefaultCubicSegment(current, next, time);
        }
        const slope = (next.value - current.value) / duration;
        const outTangent = resolveTangent(
          current.outTangent,
          resolveHandleTangent(current.outHandle, slope),
        );
        const inTangent = resolveTangent(
          next.inTangent,
          resolveHandleTangent(next.inHandle, slope),
        );
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
