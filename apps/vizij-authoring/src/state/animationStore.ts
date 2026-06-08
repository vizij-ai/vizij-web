import { create } from "zustand";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  compileAnimationClipIr,
  evaluateAnimationTrackAtTime,
  type AnimationClipIR,
  type AnimationHandleIR,
  type AnimationKeyframeIR,
  type AnimationTrackIR,
} from "@vizij/studio-support";
import { ANIMATION_TIMELINE_FPS } from "../utils/animationTimeDisplay";

export type AnimationHandle = AnimationHandleIR;
export type AnimationHandleLock = "smooth";
export type AnimationKeyframe = AnimationKeyframeIR & {
  handleLock?: AnimationHandleLock;
};
export type AnimationTrack = Omit<AnimationTrackIR, "keyframes"> & {
  keyframes: AnimationKeyframe[];
};
export type AnimationTransportPlaybackState = "playing" | "paused" | "stopped";
export type AnimationTimeDisplayMode = "seconds" | "frames";
export type AnimationCurveSelection =
  | { kind: "keyframe"; keyframeId: string }
  | { kind: "segment"; segmentIndex: number }
  | { kind: "handle"; segmentIndex: number; side: "out" | "in" };
export type AnimationRuntimePlaybackState = {
  time: number;
  duration: number;
  playing: boolean;
  loop: boolean;
  speed: number;
};
export type AnimationRuntimeTransportAdapter = {
  playAnimation: (
    id: string,
    options?: { weight?: number; speed?: number; reset?: boolean },
  ) => Promise<void>;
  pauseAnimation: (id: string) => void;
  stopAnimation: (id: string, options?: { clearOutputs?: boolean }) => void;
  seekAnimation: (id: string, timeSeconds: number) => void;
  setAnimationLoop: (id: string, enabled: boolean) => void;
  getAnimationState: (id: string) => AnimationRuntimePlaybackState | null;
};

export interface AnimationInputKeyframeEntry {
  inputId: string;
  value: number;
  label?: string;
  channel?: string;
}

const MIN_DURATION_SECONDS = 0;
const TIME_EPSILON = 1e-6;
const FRAME_TIME_MATCH_TOLERANCE_SECONDS = 1 / ANIMATION_TIMELINE_FPS;
const CUBIC_EASE_HANDLE_X = 0.65;
const STEP_HOLD_HANDLE_X = 0.98;
const TRACK_ID_PREFIX = "track-";
const KEYFRAME_ID_PREFIX = "kf-";

function quantizeTime(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clampTime(value: number, duration: number): number {
  const normalizedDuration = Number.isFinite(duration)
    ? Math.max(MIN_DURATION_SECONDS, duration)
    : MIN_DURATION_SECONDS;
  const safeValue = Number.isFinite(value) ? value : 0;
  return quantizeTime(
    Math.max(MIN_DURATION_SECONDS, Math.min(safeValue, normalizedDuration)),
  );
}

function isSameTime(left: number, right: number): boolean {
  return Math.abs(left - right) <= TIME_EPSILON;
}

function quantizeHandle(handle: AnimationHandle): AnimationHandle {
  return {
    x: quantizeTime(handle.x),
    y: quantizeTime(handle.y),
  };
}

function normalizeHandle(value: unknown): AnimationHandle | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<AnimationHandle>;
  const x = Number(record.x);
  const y = Number(record.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return quantizeHandle({ x, y });
}

function invertHandle(handle: AnimationHandle): AnimationHandle {
  return quantizeHandle({
    x: -handle.x,
    y: -handle.y,
  });
}

function resolvePresetHandles(
  interpolation: AnimationTrack["interpolation"],
  start: AnimationKeyframe,
  end: AnimationKeyframe,
): { outHandle: AnimationHandle; inHandle: AnimationHandle } {
  const span = Math.max(end.time - start.time, TIME_EPSILON);
  const valueDelta = end.value - start.value;
  if (interpolation === "linear") {
    return {
      outHandle: { x: span / 3, y: valueDelta / 3 },
      inHandle: { x: -span / 3, y: -valueDelta / 3 },
    };
  }
  if (interpolation === "step") {
    return {
      outHandle: { x: span * STEP_HOLD_HANDLE_X, y: 0 },
      inHandle: {
        x: -span * (1 - STEP_HOLD_HANDLE_X),
        y: -valueDelta,
      },
    };
  }
  return {
    outHandle: { x: span * CUBIC_EASE_HANDLE_X, y: 0 },
    inHandle: { x: -span * CUBIC_EASE_HANDLE_X, y: 0 },
  };
}

function resolveSegmentHandles(
  track: AnimationTrack,
  segmentIndex: number,
): { outHandle: AnimationHandle; inHandle: AnimationHandle } | null {
  const start = track.keyframes[segmentIndex];
  const end = track.keyframes[segmentIndex + 1];
  if (!start || !end || end.time <= start.time + TIME_EPSILON) {
    return null;
  }
  const interpolation = start.interpolation ?? track.interpolation;
  const preset = resolvePresetHandles(interpolation, start, end);
  if (interpolation !== "spline") {
    return {
      outHandle: quantizeHandle(preset.outHandle),
      inHandle: quantizeHandle(preset.inHandle),
    };
  }
  const span = end.time - start.time;
  const outHandle =
    normalizeHandle(start.outHandle) ??
    (typeof start.outTangent === "number"
      ? { x: span / 3, y: (start.outTangent * span) / 3 }
      : null) ??
    preset.outHandle;
  const inHandle =
    normalizeHandle(end.inHandle) ??
    (typeof end.inTangent === "number"
      ? { x: -span / 3, y: (-end.inTangent * span) / 3 }
      : null) ??
    preset.inHandle;
  return {
    outHandle: quantizeHandle(outHandle),
    inHandle: quantizeHandle(inHandle),
  };
}

function keyframeCanLockHandles(
  track: AnimationTrack,
  keyframeIndex: number,
): boolean {
  return keyframeIndex > 0 && keyframeIndex < track.keyframes.length - 1;
}

function orientHandleForSide(
  handle: AnimationHandle,
  side: "out" | "in",
): AnimationHandle {
  const xMagnitude = Math.max(0, Math.abs(handle.x));
  return quantizeHandle({
    x: side === "out" ? xMagnitude : -xMagnitude,
    y: handle.y,
  });
}

function clampSmoothHandleForKeyframe(
  track: AnimationTrack,
  keyframeIndex: number,
  sourceSide: "out" | "in",
  sourceHandle: AnimationHandle,
): AnimationHandle {
  const current = track.keyframes[keyframeIndex];
  const previous = track.keyframes[keyframeIndex - 1];
  const next = track.keyframes[keyframeIndex + 1];
  const oriented = orientHandleForSide(sourceHandle, sourceSide);
  if (!current || !previous || !next) {
    return oriented;
  }
  const maxMagnitude = Math.max(
    0,
    Math.min(current.time - previous.time, next.time - current.time) -
      TIME_EPSILON,
  );
  if (maxMagnitude <= 0) {
    return { ...oriented, x: 0 };
  }
  const xMagnitude = Math.min(Math.abs(oriented.x), maxMagnitude);
  return quantizeHandle({
    x: sourceSide === "out" ? xMagnitude : -xMagnitude,
    y: oriented.y,
  });
}

function patchKeyframe(
  keyframes: AnimationKeyframe[],
  index: number,
  patch: Partial<AnimationKeyframe>,
) {
  const keyframe = keyframes[index];
  if (!keyframe) {
    return;
  }
  keyframes[index] = {
    ...keyframe,
    ...patch,
  };
}

function sortKeyframesByTime(
  keyframes: ReadonlyArray<AnimationKeyframe>,
): AnimationKeyframe[] {
  return [...keyframes].sort((left, right) => {
    if (left.time !== right.time) {
      return left.time - right.time;
    }
    return left.id.localeCompare(right.id);
  });
}

function applySmoothLockAtKeyframe(
  track: AnimationTrack,
  keyframes: AnimationKeyframe[],
  keyframeIndex: number,
  sourceSide: "out" | "in",
  sourceHandle: AnimationHandle,
) {
  if (!keyframeCanLockHandles(track, keyframeIndex)) {
    return;
  }
  const source = clampSmoothHandleForKeyframe(
    track,
    keyframeIndex,
    sourceSide,
    sourceHandle,
  );
  const outHandle = sourceSide === "out" ? source : invertHandle(source);
  const inHandle = sourceSide === "in" ? source : invertHandle(source);
  patchKeyframe(keyframes, keyframeIndex - 1, {
    interpolation: "spline",
    outTangent: undefined,
  });
  patchKeyframe(keyframes, keyframeIndex, {
    handleLock: "smooth",
    interpolation: "spline",
    inHandle,
    outHandle,
    inTangent: undefined,
    outTangent: undefined,
  });
}

function resolveSmoothLockSourceHandle(
  track: AnimationTrack,
  keyframeIndex: number,
  sourceSide?: "out" | "in",
): { side: "out" | "in"; handle: AnimationHandle } | null {
  const incoming = resolveSegmentHandles(track, keyframeIndex - 1)?.inHandle;
  const outgoing = resolveSegmentHandles(track, keyframeIndex)?.outHandle;
  if (sourceSide === "in" && incoming) {
    return { side: "in", handle: incoming };
  }
  if (sourceSide === "out" && outgoing) {
    return { side: "out", handle: outgoing };
  }
  if (incoming && outgoing) {
    return {
      side: "out",
      handle: quantizeHandle({
        x: (outgoing.x - incoming.x) / 2,
        y: (outgoing.y - incoming.y) / 2,
      }),
    };
  }
  if (outgoing) {
    return { side: "out", handle: outgoing };
  }
  if (incoming) {
    return { side: "in", handle: incoming };
  }
  return null;
}

function updateTrackSegmentHandle(
  track: AnimationTrack,
  segmentIndex: number,
  side: "out" | "in",
  handle: AnimationHandle,
): AnimationTrack {
  const start = track.keyframes[segmentIndex];
  const end = track.keyframes[segmentIndex + 1];
  if (!start || !end) {
    return track;
  }
  const keyframes = track.keyframes.map((keyframe) => ({ ...keyframe }));
  const anchorIndex = side === "out" ? segmentIndex : segmentIndex + 1;
  const anchor = track.keyframes[anchorIndex];
  const anchorLocked =
    anchor?.handleLock === "smooth" &&
    keyframeCanLockHandles(track, anchorIndex);
  const sourceHandle = anchorLocked
    ? clampSmoothHandleForKeyframe(track, anchorIndex, side, handle)
    : orientHandleForSide(handle, side);

  if (side === "out") {
    patchKeyframe(keyframes, segmentIndex, {
      interpolation: "spline",
      outHandle: sourceHandle,
      outTangent: undefined,
    });
  } else {
    patchKeyframe(keyframes, segmentIndex, {
      interpolation: "spline",
      outTangent: undefined,
    });
    patchKeyframe(keyframes, segmentIndex + 1, {
      inHandle: sourceHandle,
      inTangent: undefined,
    });
  }

  if (anchorLocked) {
    applySmoothLockAtKeyframe(
      track,
      keyframes,
      anchorIndex,
      side,
      sourceHandle,
    );
  }

  return {
    ...track,
    keyframes: sortKeyframesByTime(keyframes),
  };
}

function updateTrackSegmentInterpolation(
  track: AnimationTrack,
  segmentIndex: number,
  interpolation: AnimationTrack["interpolation"],
  handles: { outHandle: AnimationHandle; inHandle: AnimationHandle },
): AnimationTrack {
  const start = track.keyframes[segmentIndex];
  const end = track.keyframes[segmentIndex + 1];
  if (!start || !end) {
    return track;
  }
  const keyframes = track.keyframes.map((keyframe) => ({ ...keyframe }));
  patchKeyframe(keyframes, segmentIndex, {
    interpolation,
    outHandle: quantizeHandle(handles.outHandle),
    outTangent: undefined,
  });
  patchKeyframe(keyframes, segmentIndex + 1, {
    inHandle: quantizeHandle(handles.inHandle),
    inTangent: undefined,
  });

  if (
    start.handleLock === "smooth" &&
    keyframeCanLockHandles(track, segmentIndex)
  ) {
    applySmoothLockAtKeyframe(
      track,
      keyframes,
      segmentIndex,
      "out",
      handles.outHandle,
    );
  }

  if (
    end.handleLock === "smooth" &&
    keyframeCanLockHandles(track, segmentIndex + 1)
  ) {
    applySmoothLockAtKeyframe(
      track,
      keyframes,
      segmentIndex + 1,
      "in",
      handles.inHandle,
    );
  }

  return {
    ...track,
    keyframes: sortKeyframesByTime(keyframes),
  };
}

function updateTrackKeyframeHandleLock(
  track: AnimationTrack,
  keyframeId: string,
  locked: boolean,
  sourceSide?: "out" | "in",
): AnimationTrack {
  const keyframeIndex = track.keyframes.findIndex(
    (keyframe) => keyframe.id === keyframeId,
  );
  if (keyframeIndex < 0) {
    return track;
  }
  const keyframes = track.keyframes.map((keyframe) => ({ ...keyframe }));
  if (!locked) {
    patchKeyframe(keyframes, keyframeIndex, { handleLock: undefined });
    return { ...track, keyframes };
  }
  if (!keyframeCanLockHandles(track, keyframeIndex)) {
    return track;
  }
  const source = resolveSmoothLockSourceHandle(
    track,
    keyframeIndex,
    sourceSide,
  );
  if (!source) {
    return track;
  }
  applySmoothLockAtKeyframe(
    track,
    keyframes,
    keyframeIndex,
    source.side,
    source.handle,
  );
  return {
    ...track,
    keyframes: sortKeyframesByTime(keyframes),
  };
}

function findNearestKeyframeWithinFrameTolerance(
  keyframes: ReadonlyArray<AnimationKeyframe>,
  time: number,
): AnimationKeyframe | null {
  let nearest: AnimationKeyframe | null = null;
  let nearestDelta = Number.POSITIVE_INFINITY;
  keyframes.forEach((keyframe) => {
    const delta = Math.abs(keyframe.time - time);
    if (delta > FRAME_TIME_MATCH_TOLERANCE_SECONDS) {
      return;
    }
    if (
      delta < nearestDelta ||
      (isSameTime(delta, nearestDelta) &&
        nearest !== null &&
        keyframe.time < nearest.time)
    ) {
      nearest = keyframe;
      nearestDelta = delta;
    }
  });
  return nearest;
}

function deterministicTrackColor(variableId: string): string {
  let hash = 0;
  for (let index = 0; index < variableId.length; index += 1) {
    hash = (hash * 31 + variableId.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 52%)`;
}

function parseOrdinalFromId(id: string, prefix: string): number | null {
  if (!id.startsWith(prefix)) {
    return null;
  }
  const value = Number.parseInt(id.slice(prefix.length), 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatTrackId(ordinal: number): string {
  return `${TRACK_ID_PREFIX}${ordinal.toString().padStart(4, "0")}`;
}

function formatKeyframeId(ordinal: number): string {
  return `${KEYFRAME_ID_PREFIX}${ordinal.toString().padStart(6, "0")}`;
}

function normalizeKeyframesForTrack(
  keyframes: ReadonlyArray<AnimationKeyframe>,
  duration: number,
): AnimationKeyframe[] {
  const normalizeInterpolationOverride = (
    value: unknown,
  ): AnimationTrack["interpolation"] | undefined => {
    if (
      value === "linear" ||
      value === "step" ||
      value === "cubic" ||
      value === "spline"
    ) {
      return value;
    }
    return undefined;
  };
  const sorted = keyframes
    .map((keyframe) => ({
      ...keyframe,
      time: clampTime(keyframe.time, duration),
      interpolation: normalizeInterpolationOverride(keyframe.interpolation),
    }))
    .sort((left, right) => {
      if (left.time !== right.time) {
        return left.time - right.time;
      }
      return left.id.localeCompare(right.id);
    });

  const byTime = new Map<number, AnimationKeyframe>();
  sorted.forEach((keyframe) => {
    byTime.set(keyframe.time, keyframe);
  });
  return Array.from(byTime.values()).sort(
    (left, right) => left.time - right.time,
  );
}

interface NormalizedTracksResult {
  tracks: AnimationTrack[];
  nextTrackOrdinal: number;
  nextKeyframeOrdinal: number;
}

function normalizeTracksForState(
  tracks: ReadonlyArray<AnimationTrack>,
  duration: number,
): NormalizedTracksResult {
  let nextTrackOrdinal = 1;
  let nextKeyframeOrdinal = 1;
  const usedTrackIds = new Set<string>();
  const usedKeyframeIds = new Set<string>();

  const allocateTrackId = (preferred?: string): string => {
    const normalizedPreferred = preferred?.trim() ?? "";
    if (
      normalizedPreferred.length > 0 &&
      !usedTrackIds.has(normalizedPreferred)
    ) {
      usedTrackIds.add(normalizedPreferred);
      const preferredOrdinal = parseOrdinalFromId(
        normalizedPreferred,
        TRACK_ID_PREFIX,
      );
      if (preferredOrdinal !== null) {
        nextTrackOrdinal = Math.max(nextTrackOrdinal, preferredOrdinal + 1);
      }
      return normalizedPreferred;
    }
    while (usedTrackIds.has(formatTrackId(nextTrackOrdinal))) {
      nextTrackOrdinal += 1;
    }
    const generated = formatTrackId(nextTrackOrdinal);
    usedTrackIds.add(generated);
    nextTrackOrdinal += 1;
    return generated;
  };

  const allocateKeyframeId = (preferred?: string): string => {
    const normalizedPreferred = preferred?.trim() ?? "";
    if (
      normalizedPreferred.length > 0 &&
      !usedKeyframeIds.has(normalizedPreferred)
    ) {
      usedKeyframeIds.add(normalizedPreferred);
      const preferredOrdinal = parseOrdinalFromId(
        normalizedPreferred,
        KEYFRAME_ID_PREFIX,
      );
      if (preferredOrdinal !== null) {
        nextKeyframeOrdinal = Math.max(
          nextKeyframeOrdinal,
          preferredOrdinal + 1,
        );
      }
      return normalizedPreferred;
    }
    while (usedKeyframeIds.has(formatKeyframeId(nextKeyframeOrdinal))) {
      nextKeyframeOrdinal += 1;
    }
    const generated = formatKeyframeId(nextKeyframeOrdinal);
    usedKeyframeIds.add(generated);
    nextKeyframeOrdinal += 1;
    return generated;
  };

  const normalizedTracks = tracks.map((track) => {
    const trackId = allocateTrackId(track.id);
    const interpolation = track.interpolation ?? "linear";
    const keyframes = normalizeKeyframesForTrack(
      track.keyframes.map((keyframe) => ({
        ...keyframe,
        id: allocateKeyframeId(keyframe.id),
      })),
      duration,
    );
    return {
      ...track,
      id: trackId,
      channel: track.channel || track.variableId,
      interpolation,
      color: track.color || deterministicTrackColor(track.variableId),
      keyframes,
    };
  });

  return {
    tracks: normalizedTracks,
    nextTrackOrdinal,
    nextKeyframeOrdinal,
  };
}

interface AnimationState {
  tracks: AnimationTrack[];
  currentTime: number; // in seconds
  duration: number; // in seconds
  isPlaying: boolean;
  loop: boolean;
  playSpeed: number;
  transportActive: boolean;
  transportEnabled: boolean;
  transportPlaybackState: AnimationTransportPlaybackState;
  runtimeTransportAdapter: AnimationRuntimeTransportAdapter | null;
  runtimeClipId: string;
  transportSessionKey: number;
  transportRuntimeReady: boolean;
  timeDisplayMode: AnimationTimeDisplayMode;

  // Selection
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  selectedCurveItem: AnimationCurveSelection | null;
  nextTrackOrdinal: number;
  nextKeyframeOrdinal: number;

  // Actions
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setDuration: (duration: number) => void;
  setLoop: (loop: boolean) => void;
  setPlaySpeed: (playSpeed: number) => void;
  syncTransportState: (
    updates: Partial<
      Pick<
        AnimationState,
        | "currentTime"
        | "duration"
        | "isPlaying"
        | "loop"
        | "playSpeed"
        | "transportActive"
        | "transportPlaybackState"
      >
    >,
    sessionKey?: number,
  ) => void;
  advanceTransportSessionKey: () => void;
  setTransportRuntimeReady: (ready: boolean, sessionKey?: number) => void;
  setRuntimeTransportAdapter: (
    adapter: AnimationRuntimeTransportAdapter | null,
  ) => void;
  setRuntimeClipId: (clipId: string | null | undefined) => void;
  setTransportEnabled: (enabled: boolean) => void;
  setTimeDisplayMode: (mode: AnimationTimeDisplayMode) => void;

  addTrack: (variableId: string, label?: string, channel?: string) => void;
  setTrackInterpolation: (
    trackId: string,
    interpolation: AnimationTrack["interpolation"],
  ) => void;
  removeTrack: (trackId: string) => void;

  addKeyframe: (trackId: string, time: number, value: number) => void;
  upsertInputKeyframe: (
    entry: AnimationInputKeyframeEntry,
    time: number,
  ) => void;
  upsertInputKeyframes: (
    entries: AnimationInputKeyframeEntry[],
    time: number,
  ) => void;
  removeKeyframe: (trackId: string, keyframeId: string) => void;
  updateKeyframe: (
    trackId: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;
  updateSegmentHandle: (
    trackId: string,
    segmentIndex: number,
    side: "out" | "in",
    handle: AnimationHandle,
  ) => void;
  setSegmentInterpolation: (
    trackId: string,
    segmentIndex: number,
    interpolation: AnimationTrack["interpolation"],
    handles: { outHandle: AnimationHandle; inHandle: AnimationHandle },
  ) => void;
  setKeyframeHandleLock: (
    trackId: string,
    keyframeId: string,
    locked: boolean,
    sourceSide?: "out" | "in",
  ) => void;

  selectTrack: (trackId: string | null) => void;
  selectKeyframe: (keyframeId: string | null) => void;
  selectCurveItem: (selection: AnimationCurveSelection | null) => void;

  replaceTracks: (tracks: AnimationTrack[]) => void;
  importClipIr: (clip: AnimationClipIR) => void;
  exportClipIr: (options?: { id?: string; name?: string }) => AnimationClipIR;
  reset: () => void;

  // Runtime
  tick: (deltaTime: number) => void;
}

const INITIAL_STATE: Pick<
  AnimationState,
  | "tracks"
  | "currentTime"
  | "duration"
  | "isPlaying"
  | "loop"
  | "playSpeed"
  | "transportActive"
  | "transportEnabled"
  | "transportPlaybackState"
  | "runtimeTransportAdapter"
  | "runtimeClipId"
  | "transportSessionKey"
  | "transportRuntimeReady"
  | "timeDisplayMode"
  | "selectedTrackId"
  | "selectedKeyframeId"
  | "selectedCurveItem"
  | "nextTrackOrdinal"
  | "nextKeyframeOrdinal"
> = {
  tracks: [],
  currentTime: 0,
  duration: 10,
  isPlaying: false,
  loop: true,
  playSpeed: 1,
  transportActive: false,
  transportEnabled: true,
  transportPlaybackState: "stopped",
  runtimeTransportAdapter: null,
  runtimeClipId: AUTHORED_TIMELINE_CLIP_ID,
  transportSessionKey: 0,
  transportRuntimeReady: false,
  timeDisplayMode: "seconds",
  selectedTrackId: null,
  selectedKeyframeId: null,
  selectedCurveItem: null,
  nextTrackOrdinal: 1,
  nextKeyframeOrdinal: 1,
};

export const useAnimationStore = create<AnimationState>((set, get) => ({
  ...INITIAL_STATE,

  play: () =>
    set({
      isPlaying: true,
      transportActive: true,
      transportPlaybackState: "playing",
    }),
  pause: () =>
    set({
      isPlaying: false,
      transportActive: true,
      transportPlaybackState: "paused",
    }),
  stop: () =>
    set({
      isPlaying: false,
      currentTime: 0,
      transportActive: false,
      transportPlaybackState: "stopped",
    }),
  seek: (time) =>
    set((state) => ({
      currentTime: clampTime(time, get().duration),
      transportActive:
        state.isPlaying || state.transportPlaybackState === "paused",
      transportPlaybackState: state.isPlaying
        ? "playing"
        : state.transportPlaybackState === "paused"
          ? "paused"
          : "stopped",
    })),
  setDuration: (duration) =>
    set((state) => {
      const normalizedDuration = Number.isFinite(duration)
        ? Math.max(MIN_DURATION_SECONDS, duration)
        : MIN_DURATION_SECONDS;
      return {
        duration: normalizedDuration,
        currentTime: clampTime(state.currentTime, normalizedDuration),
        tracks: state.tracks.map((track) => ({
          ...track,
          keyframes: normalizeKeyframesForTrack(
            track.keyframes,
            normalizedDuration,
          ),
        })),
      };
    }),
  setLoop: (loop) => set({ loop }),
  setPlaySpeed: (playSpeed) =>
    set({
      playSpeed:
        Number.isFinite(playSpeed) && playSpeed > 0
          ? playSpeed
          : INITIAL_STATE.playSpeed,
    }),
  syncTransportState: (updates, sessionKey) =>
    set((state) => {
      if (
        typeof sessionKey === "number" &&
        sessionKey !== state.transportSessionKey
      ) {
        return state;
      }
      const nextDuration =
        typeof updates.duration === "number" &&
        Number.isFinite(updates.duration)
          ? Math.max(MIN_DURATION_SECONDS, updates.duration)
          : state.duration;
      const nextCurrentTime =
        typeof updates.currentTime === "number" &&
        Number.isFinite(updates.currentTime)
          ? clampTime(updates.currentTime, nextDuration)
          : clampTime(state.currentTime, nextDuration);
      const nextPlaySpeed =
        typeof updates.playSpeed === "number" &&
        Number.isFinite(updates.playSpeed) &&
        updates.playSpeed > 0
          ? updates.playSpeed
          : state.playSpeed;
      const nextLoop =
        typeof updates.loop === "boolean" ? updates.loop : state.loop;
      const nextIsPlaying =
        typeof updates.isPlaying === "boolean"
          ? updates.isPlaying
          : state.isPlaying;
      const nextTransportActive =
        typeof updates.transportActive === "boolean"
          ? updates.transportActive
          : state.transportActive;
      const nextTransportPlaybackState =
        updates.transportPlaybackState ?? state.transportPlaybackState;
      if (
        nextDuration === state.duration &&
        nextCurrentTime === state.currentTime &&
        nextPlaySpeed === state.playSpeed &&
        nextLoop === state.loop &&
        nextIsPlaying === state.isPlaying &&
        nextTransportActive === state.transportActive &&
        nextTransportPlaybackState === state.transportPlaybackState
      ) {
        return state;
      }
      return {
        ...state,
        duration: nextDuration,
        currentTime: nextCurrentTime,
        playSpeed: nextPlaySpeed,
        loop: nextLoop,
        isPlaying: nextIsPlaying,
        transportActive: nextTransportActive,
        transportPlaybackState: nextTransportPlaybackState,
      };
    }),
  advanceTransportSessionKey: () =>
    set((state) => ({
      transportSessionKey: state.transportSessionKey + 1,
      transportRuntimeReady: false,
    })),
  setTransportRuntimeReady: (transportRuntimeReady, sessionKey) =>
    set((state) => {
      if (
        typeof sessionKey === "number" &&
        sessionKey !== state.transportSessionKey
      ) {
        return state;
      }
      return state.transportRuntimeReady === transportRuntimeReady
        ? state
        : { transportRuntimeReady };
    }),
  setRuntimeTransportAdapter: (runtimeTransportAdapter) =>
    set((state) =>
      state.runtimeTransportAdapter === runtimeTransportAdapter
        ? state
        : { runtimeTransportAdapter },
    ),
  setRuntimeClipId: (runtimeClipId) =>
    set((state) => {
      const nextRuntimeClipId =
        typeof runtimeClipId === "string" && runtimeClipId.trim().length > 0
          ? runtimeClipId.trim()
          : AUTHORED_TIMELINE_CLIP_ID;
      return state.runtimeClipId === nextRuntimeClipId
        ? state
        : { runtimeClipId: nextRuntimeClipId };
    }),
  setTransportEnabled: (transportEnabled) =>
    set((state) =>
      state.transportEnabled === transportEnabled
        ? state
        : { transportEnabled },
    ),
  setTimeDisplayMode: (timeDisplayMode) =>
    set((state) =>
      state.timeDisplayMode === timeDisplayMode ? state : { timeDisplayMode },
    ),

  addTrack: (variableId, label, channel) =>
    set((state) => {
      // Prevent duplicates
      if (state.tracks.some((t) => t.variableId === variableId)) {
        return state;
      }

      const newTrack: AnimationTrack = {
        id: formatTrackId(state.nextTrackOrdinal),
        variableId,
        channel: channel?.trim() || variableId,
        label: label || variableId,
        color: deterministicTrackColor(variableId),
        interpolation: "linear",
        keyframes: [],
      };
      return {
        tracks: [...state.tracks, newTrack],
        nextTrackOrdinal: state.nextTrackOrdinal + 1,
      };
    }),
  setTrackInterpolation: (trackId, interpolation) =>
    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) {
          return track;
        }
        return {
          ...track,
          interpolation,
          keyframes: normalizeKeyframesForTrack(
            track.keyframes,
            state.duration,
          ),
        };
      }),
    })),

  removeTrack: (trackId) =>
    set((state) => ({
      tracks: state.tracks.filter((t) => t.id !== trackId),
      selectedTrackId:
        state.selectedTrackId === trackId ? null : state.selectedTrackId,
      selectedKeyframeId:
        state.selectedTrackId === trackId ? null : state.selectedKeyframeId,
      selectedCurveItem:
        state.selectedTrackId === trackId ? null : state.selectedCurveItem,
    })),

  addKeyframe: (trackId, time, value) =>
    set((state) => {
      const track = state.tracks.find((t) => t.id === trackId);
      if (!track) {
        return state;
      }

      const clampedTime = clampTime(time, state.duration);
      const newKeyframe: AnimationKeyframe = {
        id: formatKeyframeId(state.nextKeyframeOrdinal),
        time: clampedTime,
        value,
        interpolation: undefined,
      };

      const updatedTracks = state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          keyframes: normalizeKeyframesForTrack(
            [
              ...t.keyframes.filter(
                (keyframe) => !isSameTime(keyframe.time, clampedTime),
              ),
              newKeyframe,
            ],
            state.duration,
          ),
        };
      });

      return {
        tracks: updatedTracks,
        selectedTrackId: trackId,
        selectedKeyframeId: newKeyframe.id,
        selectedCurveItem: {
          kind: "keyframe",
          keyframeId: newKeyframe.id,
        },
        nextKeyframeOrdinal: state.nextKeyframeOrdinal + 1,
      };
    }),

  upsertInputKeyframe: (entry, time) => {
    get().upsertInputKeyframes([entry], time);
  },

  upsertInputKeyframes: (entries, time) =>
    set((state) => {
      if (!Array.isArray(entries) || entries.length === 0) {
        return state;
      }
      const clampedTime = clampTime(time, state.duration);
      const dedupedEntries = new Map<string, AnimationInputKeyframeEntry>();
      entries.forEach((entry) => {
        const inputId = entry.inputId.trim();
        if (!inputId || !Number.isFinite(entry.value)) {
          return;
        }
        dedupedEntries.set(inputId, {
          ...entry,
          inputId,
        });
      });
      if (dedupedEntries.size === 0) {
        return state;
      }

      let nextTrackOrdinal = state.nextTrackOrdinal;
      let nextKeyframeOrdinal = state.nextKeyframeOrdinal;
      let selectedTrackId = state.selectedTrackId;
      let selectedKeyframeId = state.selectedKeyframeId;
      let selectedCurveItem = state.selectedCurveItem;
      const nextTracks = state.tracks.map((track) => ({
        ...track,
        keyframes: [...track.keyframes],
      }));

      dedupedEntries.forEach((entry) => {
        const existingTrackIndex = nextTracks.findIndex(
          (track) => track.variableId === entry.inputId,
        );
        const trackIndex =
          existingTrackIndex >= 0
            ? existingTrackIndex
            : (() => {
                const newTrack: AnimationTrack = {
                  id: formatTrackId(nextTrackOrdinal),
                  variableId: entry.inputId,
                  channel: entry.channel?.trim() || entry.inputId,
                  label: entry.label || entry.inputId,
                  color: deterministicTrackColor(entry.inputId),
                  interpolation: "linear",
                  keyframes: [],
                };
                nextTrackOrdinal += 1;
                nextTracks.push(newTrack);
                return nextTracks.length - 1;
              })();
        const track = nextTracks[trackIndex]!;
        const existingKeyframe = findNearestKeyframeWithinFrameTolerance(
          track.keyframes,
          clampedTime,
        );
        if (existingKeyframe) {
          track.keyframes = normalizeKeyframesForTrack(
            track.keyframes.map((keyframe) =>
              keyframe.id === existingKeyframe.id
                ? { ...keyframe, value: entry.value }
                : keyframe,
            ),
            state.duration,
          );
          selectedTrackId = track.id;
          selectedKeyframeId = existingKeyframe.id;
          selectedCurveItem = {
            kind: "keyframe",
            keyframeId: existingKeyframe.id,
          };
          return;
        }
        const newKeyframe: AnimationKeyframe = {
          id: formatKeyframeId(nextKeyframeOrdinal),
          time: clampedTime,
          value: entry.value,
          interpolation: undefined,
        };
        nextKeyframeOrdinal += 1;
        track.keyframes = normalizeKeyframesForTrack(
          [...track.keyframes, newKeyframe],
          state.duration,
        );
        selectedTrackId = track.id;
        selectedKeyframeId = newKeyframe.id;
        selectedCurveItem = {
          kind: "keyframe",
          keyframeId: newKeyframe.id,
        };
      });

      return {
        ...state,
        tracks: nextTracks,
        nextTrackOrdinal,
        nextKeyframeOrdinal,
        selectedTrackId,
        selectedKeyframeId,
        selectedCurveItem,
      };
    }),

  removeKeyframe: (trackId, keyframeId) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          keyframes: t.keyframes.filter((k) => k.id !== keyframeId),
        };
      }),
      selectedKeyframeId:
        state.selectedKeyframeId === keyframeId
          ? null
          : state.selectedKeyframeId,
      selectedCurveItem:
        state.selectedCurveItem?.kind === "keyframe" &&
        state.selectedCurveItem.keyframeId === keyframeId
          ? null
          : state.selectedCurveItem,
    })),

  updateKeyframe: (trackId, keyframeId, updates) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        return {
          ...t,
          keyframes: normalizeKeyframesForTrack(
            t.keyframes.map((k) => {
              if (k.id !== keyframeId) {
                return k;
              }
              const nextTime =
                typeof updates.time === "number"
                  ? clampTime(updates.time, state.duration)
                  : k.time;
              const interpolationOverride =
                Object.prototype.hasOwnProperty.call(updates, "interpolation")
                  ? updates.interpolation
                  : k.interpolation;
              return {
                ...k,
                ...updates,
                time: nextTime,
                interpolation: interpolationOverride,
              };
            }),
            state.duration,
          ),
        };
      }),
    })),
  updateSegmentHandle: (trackId, segmentIndex, side, handle) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? updateTrackSegmentHandle(track, segmentIndex, side, handle)
          : track,
      ),
    })),
  setSegmentInterpolation: (trackId, segmentIndex, interpolation, handles) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? updateTrackSegmentInterpolation(
              track,
              segmentIndex,
              interpolation,
              handles,
            )
          : track,
      ),
    })),
  setKeyframeHandleLock: (trackId, keyframeId, locked, sourceSide) =>
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId
          ? updateTrackKeyframeHandleLock(track, keyframeId, locked, sourceSide)
          : track,
      ),
    })),

  selectTrack: (selectedTrackId) => set({ selectedTrackId }),
  selectKeyframe: (selectedKeyframeId) =>
    set({
      selectedKeyframeId,
      selectedCurveItem: selectedKeyframeId
        ? { kind: "keyframe", keyframeId: selectedKeyframeId }
        : null,
    }),
  selectCurveItem: (selectedCurveItem) =>
    set({
      selectedCurveItem,
      selectedKeyframeId:
        selectedCurveItem?.kind === "keyframe"
          ? selectedCurveItem.keyframeId
          : null,
    }),

  replaceTracks: (tracks) =>
    set((state) => {
      const compiled = compileAnimationClipIr({
        clip: {
          schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
          id: "in-memory",
          duration: state.duration,
          tracks,
        },
      });
      const normalized = normalizeTracksForState(
        compiled.tracks,
        state.duration,
      );
      return {
        ...state,
        tracks: normalized.tracks,
        selectedTrackId: null,
        selectedKeyframeId: null,
        selectedCurveItem: null,
        nextTrackOrdinal: normalized.nextTrackOrdinal,
        nextKeyframeOrdinal: normalized.nextKeyframeOrdinal,
      };
    }),

  importClipIr: (clip) =>
    set((state) => {
      const compiled = compileAnimationClipIr({ clip });
      const normalized = normalizeTracksForState(
        compiled.tracks,
        compiled.duration,
      );
      return {
        ...state,
        tracks: normalized.tracks,
        duration: compiled.duration,
        currentTime: clampTime(state.currentTime, compiled.duration),
        isPlaying: false,
        runtimeClipId: AUTHORED_TIMELINE_CLIP_ID,
        selectedTrackId: null,
        selectedKeyframeId: null,
        selectedCurveItem: null,
        nextTrackOrdinal: normalized.nextTrackOrdinal,
        nextKeyframeOrdinal: normalized.nextKeyframeOrdinal,
      };
    }),

  exportClipIr: (options) => {
    const state = get();
    return compileAnimationClipIr({
      clip: {
        schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
        id: options?.id?.trim() || AUTHORED_TIMELINE_CLIP_ID,
        name: options?.name?.trim() || AUTHORED_TIMELINE_CLIP_NAME,
        duration: state.duration,
        tracks: state.tracks,
      },
    });
  },

  reset: () =>
    set((state) => ({
      ...INITIAL_STATE,
      runtimeTransportAdapter: state.runtimeTransportAdapter,
      runtimeClipId: state.runtimeClipId,
      transportSessionKey: state.transportSessionKey,
    })),

  tick: (deltaTime) => {
    const state = get();
    if (!state.isPlaying) return;

    let nextTime = state.currentTime + deltaTime * state.playSpeed;
    if (nextTime > state.duration) {
      if (state.loop && state.duration > 0) {
        nextTime = nextTime % state.duration;
      } else {
        nextTime = state.duration;
        set({
          isPlaying: false,
          transportPlaybackState: "paused",
        });
      }
    }
    set({ currentTime: nextTime });
  },
}));

// Helper to evaluate a track at a specific time
export function evaluateTrack(track: AnimationTrack, time: number): number {
  return evaluateAnimationTrackAtTime(track, time);
}
