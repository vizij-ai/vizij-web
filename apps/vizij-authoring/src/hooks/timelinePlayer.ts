import {
  ANIMATION_PLAYERS_PATH,
  decodePlayerStates,
  type PlayerState,
  type Runtime,
  type ValueInput,
} from "@vizij/runtime";
import { AUTHORED_TIMELINE_CLIP_ID } from "../types/animationClipIr";

/**
 * The timeline's player on the face's device: the animation module's player
 * named after the timeline's clip id, which plays one instance of the clip
 * `AnimationRuntimeBridge` loads. The functions below drive it through the
 * module's declared functions, by name; each does nothing while the device
 * reports no such player, and reports its own failure.
 */
export function timelinePlayer(runtime: Runtime): PlayerState | null {
  const players = decodePlayerStates(
    runtime.readValues([ANIMATION_PLAYERS_PATH])[ANIMATION_PLAYERS_PATH],
  );
  return (
    players.find((player) => player.name === AUTHORED_TIMELINE_CLIP_ID) ?? null
  );
}

export type TimelineState = "playing" | "paused" | "stopped";

/** What a command asks of the timeline: its playback state, its playhead. */
interface Intent {
  state?: TimelineState;
  time?: number;
}

/**
 * What the commands on their way to each device asked, and how many reports
 * the device has made since the last of them was applied. A command reaches
 * the device a step after it is issued — its signature is read on one step,
 * its call applied on the next — and the device reports the player's state a
 * step after that, so a report can still show what the timeline did before
 * the command.
 */
const commanded = new WeakMap<
  Runtime,
  Intent & { reportsSinceApplied: number }
>();

/** The batches of commands issued to each device and not yet applied. */
const pending = new WeakMap<Runtime, number>();

/** Reports that show a command's effect once it has been applied: the one
 * written by the step that applied it may still predate it. */
const REPORTS_TO_SETTLE = 2;

function normalizedState(state: string): TimelineState {
  return state === "playing" || state === "paused" ? state : "stopped";
}

/**
 * The state and playhead the transport shows for `player`, as the device
 * reports it: what the latest commands asked while they are on their way,
 * so a report that predates them does not undo them on screen; the report
 * itself once they have taken effect.
 */
export function shownTimeline(
  runtime: Runtime,
  player: PlayerState,
): { state: TimelineState; time: number } {
  const reported = { state: normalizedState(player.state), time: player.time };
  const asked = commanded.get(runtime);
  if (!asked) {
    return reported;
  }
  if ((pending.get(runtime) ?? 0) === 0) {
    asked.reportsSinceApplied += 1;
    if (asked.reportsSinceApplied >= REPORTS_TO_SETTLE) {
      commanded.delete(runtime);
      return reported;
    }
  }
  return {
    state: asked.state ?? reported.state,
    time: asked.time ?? reported.time,
  };
}

/** Seconds as the module's time base: whole nanoseconds. */
function nanoseconds(seconds: number): ValueInput {
  return { u64: Math.max(0, Math.round(seconds * 1e9)) };
}

function drive(
  runtime: Runtime,
  intent: Intent,
  commands: ReadonlyArray<
    readonly [method: string, args: Record<string, ValueInput>]
  >,
): Promise<void> {
  const player = timelinePlayer(runtime);
  if (!player) {
    return Promise.resolve();
  }
  // What an earlier batch still on its way asked stands where this one
  // asks nothing of it.
  const inFlight = pending.get(runtime) ?? 0;
  const earlier: Intent = inFlight > 0 ? (commanded.get(runtime) ?? {}) : {};
  commanded.set(runtime, {
    state: intent.state ?? earlier.state,
    time: intent.time ?? earlier.time,
    reportsSinceApplied: 0,
  });
  pending.set(runtime, inFlight + 1);
  const applied = () => {
    const left = (pending.get(runtime) ?? 1) - 1;
    pending.set(runtime, left);
    const asked = commanded.get(runtime);
    if (left === 0 && asked) {
      asked.reportsSinceApplied = 0;
    }
  };
  // Issued together: the device applies its operations in the order they
  // are issued, on its next steps.
  return Promise.all(
    commands.map(([method, args]) =>
      runtime.invoke(method, { player: { u32: player.player }, ...args }),
    ),
  ).then(applied, (error: unknown) => {
    applied();
    console.error(
      `[vizij-authoring] the timeline's ${commands.map(([method]) => method).join(", ")} failed`,
      error,
    );
  });
}

/** Play from `time`, looping or once, at `speed`. */
export function playTimeline(
  runtime: Runtime,
  { time, loop, speed }: { time: number; loop: boolean; speed: number },
): Promise<void> {
  return drive(runtime, { state: "playing", time }, [
    ["set_loop", { mode: loop ? "loop" : "once" }],
    ["set_speed", { speed: { f32: speed } }],
    ["seek", { time_ns: nanoseconds(time) }],
    ["play", {}],
  ]);
}

/** Hold the playhead where it is. */
export function pauseTimeline(runtime: Runtime): Promise<void> {
  return drive(runtime, { state: "paused" }, [["pause", {}]]);
}

/** Stop at the clip's first frame, which the face shows while the timeline
 * is active. */
export function stopTimeline(runtime: Runtime): Promise<void> {
  return drive(runtime, { state: "stopped", time: 0 }, [["stop", {}]]);
}

/** Move the playhead to `time`; a stopped timeline is left paused there. */
export function seekTimeline(runtime: Runtime, time: number): Promise<void> {
  return drive(runtime, { time }, [["seek", { time_ns: nanoseconds(time) }]]);
}

/** Loop at the clip's end, or hold its last frame. */
export function setTimelineLoop(
  runtime: Runtime,
  loop: boolean,
): Promise<void> {
  return drive(runtime, {}, [["set_loop", { mode: loop ? "loop" : "once" }]]);
}

/** The rate the playhead advances at while playing; paused stays paused. */
export function setTimelineSpeed(
  runtime: Runtime,
  speed: number,
): Promise<void> {
  return drive(runtime, {}, [["set_speed", { speed: { f32: speed } }]]);
}
