import {
  startRuntime,
  type Animation,
  type Runtime,
  type ValueInput,
} from "@vizij/runtime";
import { valueAsNumber } from "@vizij/value-json";
import type { AnimationTrackIR } from "../types/animationClipIr";
import { normalizeInterpolation } from "./animationClipCompiler";

/**
 * Authoring reads an animation's values from Arora's animation module, the
 * engine a face plays it with, so what the timeline previews, bakes and saves
 * as a pose is what the face plays.
 *
 * The module runs on a device of its own (`startRuntime`), with no Vizij and
 * no animation source in its graph. Nothing on that device steps the module
 * but this file, and nothing writes the values to a key: a player is
 * stepped across the times asked for, and `step_values` returns its outputs,
 * which are collected. The face's own device is never touched.
 */

/** `StepValues`' field ids (record 1.1.0 of `@arora/animation`). */
const STEP_VALUES_FIELDS = {
  revision: "76697a69-6a00-0000-0113-000000000001",
  values: "76697a69-6a00-0000-0113-000000000002",
} as const;

/** `OutputKeys`' field ids (record 1.1.0 of `@arora/animation`). */
const OUTPUT_KEYS_FIELDS = {
  revision: "76697a69-6a00-0000-0114-000000000001",
  keys: "76697a69-6a00-0000-0114-000000000002",
} as const;

/** What `create_player` and the other id-returning functions answer for an
 * unknown target or a refused value. */
const REFUSED = 0xffff_ffff;

/** A record value's field, by id (`{ struct: { fields: [{ id, value }] } }`). */
function field(record: unknown, id: string): unknown {
  const fields = (record as { struct?: { fields?: unknown } } | null)?.struct
    ?.fields;
  if (!Array.isArray(fields)) {
    return undefined;
  }
  return (fields as Array<{ id?: unknown; value?: unknown }>).find(
    (entry) => entry.id === id,
  )?.value;
}

/** An id a module function returned (`{ u32 }`), refusing `u32::MAX`. */
function handed(value: unknown, what: string): ValueInput {
  const id = (value as { u32?: unknown } | null)?.u32;
  if (typeof id !== "number" || id === REFUSED) {
    throw new Error(`the animation module refused ${what}`);
  }
  return value as ValueInput;
}

/** `track` on `channel`, its keyframes in time order, each stating how its
 * segment plays, as `Runtime.moduleAnimation` takes them. A keyframe whose
 * time or value is not a finite number is refused, naming the track: no
 * curve passes through it, and reading one anyway would put a number on the
 * face that the animation does not hold. */
function trackOf(
  track: AnimationTrackIR,
  channel: string,
): Animation["tracks"][number] {
  const finite = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  for (const keyframe of track.keyframes) {
    if (finite(keyframe.time) === null || finite(keyframe.value) === null) {
      throw new RangeError(
        `track ${track.id} has a keyframe (${keyframe.id}) whose time or ` +
          "value is not a finite number",
      );
    }
  }
  const keyframes = [...track.keyframes].sort(
    (left, right) => left.time - right.time || left.id.localeCompare(right.id),
  );
  return {
    channel,
    interpolation: normalizeInterpolation(track.interpolation),
    keyframes: keyframes.map((keyframe) => ({
      time: keyframe.time,
      value: keyframe.value,
      interpolation: normalizeInterpolation(
        keyframe.interpolation ?? track.interpolation,
      ),
      inTangent: finite(keyframe.inTangent),
      outTangent: finite(keyframe.outTangent),
    })),
  };
}

/** The latest keyframe time of `played`, and zero when none is later. A loop
 * rather than `Math.max(...times)`, whose arguments overflow the stack on a
 * long animation. */
function lastKeyTime(
  played: ReadonlyArray<{ track: AnimationTrackIR }>,
): number {
  let last = 0;
  for (const { track } of played) {
    for (const keyframe of track.keyframes) {
      last = Math.max(last, keyframe.time);
    }
  }
  return last;
}

const warn = (error: unknown) =>
  console.warn("[animation sampling] the module refused a removal:", error);

let device: Promise<Runtime> | undefined;

/** The sampler's device, started on first use. A start that fails is not
 * kept, so the next sampling tries again. */
function samplerDevice(): Promise<Runtime> {
  device ??= startRuntime().catch((error: unknown) => {
    device = undefined;
    throw error;
  });
  return device;
}

// A module replaced by hot reload leaves its device behind otherwise.
import.meta.hot?.dispose(() => {
  void device?.then((runtime) => runtime.dispose()).catch(() => undefined);
  device = undefined;
  loaded = undefined;
});
/** The sampling in progress. A step advances every player the module
 * holds, so one sampling runs at a time. */
let pending: Promise<unknown> = Promise.resolve();

/**
 * The animation the module holds, its player, and the positions its outputs
 * come in. `from` is what it was loaded from: each played track, its
 * keyframes and its interpolation, by identity. Authoring replaces a track's
 * keyframes on every edit rather than mutating them, so the same identities
 * mean the same curves, and a scrub across one animation loads it once.
 */
interface Loaded {
  from: unknown[];
  anim: ValueInput;
  /** Absent until `create_player` has answered. */
  player?: ValueInput;
  /** The track each output position plays, by its index in the sampling. */
  tracks: number[];
  /** The outputs' revision, which every step answers with. */
  revision: string;
}
let loaded: Loaded | undefined;

/**
 * Each track's value at each of `times` (seconds), as Arora's animation
 * module plays it: `values[track][time]`.
 *
 * The tracks load as one animation, its length its last keyframe, played by
 * one player in `once` mode. The player is sought to zero, then stepped to
 * each time in increasing order, in whole nanoseconds, and each step's
 * outputs are read back: a time past the last keyframe reads its value, as
 * one before zero reads zero's. Each track plays alone, under its own name,
 * so tracks that would drive one input on a face are each read in full. A
 * track with no keyframes reads 0.
 */
export function sampleAnimationTracks(
  tracks: ReadonlyArray<AnimationTrackIR>,
  times: ReadonlyArray<number>,
): Promise<number[][]> {
  const sampling = pending.then(() => sample(tracks, times));
  pending = sampling.catch(() => undefined);
  return sampling;
}

/** `track`'s value at `time`: {@link sampleAnimationTracks} of one. */
export async function sampleAnimationTrack(
  track: AnimationTrackIR,
  time: number,
): Promise<number> {
  const [values] = await sampleAnimationTracks([track], [time]);
  return values![0]!;
}

/** Removes the loaded animation and its player from the module. Applied
 * before the next sampling's calls, which queue after these. */
function unload(runtime: Runtime) {
  if (loaded) {
    if (loaded.player) {
      runtime.invoke("remove_player", { player: loaded.player }).catch(warn);
    }
    runtime.invoke("unload_animation", { anim: loaded.anim }).catch(warn);
    loaded = undefined;
  }
}

/** The animation of `played` on the module, loading it unless it is the one
 * already loaded. */
async function load(
  runtime: Runtime,
  played: ReadonlyArray<{ track: AnimationTrackIR; index: number }>,
): Promise<Required<Loaded>> {
  const from = played.flatMap(({ track, index }) => [
    index,
    track,
    track.keyframes,
    track.interpolation,
  ]);
  if (
    loaded &&
    loaded.from.length === from.length &&
    loaded.from.every((entry, index) => entry === from[index]) &&
    loaded.player
  ) {
    return { ...loaded, player: loaded.player };
  }
  unload(runtime);
  const animation: Animation = {
    id: "authoring.sample",
    name: null,
    duration: lastKeyTime(played),
    tracks: played.map(({ track, index }) => trackOf(track, String(index))),
  };
  const { moduleAnimation } = runtime.moduleAnimation(animation);
  const anim = handed(
    await runtime.invoke("load_clip", { clip: moduleAnimation as ValueInput }),
    "the animation",
  );
  // Recorded before anything below can be refused, so a refusal unloads it.
  const current: Loaded = { from, anim, tracks: [], revision: "" };
  loaded = current;
  const player = handed(
    await runtime.invoke("create_player", { name: animation.id }),
    "a player",
  );
  current.player = player;
  handed(
    await runtime.invoke("add_instance", { player, anim }),
    "the instance",
  );
  // The player ends at its length rather than wrapping.
  handed(await runtime.invoke("set_loop", { player, mode: "once" }), "once");
  const table = await runtime.invoke("output_keys");
  const keys = (
    field(table, OUTPUT_KEYS_FIELDS.keys) as { strs?: string[] } | null
  )?.strs;
  if (!keys) {
    throw new Error("the animation module named no outputs");
  }
  current.tracks = keys.map(Number);
  current.revision = JSON.stringify(field(table, OUTPUT_KEYS_FIELDS.revision));
  for (const { index } of played) {
    if (!current.tracks.includes(index)) {
      throw new Error(`the animation module gave track ${index} no output`);
    }
  }
  return { ...current, player };
}

async function sample(
  tracks: ReadonlyArray<AnimationTrackIR>,
  times: ReadonlyArray<number>,
): Promise<number[][]> {
  const values = tracks.map(() => times.map(() => 0));
  const played = tracks.flatMap((track, index) =>
    track.keyframes.length > 0 ? [{ track, index }] : [],
  );
  if (played.length === 0 || times.length === 0) {
    return values;
  }

  const instants = times.map((time) => {
    if (!Number.isFinite(time)) {
      throw new RangeError(`cannot sample an animation at ${time} s`);
    }
    return Math.max(0, Math.round(time * 1e9));
  });
  const steps = [...new Set(instants)].sort((left, right) => left - right);

  const runtime = await samplerDevice();
  try {
    const { player, tracks: positions, revision } = await load(runtime, played);
    // One step of the device applies these, in order: the player back at
    // zero, then stepped to each instant.
    const sought = runtime.invoke("seek", { player, time_ns: { u64: 0 } });
    let previous = 0;
    const stepped = steps.map((instant) => {
      const dt = instant - previous;
      previous = instant;
      return runtime.invoke("step_values", { dt_ns: { u64: dt } });
    });
    // Awaited together, so that no refusal among them goes unobserved.
    const [seek, ...answers] = await Promise.all([sought, ...stepped]);
    handed(seek, "the seek");
    const byInstant = new Map<number, unknown[]>();
    answers.forEach((step, index) => {
      if (
        JSON.stringify(field(step, STEP_VALUES_FIELDS.revision)) !== revision
      ) {
        throw new Error(
          "the animation module's output table is not the one the " +
            "animation loaded with",
        );
      }
      const row = (
        field(step, STEP_VALUES_FIELDS.values) as { values?: unknown[] } | null
      )?.values;
      byInstant.set(steps[index]!, row ?? []);
    });
    positions.forEach((track, position) => {
      if (!values[track]) {
        return;
      }
      instants.forEach((instant, column) => {
        const value = valueAsNumber(
          byInstant.get(instant)?.[position] as never,
        );
        if (value === undefined) {
          throw new Error(
            `the animation module gave track ${track} no number at ` +
              `${instant} ns`,
          );
        }
        values[track]![column] = value;
      });
    });
    return values;
  } catch (error) {
    // The next sampling starts from a fresh load.
    unload(runtime);
    throw error;
  }
}
