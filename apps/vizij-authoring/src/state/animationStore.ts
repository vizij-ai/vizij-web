import { create } from "zustand";
import type {
  AnimationClipIR,
  AnimationKeyframeIR,
  AnimationTrackIR,
} from "../types/animationClipIr";
import {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
} from "../types/animationClipIr";
import {
  compileAnimationClipIr,
  evaluateAnimationTrackAtTime,
} from "../utils/animationClipCompiler";

export type AnimationKeyframe = AnimationKeyframeIR;
export type AnimationTrack = AnimationTrackIR;
export type AnimationTransportPlaybackState = "playing" | "paused" | "stopped";
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
  stopAnimation: (id: string) => void;
  seekAnimation: (id: string, timeSeconds: number) => void;
  setAnimationLoop: (id: string, enabled: boolean) => void;
  getAnimationState: (id: string) => AnimationRuntimePlaybackState | null;
};

const MIN_DURATION_SECONDS = 0;
const TIME_EPSILON = 1e-6;
const TRACK_ID_PREFIX = "track-";
const KEYFRAME_ID_PREFIX = "kf-";

function quantizeTime(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
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
  interpolation: AnimationTrack["interpolation"],
): AnimationKeyframe[] {
  const sorted = keyframes
    .map((keyframe) => ({
      ...keyframe,
      time: clampTime(keyframe.time, duration),
      interpolation: keyframe.interpolation ?? interpolation,
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
      interpolation,
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
  transportPlaybackState: AnimationTransportPlaybackState;
  runtimeTransportAdapter: AnimationRuntimeTransportAdapter | null;

  // Selection
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
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
  ) => void;
  setRuntimeTransportAdapter: (
    adapter: AnimationRuntimeTransportAdapter | null,
  ) => void;

  addTrack: (variableId: string, label?: string, channel?: string) => void;
  setTrackInterpolation: (
    trackId: string,
    interpolation: AnimationTrack["interpolation"],
  ) => void;
  removeTrack: (trackId: string) => void;

  addKeyframe: (trackId: string, time: number, value: number) => void;
  removeKeyframe: (trackId: string, keyframeId: string) => void;
  updateKeyframe: (
    trackId: string,
    keyframeId: string,
    updates: Partial<AnimationKeyframe>,
  ) => void;

  selectTrack: (trackId: string | null) => void;
  selectKeyframe: (keyframeId: string | null) => void;

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
  | "transportPlaybackState"
  | "runtimeTransportAdapter"
  | "selectedTrackId"
  | "selectedKeyframeId"
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
  transportPlaybackState: "stopped",
  runtimeTransportAdapter: null,
  selectedTrackId: null,
  selectedKeyframeId: null,
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
      transportActive: false,
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
      transportActive: state.isPlaying,
      transportPlaybackState: state.isPlaying ? "playing" : "stopped",
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
            track.interpolation,
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
  syncTransportState: (updates) =>
    set((state) => {
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
  setRuntimeTransportAdapter: (runtimeTransportAdapter) =>
    set((state) =>
      state.runtimeTransportAdapter === runtimeTransportAdapter
        ? state
        : { runtimeTransportAdapter },
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
            track.keyframes.map((keyframe) => ({
              ...keyframe,
              interpolation,
            })),
            state.duration,
            interpolation,
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
        interpolation: track.interpolation,
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
            t.interpolation,
          ),
        };
      });

      return {
        tracks: updatedTracks,
        selectedTrackId: trackId,
        selectedKeyframeId: newKeyframe.id,
        nextKeyframeOrdinal: state.nextKeyframeOrdinal + 1,
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
    })),

  updateKeyframe: (trackId, keyframeId, updates) =>
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const interpolation = t.interpolation;
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
              return {
                ...k,
                ...updates,
                time: nextTime,
                interpolation:
                  updates.interpolation ?? k.interpolation ?? interpolation,
              };
            }),
            state.duration,
            interpolation,
          ),
        };
      }),
    })),

  selectTrack: (selectedTrackId) => set({ selectedTrackId }),
  selectKeyframe: (selectedKeyframeId) => set({ selectedKeyframeId }),

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
        selectedTrackId: null,
        selectedKeyframeId: null,
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
