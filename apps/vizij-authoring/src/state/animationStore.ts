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
import { ANIMATION_TIMELINE_FPS } from "../utils/animationTimeDisplay";
import {
  addClipEntry,
  commitClipEntry,
  EMPTY_CLIP_SET,
  orderedClipEntries,
  removeClipEntry,
  updateClipEntry,
  renameClipEntry,
  replaceClipEntries,
  selectedClipEntry,
  type AnimationClipEntry,
  type AnimationClipEntryInput,
  type ClipSetState,
} from "./animationClipsStore";

export type AnimationKeyframe = AnimationKeyframeIR;
export type AnimationTrack = AnimationTrackIR;
export type AnimationTransportPlaybackState = "playing" | "paused" | "stopped";
export type AnimationTimeDisplayMode = "seconds" | "frames";
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
const TRACK_ID_PREFIX = "track-";
const KEYFRAME_ID_PREFIX = "kf-";

function quantizeTime(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * The editing buffer as a clip, stamped with `clipId`.
 *
 * Taken eagerly wherever it is needed — never inside a setState updater. An
 * updater runs during a later render (twice under StrictMode), by which time a
 * switch may have replaced the buffer, and the snapshot would then carry the
 * wrong clip's tracks under this id. That was a real defect, not a hypothetical
 * one.
 */
function materialiseBuffer(
  state: Pick<AnimationState, "tracks" | "duration">,
  clipId: string,
  name: string,
): AnimationClipIR {
  return compileAnimationClipIr({
    clip: {
      schemaVersion: ANIMATION_CLIP_IR_SCHEMA_VERSION,
      id: clipId,
      name,
      duration: state.duration,
      tracks: state.tracks,
    },
  });
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
    if (value === "linear" || value === "step" || value === "cubic") {
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
  transportSessionKey: number;
  transportRuntimeReady: boolean;
  timeDisplayMode: AnimationTimeDisplayMode;

  /**
   * Every clip, and which one is being edited.
   *
   * `tracks`/`duration` above are the editing buffer for `selectedClipId`.
   * They are a projection of `clipEntries[selectedClipId]`, not a second copy
   * kept in step by an effect: `selectClip` materialises the buffer into the
   * outgoing entry and loads the incoming one in the *same* `set()`, so no
   * render can observe the two referring to different clips. That window is
   * where every clip-corruption bug in this codebase lived.
   */
  clipEntries: ClipSetState["clipEntries"];
  clipOrder: ClipSetState["clipOrder"];
  selectedClipId: string | null;

  selectClip: (clipId: string | null) => void;
  addClip: (entry: AnimationClipEntryInput) => void;
  removeClip: (clipId: string) => void;
  renameClip: (clipId: string, name: string) => void;
  /** Replace one clip's data in place, keeping its identity and order. */
  updateClip: (
    clipId: string,
    update: (entry: AnimationClipEntry) => AnimationClipEntry,
  ) => void;
  replaceClips: (
    entries: ReadonlyArray<AnimationClipEntryInput>,
    selectedClipId?: string | null,
  ) => void;
  /**
   * Every clip, with the selected one materialised from the editing buffer.
   * The single read path for export — so what ships is what is on screen.
   */
  getAllClips: () => AnimationClipEntry[];

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
    sessionKey?: number,
  ) => void;
  advanceTransportSessionKey: () => void;
  setTransportRuntimeReady: (ready: boolean, sessionKey?: number) => void;
  setRuntimeTransportAdapter: (
    adapter: AnimationRuntimeTransportAdapter | null,
  ) => void;
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

  selectTrack: (trackId: string | null) => void;
  selectKeyframe: (keyframeId: string | null) => void;

  replaceTracks: (tracks: AnimationTrack[]) => void;
  importClipIr: (clip: AnimationClipIR) => void;
  exportClipIr: (options?: { id?: string; name?: string }) => AnimationClipIR;
  /**
   * True while the author is dragging the playhead.
   *
   * The runtime feedback loop overwrites `currentTime` every frame from what
   * the engine reports, which means a scrub is undone the frame after it is
   * written — the playhead snapped back and the readout never moved. During a
   * drag the host is authoritative, so the feedback defers.
   */
  isScrubbing: boolean;
  setScrubbing: (scrubbing: boolean) => void;
  reset: () => void;
  /** Teardown: clears the clip set as well as the buffer. */
  resetAll: () => void;
}

/**
 * Apply a clip-set reducer, returning the *same* state when nothing changed.
 *
 * `set` with a spread always produces a new state object, so a no-op reducer
 * still notifies every subscriber. That is not merely wasteful: a component
 * whose render feeds an effect that calls the action again — seeding imported
 * clips does exactly this — loops forever. It hung the face load at "Reset
 * Session State" with no error, and is the same shape as the scrub-latch loop.
 */
function applyClipSet(
  state: AnimationState,
  next: ClipSetState,
): AnimationState {
  if (
    next.clipEntries === state.clipEntries &&
    next.clipOrder === state.clipOrder &&
    next.selectedClipId === state.selectedClipId
  ) {
    return state;
  }
  return { ...state, ...next };
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
  | "transportSessionKey"
  | "transportRuntimeReady"
  | "timeDisplayMode"
  | "isScrubbing"
  | "clipEntries"
  | "clipOrder"
  | "selectedClipId"
  | "selectedTrackId"
  | "selectedKeyframeId"
  | "nextTrackOrdinal"
  | "nextKeyframeOrdinal"
> = {
  tracks: [],
  clipEntries: EMPTY_CLIP_SET.clipEntries,
  clipOrder: EMPTY_CLIP_SET.clipOrder,
  selectedClipId: EMPTY_CLIP_SET.selectedClipId,
  currentTime: 0,
  duration: 10,
  isPlaying: false,
  loop: true,
  playSpeed: 1,
  transportActive: false,
  transportEnabled: true,
  transportPlaybackState: "stopped",
  runtimeTransportAdapter: null,
  transportSessionKey: 0,
  transportRuntimeReady: false,
  timeDisplayMode: "seconds",
  isScrubbing: false,
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
      const requestedDuration = Number.isFinite(duration)
        ? Math.max(MIN_DURATION_SECONDS, duration)
        : MIN_DURATION_SECONDS;
      // Shortening below the last keyframe used to clamp every later key to
      // the new end, where the exact-time de-dupe then collapsed them into
      // one. The duration is floored at the content instead: delete the
      // keyframes first if you really want a shorter clip.
      const lastKeyframeTime = state.tracks.reduce((latest, track) => {
        const last = track.keyframes[track.keyframes.length - 1];
        return last && last.time > latest ? last.time : latest;
      }, 0);
      const normalizedDuration = Math.max(requestedDuration, lastKeyframeTime);
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
      });

      return {
        ...state,
        tracks: nextTracks,
        nextTrackOrdinal,
        nextKeyframeOrdinal,
        selectedTrackId,
        selectedKeyframeId,
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
        return {
          ...t,
          keyframes: normalizeKeyframesForTrack(
            t.keyframes.map((k) => {
              if (k.id !== keyframeId) {
                return k;
              }
              // A requested time that another keyframe already occupies is
              // refused, not merged. `normalizeKeyframesForTrack` de-dupes by
              // exact time with last-write-wins, so applying it would destroy
              // one of the two keyframes — and there is no undo to recover it.
              const requestedTime =
                typeof updates.time === "number"
                  ? clampTime(updates.time, state.duration)
                  : k.time;
              const collides = t.keyframes.some(
                (other) =>
                  other.id !== k.id && isSameTime(other.time, requestedTime),
              );
              const nextTime = collides ? k.time : requestedTime;
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

  selectClip: (clipId) =>
    set((state) => {
      if (clipId !== null && !state.clipEntries[clipId]) {
        // Falling back to some other clip is what made selection and data
        // disagree; refuse instead, so a bad id is a visible no-op.
        return state;
      }
      if (clipId === state.selectedClipId) {
        return state;
      }

      // One transaction: materialise the outgoing clip, then load the
      // incoming one. Nothing can observe a half-applied switch.
      let clipSet: ClipSetState = {
        clipEntries: state.clipEntries,
        clipOrder: state.clipOrder,
        selectedClipId: state.selectedClipId,
      };
      const outgoing = selectedClipEntry(clipSet);
      if (outgoing) {
        clipSet = commitClipEntry(
          clipSet,
          outgoing.clipId,
          materialiseBuffer(state, outgoing.clipId, outgoing.name),
        );
      }

      const incoming = clipId ? clipSet.clipEntries[clipId] : null;
      if (!incoming) {
        return {
          ...state,
          ...clipSet,
          selectedClipId: null,
          tracks: [],
          duration: INITIAL_STATE.duration,
          currentTime: 0,
          selectedTrackId: null,
          selectedKeyframeId: null,
        };
      }

      const compiled = compileAnimationClipIr({ clip: incoming.clip });
      const normalized = normalizeTracksForState(
        compiled.tracks,
        compiled.duration,
      );
      return {
        ...state,
        ...clipSet,
        selectedClipId: clipId,
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

  addClip: (entry) =>
    set((state) =>
      applyClipSet(
        state,
        addClipEntry(
          {
            clipEntries: state.clipEntries,
            clipOrder: state.clipOrder,
            selectedClipId: state.selectedClipId,
          },
          entry,
        ),
      ),
    ),

  removeClip: (clipId) =>
    set((state) => {
      const next = removeClipEntry(
        {
          clipEntries: state.clipEntries,
          clipOrder: state.clipOrder,
          selectedClipId: state.selectedClipId,
        },
        clipId,
      );
      if (next.selectedClipId === state.selectedClipId) {
        return applyClipSet(state, next);
      }
      // The selection moved because the selected clip was removed; load
      // whatever replaced it in the same transaction.
      const incoming = next.selectedClipId
        ? next.clipEntries[next.selectedClipId]
        : null;
      if (!incoming) {
        return {
          ...state,
          ...next,
          tracks: [],
          duration: INITIAL_STATE.duration,
          currentTime: 0,
        };
      }
      const compiled = compileAnimationClipIr({ clip: incoming.clip });
      const normalized = normalizeTracksForState(
        compiled.tracks,
        compiled.duration,
      );
      return {
        ...state,
        ...next,
        tracks: normalized.tracks,
        duration: compiled.duration,
        currentTime: clampTime(state.currentTime, compiled.duration),
        nextTrackOrdinal: normalized.nextTrackOrdinal,
        nextKeyframeOrdinal: normalized.nextKeyframeOrdinal,
      };
    }),

  renameClip: (clipId, name) =>
    set((state) =>
      applyClipSet(
        state,
        renameClipEntry(
          {
            clipEntries: state.clipEntries,
            clipOrder: state.clipOrder,
            selectedClipId: state.selectedClipId,
          },
          clipId,
          name,
        ),
      ),
    ),

  updateClip: (clipId, update) =>
    set((state) =>
      applyClipSet(
        state,
        updateClipEntry(
          {
            clipEntries: state.clipEntries,
            clipOrder: state.clipOrder,
            selectedClipId: state.selectedClipId,
          },
          clipId,
          update,
        ),
      ),
    ),

  replaceClips: (entries, selectedClipId) =>
    set((state) => {
      const next = replaceClipEntries(
        {
          clipEntries: state.clipEntries,
          clipOrder: state.clipOrder,
          selectedClipId: state.selectedClipId,
        },
        entries,
        selectedClipId,
      );
      const incoming = next.selectedClipId
        ? next.clipEntries[next.selectedClipId]
        : null;
      if (!incoming) {
        return {
          ...state,
          ...next,
          tracks: [],
          duration: INITIAL_STATE.duration,
          currentTime: 0,
        };
      }
      const compiled = compileAnimationClipIr({ clip: incoming.clip });
      const normalized = normalizeTracksForState(
        compiled.tracks,
        compiled.duration,
      );
      return {
        ...state,
        ...next,
        tracks: normalized.tracks,
        duration: compiled.duration,
        currentTime: clampTime(state.currentTime, compiled.duration),
        nextTrackOrdinal: normalized.nextTrackOrdinal,
        nextKeyframeOrdinal: normalized.nextKeyframeOrdinal,
      };
    }),

  getAllClips: () => {
    const state = get();
    return orderedClipEntries({
      clipEntries: state.clipEntries,
      clipOrder: state.clipOrder,
      selectedClipId: state.selectedClipId,
    }).map((entry) =>
      entry.clipId === state.selectedClipId
        ? {
            ...entry,
            clip: materialiseBuffer(state, entry.clipId, entry.name),
          }
        : entry,
    );
  },

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

  /**
   * Clear the editing buffer and transport, keeping the clip set.
   *
   * Most callers mean "nothing is loaded right now": switching targets,
   * failing to resolve one, deleting one. Wiping every clip there would
   * destroy the user's work — and once clips live in this store rather than in
   * App state, `...INITIAL_STATE` would do exactly that, since it carries an
   * empty clip set. Full teardown is `resetAll`.
   */
  setScrubbing: (scrubbing) =>
    set((state) =>
      // Idempotent on purpose. `set` always produces a new state object, so an
      // unconditional write notifies every subscriber — and `AnimationPanel`
      // subscribes to the whole store, so a redundant write re-renders it,
      // which re-creates the handlers whose identity a cleanup depends on,
      // which writes again. That loop froze the app during playback.
      state.isScrubbing === scrubbing
        ? state
        : { ...state, isScrubbing: scrubbing },
    ),

  reset: () =>
    set((state) => {
      return {
        ...INITIAL_STATE,
        clipEntries: state.clipEntries,
        clipOrder: state.clipOrder,
        selectedClipId: state.selectedClipId,
        runtimeTransportAdapter: state.runtimeTransportAdapter,
        transportSessionKey: state.transportSessionKey,
      };
    }),

  /** Teardown: drop the clip set too. For unloading a face. */
  resetAll: () =>
    set((state) => {
      return {
        ...INITIAL_STATE,
        runtimeTransportAdapter: state.runtimeTransportAdapter,
        transportSessionKey: state.transportSessionKey,
      };
    }),
}));

// Helper to evaluate a track at a specific time
export function evaluateTrack(track: AnimationTrack, time: number): number {
  return evaluateAnimationTrackAtTime(track, time);
}
