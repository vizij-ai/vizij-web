/**
 * Local helper: run stored animation clips through a `@vizij/runtime` runtime
 * with the `@vizij/animation-module` guest, in place of the standalone
 * `@vizij/animation-wasm` engine + `@vizij/animation-react` provider.
 *
 * The runtime (`@vizij/runtime`'s `startDevice`/`AroraDevice` — "device" is the
 * package's own term for a running Arora instance) executes a small behavior
 * graph: an `ExternalFunction` node calls the module's `step(dt_ns)` every tick
 * (fed the golden `arora/dt`), a path-less `output` node applies the returned
 * `[TrackOutput]` batch onto the store keys each record names (its authored
 * `default_key`, decided at clip load), and a second `ExternalFunction` /
 * `output` pair writes `player_states()` to `ANIMATION_PLAYERS_PATH`. Clips
 * load into a single player as data through the module's call surface, and a
 * `requestAnimationFrame` loop advances the runtime and drains the store.
 *
 * Call arguments/returns use the Arora `Value` JSON encoding (`{ str }`,
 * `{ f32 }`, `{ u32 }`, `{ struct }`, `{ structs }`, …); sampled outputs land in
 * the store as Vizij `ValueJSON`, read back with `@vizij/value-json` helpers.
 *
 * This is a demo-local copy — the same glue exists (unexported) inside
 * `@vizij/runtime-react`; the demos keep a small copy rather than depend on the
 * full renderer runtime. The reusable home for it is upstream in
 * `@vizij/runtime` / `@vizij/animation-module`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { init, startDevice, type AroraDevice } from "@vizij/runtime";
import { loadAnimationModule } from "@vizij/animation-module";
import type { ValueJSON } from "@vizij/value-json";

// --- declared function + parameter ids (module.yaml) -------------------------
export const ANIMATION_MODULE_FN = {
  loadAnimation: "76697a69-6a00-0000-0f00-000000000001",
  createPlayer: "76697a69-6a00-0000-0f00-000000000002",
  addInstance: "76697a69-6a00-0000-0f00-000000000003",
  step: "76697a69-6a00-0000-0f00-000000000004",
  play: "76697a69-6a00-0000-0f00-000000000005",
  pause: "76697a69-6a00-0000-0f00-000000000006",
  stop: "76697a69-6a00-0000-0f00-000000000007",
  seek: "76697a69-6a00-0000-0f00-000000000008",
  setSpeed: "76697a69-6a00-0000-0f00-000000000009",
  setLoop: "76697a69-6a00-0000-0f00-00000000000a",
  setWeight: "76697a69-6a00-0000-0f00-00000000000b",
  removeInstance: "76697a69-6a00-0000-0f00-00000000000c",
  playerStates: "76697a69-6a00-0000-0f00-00000000000d",
} as const;

export const ANIMATION_MODULE_PARAM = {
  clip: "76697a69-6a00-0000-0f01-000000000001",
  playerName: "76697a69-6a00-0000-0f02-000000000001",
  player: "76697a69-6a00-0000-0f03-000000000001",
  anim: "76697a69-6a00-0000-0f03-000000000002",
  dtNs: "76697a69-6a00-0000-0f04-000000000001",
  playPlayer: "76697a69-6a00-0000-0f05-000000000001",
  pausePlayer: "76697a69-6a00-0000-0f06-000000000001",
  stopPlayer: "76697a69-6a00-0000-0f07-000000000001",
  seekPlayer: "76697a69-6a00-0000-0f08-000000000001",
  seekTimeNs: "76697a69-6a00-0000-0f08-000000000002",
  speedPlayer: "76697a69-6a00-0000-0f09-000000000001",
  speedValue: "76697a69-6a00-0000-0f09-000000000002",
  loopPlayer: "76697a69-6a00-0000-0f0a-000000000001",
  loopMode: "76697a69-6a00-0000-0f0a-000000000002",
} as const;

// --- declared structure ids (records/structure/*.yaml) -----------------------
export const ANIMATION_MODULE_TYPE = {
  clip: "76697a69-6a00-0000-0000-000000000100",
  track: "76697a69-6a00-0000-0000-000000000101",
  keypoint: "76697a69-6a00-0000-0000-000000000102",
  transitionHandle: "76697a69-6a00-0000-0000-000000000103",
} as const;

export const ANIMATION_MODULE_FIELD = {
  clipName: "76697a69-6a00-0000-0100-000000000001",
  clipDuration: "76697a69-6a00-0000-0100-000000000002",
  clipTracks: "76697a69-6a00-0000-0100-000000000003",
  trackId: "76697a69-6a00-0000-0101-000000000001",
  trackName: "76697a69-6a00-0000-0101-000000000002",
  trackAnimatable: "76697a69-6a00-0000-0101-000000000003",
  trackPoints: "76697a69-6a00-0000-0101-000000000004",
  keypointId: "76697a69-6a00-0000-0102-000000000001",
  keypointStamp: "76697a69-6a00-0000-0102-000000000002",
  keypointValue: "76697a69-6a00-0000-0102-000000000003",
  keypointTransitionsIn: "76697a69-6a00-0000-0102-000000000004",
  keypointTransitionsOut: "76697a69-6a00-0000-0102-000000000005",
  handleX: "76697a69-6a00-0000-0103-000000000001",
  handleY: "76697a69-6a00-0000-0103-000000000002",
  outputDefaultKey: "76697a69-6a00-0000-0110-000000000002",
  outputValue: "76697a69-6a00-0000-0110-000000000003",
  statePlayer: "76697a69-6a00-0000-0111-000000000001",
  stateState: "76697a69-6a00-0000-0111-000000000002",
  stateTimeNs: "76697a69-6a00-0000-0111-000000000003",
  stateDurationNs: "76697a69-6a00-0000-0111-000000000004",
  stateSpeed: "76697a69-6a00-0000-0111-000000000005",
} as const;

// --- the Arora `Value` JSON encoding (narrow, only what this seam needs) -----
export interface AroraField {
  id: string;
  value: AroraValueJSON;
}

export interface AroraStruct {
  id: string;
  fields: AroraField[];
}

export type AroraValueJSON =
  | { str: string }
  | { f32: number }
  | { u32: number }
  | { u64: number }
  | { struct: AroraStruct }
  | { structs: { id: string; elements: Array<{ fields: AroraField[] }> } }
  | Record<string, unknown>;

/** An Arora `Call` payload for `AroraDevice.call`. */
export interface AnimationModuleCall {
  id: string;
  args: AroraField[];
}

export type AnimationLoopMode = "once" | "loop" | "ping_pong";

// --- the stored-clip shape ----------------------------------------------------

/** One authored keyframe: a normalized stamp (0..1) and a scalar value. */
export interface StoredKeypoint {
  id?: string;
  stamp: number;
  value: number;
  /** Authored timing handles (`linear`/`step` ride through; absent = default ease). */
  transitions?: {
    in?: { x: number; y: number };
    out?: { x: number; y: number };
  };
}

/** One authored track: the store path it drives plus its keyframes. */
export interface StoredTrack {
  id?: string;
  name?: string;
  animatableId: string;
  points: StoredKeypoint[];
  /** Ignored by the module; carried for demo UIs (e.g. `{ color }`). */
  settings?: unknown;
}

/**
 * A stored animation clip — the JSON shape the demos author and the standalone
 * `@vizij/animation-wasm` engine also loads (`duration` in ms, per-track
 * keypoints with normalized 0..1 stamps). Extra fields are ignored.
 */
export interface StoredAnimation {
  id?: string | number;
  name?: string;
  duration?: number;
  tracks: StoredTrack[];
  groups?: unknown;
}

const field = (id: string, value: AroraValueJSON): AroraField => ({
  id,
  value,
});

/** One target path per authored track key; identity when no resolver is given. */
export type ResolveTrackKeys = (animatableId: string) => string[];

/**
 * Convert a stored clip into the module's declared `AnimationClip` value.
 *
 * `resolveKeys` decides the final store keys at load time: each track is
 * emitted once per resolved target path, with that path as its `animatable_id`
 * — so the module's `[TrackOutput]` names the store keys the graph's path-less
 * `output` node applies, and no per-tick re-keying exists anywhere. Authored
 * `cubic` keyframes carry no explicit handles in the stored form, so they
 * sample the engine's default ease (`linear`/`step` ride through as handles).
 */
export function storedClipToModuleValue(
  clip: StoredAnimation,
  resolveKeys?: ResolveTrackKeys,
): AroraValueJSON {
  const name =
    typeof clip.name === "string" && clip.name.trim().length > 0
      ? clip.name.trim()
      : typeof clip.id === "string"
        ? clip.id
        : "";
  const durationMs = Number(clip.duration);
  const duration =
    Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 1;

  const tracks = (Array.isArray(clip.tracks) ? clip.tracks : [])
    .map((rawTrack, index) => {
      if (!rawTrack || typeof rawTrack !== "object") {
        return null;
      }
      const animatableId =
        typeof rawTrack.animatableId === "string"
          ? rawTrack.animatableId.trim()
          : "";
      if (!animatableId) {
        return null;
      }
      const trackId =
        typeof rawTrack.id === "string" && rawTrack.id.trim().length > 0
          ? rawTrack.id.trim()
          : `track-${index}`;
      const trackName =
        typeof rawTrack.name === "string" && rawTrack.name.trim().length > 0
          ? rawTrack.name.trim()
          : trackId;

      const points = (Array.isArray(rawTrack.points) ? rawTrack.points : [])
        .map((rawPoint, pointIndex) => {
          if (!rawPoint || typeof rawPoint !== "object") {
            return null;
          }
          const stamp = Number(rawPoint.stamp);
          const value = Number(rawPoint.value);
          if (!Number.isFinite(stamp) || !Number.isFinite(value)) {
            return null;
          }
          const pointId =
            typeof rawPoint.id === "string" && rawPoint.id.trim().length > 0
              ? rawPoint.id.trim()
              : `${trackId}:point-${pointIndex}`;
          const handles = (
            handle: { x: number; y: number } | undefined,
          ): AroraValueJSON => ({
            structs: {
              id: ANIMATION_MODULE_TYPE.transitionHandle,
              elements: handle
                ? [
                    {
                      fields: [
                        field(ANIMATION_MODULE_FIELD.handleX, {
                          f32: handle.x,
                        }),
                        field(ANIMATION_MODULE_FIELD.handleY, {
                          f32: handle.y,
                        }),
                      ],
                    },
                  ]
                : [],
            },
          });
          return {
            fields: [
              field(ANIMATION_MODULE_FIELD.keypointId, { str: pointId }),
              field(ANIMATION_MODULE_FIELD.keypointStamp, {
                f32: Math.max(0, Math.min(1, stamp)),
              }),
              field(ANIMATION_MODULE_FIELD.keypointValue, { f32: value }),
              field(
                ANIMATION_MODULE_FIELD.keypointTransitionsIn,
                handles(rawPoint.transitions?.in),
              ),
              field(
                ANIMATION_MODULE_FIELD.keypointTransitionsOut,
                handles(rawPoint.transitions?.out),
              ),
            ],
          };
        })
        .filter(Boolean) as Array<{ fields: AroraField[] }>;

      if (points.length === 0) {
        return null;
      }

      const targets = resolveKeys?.(animatableId) ?? [animatableId];
      return targets.map((target, targetIndex) => ({
        fields: [
          field(ANIMATION_MODULE_FIELD.trackId, {
            str: targetIndex === 0 ? trackId : `${trackId}~${targetIndex}`,
          }),
          field(ANIMATION_MODULE_FIELD.trackName, { str: trackName }),
          field(ANIMATION_MODULE_FIELD.trackAnimatable, { str: target }),
          field(ANIMATION_MODULE_FIELD.trackPoints, {
            structs: {
              id: ANIMATION_MODULE_TYPE.keypoint,
              elements: points,
            },
          }),
        ],
      }));
    })
    .filter(Boolean)
    .flat() as Array<{ fields: AroraField[] }>;

  return {
    struct: {
      id: ANIMATION_MODULE_TYPE.clip,
      fields: [
        field(ANIMATION_MODULE_FIELD.clipName, { str: name }),
        field(ANIMATION_MODULE_FIELD.clipDuration, { u32: duration }),
        field(ANIMATION_MODULE_FIELD.clipTracks, {
          structs: {
            id: ANIMATION_MODULE_TYPE.track,
            elements: tracks,
          },
        }),
      ],
    },
  };
}

// --- call builders ------------------------------------------------------------

/** `load_animation(clip) → { u32: AnimId }`. */
export function loadAnimationCall(
  clipValue: AroraValueJSON,
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.loadAnimation,
    args: [field(ANIMATION_MODULE_PARAM.clip, clipValue)],
  };
}

/** `create_player(name) → { u32: PlayerId }`. */
export function createPlayerCall(name: string): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.createPlayer,
    args: [field(ANIMATION_MODULE_PARAM.playerName, { str: name })],
  };
}

/** `add_instance(player, anim) → { u32: InstId }`. */
export function addInstanceCall(
  player: number,
  anim: number,
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.addInstance,
    args: [
      field(ANIMATION_MODULE_PARAM.player, { u32: player }),
      field(ANIMATION_MODULE_PARAM.anim, { u32: anim }),
    ],
  };
}

/** `play(player)`: resume or start playback at the next step. */
export function playCall(player: number): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.play,
    args: [field(ANIMATION_MODULE_PARAM.playPlayer, { u32: player })],
  };
}

/** `pause(player)`: hold the playhead at the next step. */
export function pauseCall(player: number): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.pause,
    args: [field(ANIMATION_MODULE_PARAM.pausePlayer, { u32: player })],
  };
}

/** `stop(player)`: reset the playhead to the window start at the next step. */
export function stopCall(player: number): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.stop,
    args: [field(ANIMATION_MODULE_PARAM.stopPlayer, { u32: player })],
  };
}

/** `seek(player, time_ns)`: move the playhead (nanoseconds, the dt_ns base). */
export function seekCall(player: number, timeNs: number): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.seek,
    args: [
      field(ANIMATION_MODULE_PARAM.seekPlayer, { u32: player }),
      field(ANIMATION_MODULE_PARAM.seekTimeNs, {
        u64: Math.max(0, Math.round(timeNs)),
      }),
    ],
  };
}

/** `set_speed(player, speed)`: playback speed multiplier. */
export function setSpeedCall(
  player: number,
  speed: number,
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.setSpeed,
    args: [
      field(ANIMATION_MODULE_PARAM.speedPlayer, { u32: player }),
      field(ANIMATION_MODULE_PARAM.speedValue, { f32: speed }),
    ],
  };
}

/** `set_loop(player, mode)`: `"once" | "loop" | "ping_pong"`. */
export function setLoopCall(
  player: number,
  mode: AnimationLoopMode,
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.setLoop,
    args: [
      field(ANIMATION_MODULE_PARAM.loopPlayer, { u32: player }),
      field(ANIMATION_MODULE_PARAM.loopMode, { str: mode }),
    ],
  };
}

/** The `{ u32 }` a setup call returns, or `null` on any other shape. */
export function callResultU32(result: { ret: unknown }): number | null {
  const ret = result.ret;
  if (ret && typeof ret === "object" && "u32" in ret) {
    const value = Number((ret as { u32: unknown }).u32);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

// --- the behavior graph -------------------------------------------------------

/**
 * Store path the graph writes the module's per-tick `[PlayerState]` feedback
 * to. Not an `arora/` golden key, so it reads back like any store value.
 */
export const ANIMATION_PLAYERS_PATH = "vizij/animations/players";

/** A Vizij graph spec, structurally (what `startDevice` accepts). */
export interface AnimationGraphSpec {
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

/**
 * The behavior graph that ticks the animation module: an `ExternalFunction`
 * node calls the module's `step` every tick, fed the golden `arora/dt`
 * (nanoseconds); a path-less `output` node applies the returned `[TrackOutput]`
 * batch onto the store keys each record names (`default_key` — the final store
 * paths, decided at clip load); and a second `ExternalFunction` / `output` pair
 * writes `player_states()` to `ANIMATION_PLAYERS_PATH`.
 */
export function buildAnimationGraph(): AnimationGraphSpec {
  return {
    nodes: [
      { id: "dt", type: "input", params: { path: "arora/dt" } },
      {
        id: "step",
        type: "externalfunction",
        params: {
          function: ANIMATION_MODULE_FN.step,
          param_ids: [ANIMATION_MODULE_PARAM.dtNs],
        },
      },
      {
        id: "apply",
        type: "output",
        params: {
          key_field: ANIMATION_MODULE_FIELD.outputDefaultKey,
          value_field: ANIMATION_MODULE_FIELD.outputValue,
        },
      },
      {
        id: "states",
        type: "externalfunction",
        params: { function: ANIMATION_MODULE_FN.playerStates, param_ids: [] },
      },
      {
        id: "states-out",
        type: "output",
        params: { path: ANIMATION_PLAYERS_PATH },
      },
    ],
    edges: [
      { from: { node_id: "dt" }, to: { node_id: "step", input: "args_0" } },
      { from: { node_id: "step" }, to: { node_id: "apply", input: "in" } },
      {
        from: { node_id: "states" },
        to: { node_id: "states-out", input: "in" },
      },
    ],
  };
}

// --- PlayerState decoding -------------------------------------------------------

export interface AnimationPlayerState {
  /** The module `PlayerId` (correlate via the loaded clips' player ids). */
  player: number;
  /** `"playing" | "paused" | "stopped"` — the engine's derived state. */
  state: string;
  /** Playhead in seconds. */
  time: number;
  /** Full player length in seconds. */
  duration: number;
  /** Playback speed multiplier. */
  speed: number;
}

function fieldNumber(value: AroraValueJSON | undefined): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of ["u64", "u32", "f32", "f64"]) {
    if (key in value) {
      const parsed = Number((value as Record<string, unknown>)[key]);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

/**
 * Decode the `[PlayerState]` value the graph writes to `ANIMATION_PLAYERS_PATH`
 * (a `structs` of the declared PlayerState type). Tolerant: unknown shapes
 * decode to an empty list.
 */
export function decodePlayerStates(raw: unknown): AnimationPlayerState[] {
  if (!raw || typeof raw !== "object" || !("structs" in raw)) {
    return [];
  }
  const structs = (raw as { structs?: { elements?: unknown } }).structs;
  const elements = Array.isArray(structs?.elements) ? structs.elements : [];
  const states: AnimationPlayerState[] = [];
  for (const element of elements) {
    const fields = (element as { fields?: unknown })?.fields;
    if (!Array.isArray(fields)) {
      continue;
    }
    const byId = new Map<string, AroraValueJSON>();
    for (const entry of fields) {
      const id = (entry as { id?: unknown })?.id;
      const value = (entry as { value?: unknown })?.value;
      if (typeof id === "string" && value && typeof value === "object") {
        byId.set(id, value as AroraValueJSON);
      }
    }
    const player = fieldNumber(byId.get(ANIMATION_MODULE_FIELD.statePlayer));
    if (player === null) {
      continue;
    }
    const stateValue = byId.get(ANIMATION_MODULE_FIELD.stateState);
    states.push({
      player,
      state:
        stateValue && "str" in stateValue
          ? String((stateValue as { str: unknown }).str)
          : "",
      time:
        (fieldNumber(byId.get(ANIMATION_MODULE_FIELD.stateTimeNs)) ?? 0) / 1e9,
      duration:
        (fieldNumber(byId.get(ANIMATION_MODULE_FIELD.stateDurationNs)) ?? 0) /
        1e9,
      speed: fieldNumber(byId.get(ANIMATION_MODULE_FIELD.stateSpeed)) ?? 1,
    });
  }
  return states;
}

// --- the React hook -----------------------------------------------------------

export interface UseAnimationRuntimeOptions {
  /** Start playback as soon as the clips are loaded (default: true). */
  autoplay?: boolean;
  /** How player time maps into clip time (default: "loop"). */
  loop?: AnimationLoopMode;
}

export interface AnimationRuntimeApi {
  /** True once the runtime is up and the clips are loaded. */
  ready: boolean;
  /**
   * Latest store snapshot. A track's current sampled value is at
   * `values[animatableId]` in the Vizij `ValueJSON` vocabulary.
   */
  values: Record<string, ValueJSON | null>;
  /** Decoded per-tick player feedback (time / length / state / speed). */
  players: AnimationPlayerState[];
  /** Resume (or start) playback. */
  play: () => void;
  /** Hold the playhead. */
  pause: () => void;
  /** Reset the playhead to the clip start. */
  stop: () => void;
  /** Move the playhead to `seconds`. */
  seek: (seconds: number) => void;
  /** Set the playback speed multiplier. */
  setSpeed: (speed: number) => void;
  /** A setup error message, or null. */
  error: string | null;
}

const EMPTY_VALUES: Record<string, ValueJSON | null> = {};
const EMPTY_PLAYERS: AnimationPlayerState[] = [];

function normalizeClips(
  clips: StoredAnimation[] | StoredAnimation | null | undefined,
): StoredAnimation[] {
  if (!clips) {
    return [];
  }
  return Array.isArray(clips) ? clips : [clips];
}

/**
 * Run `clips` through a `@vizij/runtime` runtime with the animation module and
 * surface the sampled outputs + player transport. The runtime is (re)built
 * whenever the `clips` identity changes — that is the reload path. Transport
 * calls dispatch on the next runtime step, which the running loop takes.
 */
export function useAnimationRuntime(
  clips: StoredAnimation[] | StoredAnimation | null | undefined,
  options: UseAnimationRuntimeOptions = {},
): AnimationRuntimeApi {
  const { autoplay = true, loop = "loop" } = options;

  const [ready, setReady] = useState(false);
  const [values, setValues] =
    useState<Record<string, ValueJSON | null>>(EMPTY_VALUES);
  const [players, setPlayers] = useState<AnimationPlayerState[]>(EMPTY_PLAYERS);
  const [error, setError] = useState<string | null>(null);

  // The live runtime + its single player id, shared with the transport methods.
  const runtimeRef = useRef<AroraDevice | null>(null);
  const playerIdRef = useRef<number | null>(null);

  const clipList = normalizeClips(clips);

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let runtime: AroraDevice | null = null;
    const accumulated: Record<string, ValueJSON | null> = {};

    setReady(false);
    setValues(EMPTY_VALUES);
    setPlayers(EMPTY_PLAYERS);
    setError(null);
    runtimeRef.current = null;
    playerIdRef.current = null;

    (async () => {
      try {
        await init();
        const module = await loadAnimationModule();
        if (cancelled) return;
        runtime = await startDevice(buildAnimationGraph(), undefined, [module]);
        if (cancelled) {
          runtime.dispose();
          return;
        }

        // Issue a call, take the pending step that dispatches it, and await it.
        const callSync = async (call: Parameters<AroraDevice["call"]>[0]) => {
          const pending = runtime!.call(call);
          runtime!.step(0);
          return pending;
        };

        const playerResult = await callSync(createPlayerCall("default"));
        const playerId = callResultU32(playerResult);
        if (cancelled) return;
        if (playerId === null) {
          throw new Error("create_player did not return a player id");
        }

        for (const clip of clipList) {
          const animResult = await callSync(
            loadAnimationCall(storedClipToModuleValue(clip)),
          );
          if (cancelled) return;
          const animId = callResultU32(animResult);
          if (animId === null) continue;
          await callSync(addInstanceCall(playerId, animId));
          if (cancelled) return;
        }

        await callSync(setLoopCall(playerId, loop));
        if (cancelled) return;
        if (autoplay) {
          await callSync(playCall(playerId));
          if (cancelled) return;
        }

        runtimeRef.current = runtime;
        playerIdRef.current = playerId;
        setReady(true);

        // Advance the runtime and mirror the store into React each frame.
        let last =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const tick = () => {
          if (cancelled || !runtime) return;
          const now =
            typeof performance !== "undefined" ? performance.now() : Date.now();
          const dtMs = Math.max(0, now - last);
          last = now;
          runtime.step(dtMs);
          const changes = runtime.drainChanges();
          let dirty = false;
          for (const [key, value] of Object.entries(changes)) {
            accumulated[key] = value;
            dirty = true;
          }
          if (dirty) {
            setValues({ ...accumulated });
            setPlayers(decodePlayerStates(accumulated[ANIMATION_PLAYERS_PATH]));
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      runtimeRef.current = null;
      playerIdRef.current = null;
      try {
        runtime?.dispose();
      } catch {
        // A disposed runtime is unusable; nothing to recover.
      }
    };
    // The clips array identity is the reload trigger; loop/autoplay are read at
    // setup time. Consumers pass a stable clips reference and change it to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  return useMemo<AnimationRuntimeApi>(() => {
    const withPlayer = (
      build: (player: number) => Parameters<AroraDevice["call"]>[0],
    ) => {
      const runtime = runtimeRef.current;
      const player = playerIdRef.current;
      if (!runtime || player === null) return;
      // The running RAF loop takes the step that dispatches this call.
      void runtime.call(build(player)).catch(() => {
        // A failed transport call means the runtime was torn down mid-issue.
      });
    };
    return {
      ready,
      values,
      players,
      play: () => withPlayer((player) => playCall(player)),
      pause: () => withPlayer((player) => pauseCall(player)),
      stop: () => withPlayer((player) => stopCall(player)),
      seek: (seconds: number) =>
        withPlayer((player) => seekCall(player, seconds * 1e9)),
      setSpeed: (speed: number) =>
        withPlayer((player) => setSpeedCall(player, speed)),
      error,
    };
  }, [ready, values, players, error]);
}
