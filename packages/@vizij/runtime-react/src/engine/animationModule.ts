/**
 * Bindings to `@vizij/animation-module` — vizij-animation-core packaged as an
 * Arora wasm module — as consumed by the runtime's Arora device.
 *
 * The module's declared ABI (ids from its `module.yaml` and type records,
 * version 0.2.0) is mirrored here as constants:
 * - setup — `load_animation` / `create_player` / `add_instance`;
 * - per tick — `step(dt_ns)` (fed the runtime's built-in `arora/dt`),
 *   returning `[TrackOutput]`: per-track identity plus the track's authored
 *   default key and sampled value. The device graph applies the batch onto
 *   its keys via a path-less `output` node (`key_field`/`value_field`), so
 *   the final store keys are decided at clip **load** time (see
 *   `storedClipToModuleValue`'s `resolveKeys`);
 * - transport — `play` / `pause` / `stop` / `seek(time_ns)` / `set_speed` /
 *   `set_loop` / `set_weight` (buffered into the next step, in issue order)
 *   and `remove_instance` (immediate);
 * - feedback — `player_states()`, written to `ANIMATION_PLAYERS_PATH` by the
 *   animations source each tick. A patch: the vision is state changes as
 *   first-class, combinable values, not a second feedback channel.
 *
 * Call arguments and returns use the **Arora `Value` JSON encoding**
 * (`{ str }`, `{ f32 }`, `{ u32 }`, `{ struct }`, `{ structs }`, …), which is
 * distinct from the Vizij `ValueJSON` vocabulary the store surface speaks.
 *
 * Remaining fidelity gap: authored `cubic` keyframes carry no explicit
 * handles in the stored form, so they still sample the engine's default
 * ease (`linear`/`step` timing rides through as explicit handles).
 */
import type { GraphSource } from "../utils/composeGraph";

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
  weightPlayer: "76697a69-6a00-0000-0f0b-000000000001",
  weightInstance: "76697a69-6a00-0000-0f0b-000000000002",
  weightValue: "76697a69-6a00-0000-0f0b-000000000003",
  removePlayer: "76697a69-6a00-0000-0f0c-000000000001",
  removeInstance: "76697a69-6a00-0000-0f0c-000000000002",
} as const;

// --- declared structure ids (records/structure/*.yaml) -----------------------
export const ANIMATION_MODULE_TYPE = {
  clip: "76697a69-6a00-0000-0000-000000000100",
  track: "76697a69-6a00-0000-0000-000000000101",
  keypoint: "76697a69-6a00-0000-0000-000000000102",
  transitionHandle: "76697a69-6a00-0000-0000-000000000103",
  trackOutput: "76697a69-6a00-0000-0000-000000000110",
  playerState: "76697a69-6a00-0000-0000-000000000111",
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
  outputTrackId: "76697a69-6a00-0000-0110-000000000001",
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

/** An Arora `Call` payload for `Runtime.call`. */
export interface AnimationModuleCall {
  id: string;
  args: AroraField[];
}

// --- stored-clip → module-clip conversion ------------------------------------

/**
 * The registered ("stored") clip shape the runtime keeps per animation —
 * what `toStoredAnimationClip` produces and what `setup.animation` payloads
 * carry: duration in ms, per-track keypoints with normalized stamps (0..1).
 */
export interface StoredAnimationClipLike {
  id?: unknown;
  name?: unknown;
  duration?: unknown;
  tracks?: unknown;
}

interface StoredTrackLike {
  id?: unknown;
  name?: unknown;
  animatableId?: unknown;
  points?: unknown;
}

interface StoredKeypointLike {
  id?: unknown;
  stamp?: unknown;
  value?: unknown;
  /** Authored timing handles (`linear`/`step` ride through; absent = default ease). */
  transitions?: {
    in?: { x: number; y: number };
    out?: { x: number; y: number };
  };
}

const field = (id: string, value: AroraValueJSON): AroraField => ({
  id,
  value,
});

/** One target path per authored key; identity when no resolver is given. */
export type ResolveTrackKeys = (animatableId: string) => string[];

/**
 * Convert a stored clip into the module's declared `AnimationClip` value.
 *
 * Faithful for identity, timing handles, and scalar keyframe values.
 * `resolveKeys` decides the **final store keys** at load time: each track is
 * emitted once per resolved target path, with that path as its
 * `animatable_id` — so the module's `[TrackOutput]` names the store keys the
 * path-less `output` node applies, and no per-tick re-keying exists anywhere.
 * Authored `cubic` keyframes carry no explicit handles in the stored form,
 * so they sample the engine's default ease (`linear`/`step` ride through as
 * handles).
 */
export function storedClipToModuleValue(
  clip: StoredAnimationClipLike,
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
    .map((rawTrack: StoredTrackLike, index: number) => {
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
        .map((rawPoint: StoredKeypointLike, pointIndex: number) => {
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
  mode: "once" | "loop" | "ping_pong",
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.setLoop,
    args: [
      field(ANIMATION_MODULE_PARAM.loopPlayer, { u32: player }),
      field(ANIMATION_MODULE_PARAM.loopMode, { str: mode }),
    ],
  };
}

/** `set_weight(player, instance, weight)`: per-instance blend weight. */
export function setWeightCall(
  player: number,
  instance: number,
  weight: number,
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.setWeight,
    args: [
      field(ANIMATION_MODULE_PARAM.weightPlayer, { u32: player }),
      field(ANIMATION_MODULE_PARAM.weightInstance, { u32: instance }),
      field(ANIMATION_MODULE_PARAM.weightValue, { f32: weight }),
    ],
  };
}

/** `remove_instance(player, instance)`: detach immediately. */
export function removeInstanceCall(
  player: number,
  instance: number,
): AnimationModuleCall {
  return {
    id: ANIMATION_MODULE_FN.removeInstance,
    args: [
      field(ANIMATION_MODULE_PARAM.removePlayer, { u32: player }),
      field(ANIMATION_MODULE_PARAM.removeInstance, { u32: instance }),
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

// --- the "animations" graph source ---------------------------------------------

/**
 * Store path the animations source writes the module's per-tick
 * `[PlayerState]` feedback to. Not an `arora/` built-in key, so it carries
 * across device restarts like any other store value.
 */
export const ANIMATION_PLAYERS_PATH = "vizij/animations/players";

/**
 * Source id of the animations graph source (see `composeGraphSpecs` for how
 * source ids namespace node ids).
 */
export const ANIMATIONS_SOURCE_ID = "animations";

/**
 * The graph source that makes the animation module tick **inside the
 * device**: an `ExternalFunction` node calls the module's `step` every
 * device tick, fed the runtime's built-in `arora/dt` (nanoseconds), and a
 * path-less `output` node applies the returned `[TrackOutput]` batch onto
 * the store keys each record names (`default_key` — the final rig paths,
 * decided at clip load). A second `ExternalFunction` node writes the
 * `player_states()` feedback to `ANIMATION_PLAYERS_PATH`.
 */
export function animationsGraphSource(): GraphSource {
  return {
    sourceId: ANIMATIONS_SOURCE_ID,
    spec: {
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
    },
  };
}

// --- PlayerState decoding -------------------------------------------------------

export interface AnimationPlayerState {
  /** The module `PlayerId` (correlate via the host's per-clip player ids). */
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
  // `u64`/`u32`/`f32` are the module ABI's encodings; `float` is the store's
  // `ValueJSON` encoding, which is what a read-back through the value store
  // produces. Both reach this decoder depending on the route the feedback took.
  for (const key of ["u64", "u32", "f32", "f64", "float"]) {
    if (key in value) {
      const parsed = Number((value as Record<string, unknown>)[key]);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

function fieldText(value: AroraValueJSON | undefined): string {
  if (!value || typeof value !== "object") {
    return "";
  }
  const record = value as Record<string, unknown>;
  // `str` is the module ABI encoding; `text` is the store's.
  for (const key of ["str", "text"]) {
    if (typeof record[key] === "string") {
      return record[key] as string;
    }
  }
  return "";
}

/**
 * Reads one PlayerState from a field map, whatever route it arrived by.
 * Returns null when the entry carries no player id, which is the only
 * genuinely unusable case.
 */
function playerStateFromFields(
  byId: Map<string, AroraValueJSON>,
): AnimationPlayerState | null {
  const player = fieldNumber(byId.get(ANIMATION_MODULE_FIELD.statePlayer));
  if (player === null) {
    return null;
  }
  return {
    player,
    state: fieldText(byId.get(ANIMATION_MODULE_FIELD.stateState)),
    time:
      (fieldNumber(byId.get(ANIMATION_MODULE_FIELD.stateTimeNs)) ?? 0) / 1e9,
    duration:
      (fieldNumber(byId.get(ANIMATION_MODULE_FIELD.stateDurationNs)) ?? 0) /
      1e9,
    speed: fieldNumber(byId.get(ANIMATION_MODULE_FIELD.stateSpeed)) ?? 1,
  };
}

/**
 * Field map for one element in the module ABI encoding
 * (`{ fields: [{ id, value }] }`).
 */
function fieldsToMap(fields: unknown): Map<string, AroraValueJSON> | null {
  if (!Array.isArray(fields)) {
    return null;
  }
  const byId = new Map<string, AroraValueJSON>();
  for (const entry of fields) {
    const id = (entry as { id?: unknown })?.id;
    const value = (entry as { value?: unknown })?.value;
    if (typeof id === "string" && value && typeof value === "object") {
      byId.set(id, value as AroraValueJSON);
    }
  }
  return byId;
}

/**
 * Field map for one element in the store's `ValueJSON` encoding
 * (`{ record: { <fieldId>: value } }`).
 */
function recordToMap(element: unknown): Map<string, AroraValueJSON> | null {
  if (!element || typeof element !== "object") {
    return null;
  }
  const record = (element as { record?: unknown }).record;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }
  const byId = new Map<string, AroraValueJSON>();
  for (const [id, value] of Object.entries(record as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      byId.set(id, value as AroraValueJSON);
    }
  }
  return byId;
}

/**
 * Decode the `[PlayerState]` value the animations source writes to
 * `ANIMATION_PLAYERS_PATH` (a `structs` of the declared PlayerState type).
 * Tolerant: unknown shapes decode to an empty list.
 */
export function decodePlayerStates(raw: unknown): AnimationPlayerState[] {
  if (!raw || typeof raw !== "object") {
    return [];
  }

  // Two encodings reach here. The module ABI form
  // (`{ structs: { elements: [{ fields: [...] }] } }`) is what an
  // ExternalFunction returns directly. The store form
  // (`{ list | array: [{ record: {...} }] }`) is what a read-back from the
  // value store produces, because the feedback is written through an `output`
  // node. Supporting only the first silently yields no player states, which
  // reads downstream as a playhead parked at 0.
  const container = raw as Record<string, unknown>;
  const states: AnimationPlayerState[] = [];

  const structs = container.structs as { elements?: unknown } | undefined;
  if (structs && Array.isArray(structs.elements)) {
    for (const element of structs.elements) {
      const byId = fieldsToMap((element as { fields?: unknown })?.fields);
      const state = byId ? playerStateFromFields(byId) : null;
      if (state) {
        states.push(state);
      }
    }
    return states;
  }

  const elements = Array.isArray(container.list)
    ? container.list
    : Array.isArray(container.array)
      ? container.array
      : null;
  if (!elements) {
    return states;
  }
  for (const element of elements) {
    const byId =
      recordToMap(element) ??
      fieldsToMap(
        (element as { struct?: { fields?: unknown } })?.struct?.fields ??
          (element as { fields?: unknown })?.fields,
      );
    const state = byId ? playerStateFromFields(byId) : null;
    if (state) {
      states.push(state);
    }
  }
  return states;
}
