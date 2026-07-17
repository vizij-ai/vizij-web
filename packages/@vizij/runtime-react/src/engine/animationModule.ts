/**
 * Bindings to `@vizij/animation-module` — vizij-animation-core packaged as an
 * Arora wasm module — as consumed by the runtime's Arora device.
 *
 * The module's declared ABI (ids from its `module.yaml` and type records,
 * version 0.1.0) is mirrored here as constants: the call surface is
 * `load_animation` / `create_player` / `add_instance` (setup) and
 * `step(dt_ns)` (per tick, fed the runtime's golden `arora/dt`). `step`
 * returns `[TrackOutput]` — per-track identity plus the track's authored
 * default key and sampled value; the consumer decides the final store key.
 *
 * Call arguments and returns use the **Arora `Value` JSON encoding**
 * (`{ str }`, `{ f32 }`, `{ u32 }`, `{ struct }`, `{ structs }`, …), which is
 * distinct from the Vizij `ValueJSON` vocabulary the store surface speaks.
 *
 * What the 0.1.0 module surface does NOT declare (the honest capability
 * gaps — playback stays in the JS clip pipeline until the module exposes
 * them; see the README's "Animations and the device" section):
 * - player commands: pause / seek / stop / speed / loop mode / windows
 *   (`module.yaml` marks them "a future extension");
 * - playback feedback: player time / duration / playing;
 * - per-keypoint `transitions` (cubic-bezier timing): the module's
 *   `Keypoint` is `{ id, stamp, value }`, so authored linear/step/cubic
 *   timing is dropped and the engine samples its default ease instead;
 * - per-instance weights (blending) and instance removal.
 */
import type { GraphSource } from "../utils/composeGraph";

// --- declared function + parameter ids (module.yaml) -------------------------
export const ANIMATION_MODULE_FN = {
  loadAnimation: "76697a69-6a00-0000-0f00-000000000001",
  createPlayer: "76697a69-6a00-0000-0f00-000000000002",
  addInstance: "76697a69-6a00-0000-0f00-000000000003",
  step: "76697a69-6a00-0000-0f00-000000000004",
} as const;

export const ANIMATION_MODULE_PARAM = {
  clip: "76697a69-6a00-0000-0f01-000000000001",
  playerName: "76697a69-6a00-0000-0f02-000000000001",
  player: "76697a69-6a00-0000-0f03-000000000001",
  anim: "76697a69-6a00-0000-0f03-000000000002",
  dtNs: "76697a69-6a00-0000-0f04-000000000001",
} as const;

// --- declared structure ids (records/structure/*.yaml) -----------------------
export const ANIMATION_MODULE_TYPE = {
  clip: "76697a69-6a00-0000-0000-000000000100",
  track: "76697a69-6a00-0000-0000-000000000101",
  keypoint: "76697a69-6a00-0000-0000-000000000102",
  trackOutput: "76697a69-6a00-0000-0000-000000000110",
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
  outputTrackId: "76697a69-6a00-0000-0110-000000000001",
  outputDefaultKey: "76697a69-6a00-0000-0110-000000000002",
  outputValue: "76697a69-6a00-0000-0110-000000000003",
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
}

const field = (id: string, value: AroraValueJSON): AroraField => ({
  id,
  value,
});

/**
 * Convert a stored clip into the module's declared `AnimationClip` value.
 *
 * Faithful for identity, timing, and scalar keyframe values. Deliberately
 * dropped because the module's `Keypoint` cannot carry them (documented
 * capability gap, NOT approximated here): per-keypoint `transitions` —
 * the module engine samples its default ease between keypoints instead of
 * the authored linear/step/cubic timing.
 */
export function storedClipToModuleValue(
  clip: StoredAnimationClipLike,
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
          return {
            fields: [
              field(ANIMATION_MODULE_FIELD.keypointId, { str: pointId }),
              field(ANIMATION_MODULE_FIELD.keypointStamp, {
                f32: Math.max(0, Math.min(1, stamp)),
              }),
              field(ANIMATION_MODULE_FIELD.keypointValue, { f32: value }),
            ],
          };
        })
        .filter(Boolean) as Array<{ fields: AroraField[] }>;

      if (points.length === 0) {
        return null;
      }

      return {
        fields: [
          field(ANIMATION_MODULE_FIELD.trackId, { str: trackId }),
          field(ANIMATION_MODULE_FIELD.trackName, { str: trackName }),
          field(ANIMATION_MODULE_FIELD.trackAnimatable, { str: animatableId }),
          field(ANIMATION_MODULE_FIELD.trackPoints, {
            structs: {
              id: ANIMATION_MODULE_TYPE.keypoint,
              elements: points,
            },
          }),
        ],
      };
    })
    .filter(Boolean) as Array<{ fields: AroraField[] }>;

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
 * `[TrackOutput]` to. Not an `arora/` golden key, so it carries across
 * device restarts like any other store value.
 */
export const ANIMATIONS_OUT_PATH = "vizij/animations/out";

/**
 * Source id of the animations graph source (see `composeGraphSpecs` for how
 * source ids namespace node ids).
 */
export const ANIMATIONS_SOURCE_ID = "animations";

/**
 * The graph source that makes the animation module tick **inside the
 * device**: an `ExternalFunction` node calls the module's `step` every
 * device tick, fed the runtime's golden `arora/dt` (nanoseconds), and the
 * returned `[TrackOutput]` lands at `ANIMATIONS_OUT_PATH`.
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
        { id: "out", type: "output", params: { path: ANIMATIONS_OUT_PATH } },
      ],
      edges: [
        { from: { node_id: "dt" }, to: { node_id: "step", input: "args_0" } },
        { from: { node_id: "step" }, to: { node_id: "out", input: "in" } },
      ],
    },
  };
}

// --- TrackOutput decoding -------------------------------------------------------

export interface AnimationTrackOutput {
  /** The authored track's stable id. */
  trackId: string;
  /** The track's authored key (its `animatableId`) — the default store key. */
  defaultKey: string;
  /** The sampled value, in the Arora `Value` encoding. */
  value: AroraValueJSON;
}

/**
 * Read a scalar number out of an Arora `Value` JSON, across the encodings a
 * sampled track value can arrive in (`f32`/`f64`/`float` scalars, integer
 * scalars). Non-scalar or unknown shapes return `null`.
 */
export function aroraValueToNumber(value: AroraValueJSON): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of ["f32", "f64", "float", "i32", "i64", "u32", "u64"]) {
    if (key in value) {
      const parsed = Number((value as Record<string, unknown>)[key]);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
}

/**
 * Decode the `[TrackOutput]` value the animations source writes to
 * `ANIMATIONS_OUT_PATH` (a `structs` of the declared TrackOutput type).
 * Tolerant: unknown shapes decode to an empty list.
 */
export function decodeTrackOutputs(raw: unknown): AnimationTrackOutput[] {
  if (!raw || typeof raw !== "object" || !("structs" in raw)) {
    return [];
  }
  const structs = (raw as { structs?: { elements?: unknown } }).structs;
  const elements = Array.isArray(structs?.elements) ? structs.elements : [];
  const outputs: AnimationTrackOutput[] = [];
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
    const trackId = byId.get(ANIMATION_MODULE_FIELD.outputTrackId);
    const defaultKey = byId.get(ANIMATION_MODULE_FIELD.outputDefaultKey);
    const value = byId.get(ANIMATION_MODULE_FIELD.outputValue);
    if (!value) {
      continue;
    }
    outputs.push({
      trackId:
        trackId && "str" in trackId ? String((trackId as { str: unknown }).str) : "",
      defaultKey:
        defaultKey && "str" in defaultKey
          ? String((defaultKey as { str: unknown }).str)
          : "",
      value,
    });
  }
  return outputs;
}
