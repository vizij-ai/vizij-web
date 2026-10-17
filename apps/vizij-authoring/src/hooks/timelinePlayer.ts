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

/** Seconds as the module's time base: whole nanoseconds. */
function nanoseconds(seconds: number): ValueInput {
  return { u64: Math.max(0, Math.round(seconds * 1e9)) };
}

function drive(
  runtime: Runtime,
  commands: ReadonlyArray<
    readonly [method: string, args: Record<string, ValueInput>]
  >,
): Promise<void> {
  const player = timelinePlayer(runtime);
  if (!player) {
    return Promise.resolve();
  }
  // Issued together: the device applies its operations in the order they
  // are issued, on its next steps.
  return Promise.all(
    commands.map(([method, args]) =>
      runtime.invoke(method, { player: { u32: player.player }, ...args }),
    ),
  ).then(
    () => undefined,
    (error: unknown) => {
      console.error(
        `[vizij-authoring] the timeline's ${commands.map(([method]) => method).join(", ")} failed`,
        error,
      );
    },
  );
}

/** Play from `time`, looping or once, at `speed`. */
export function playTimeline(
  runtime: Runtime,
  { time, loop, speed }: { time: number; loop: boolean; speed: number },
): Promise<void> {
  return drive(runtime, [
    ["set_loop", { mode: loop ? "loop" : "once" }],
    ["set_speed", { speed: { f32: speed } }],
    ["seek", { time_ns: nanoseconds(time) }],
    ["play", {}],
  ]);
}

/** Hold the playhead where it is. */
export function pauseTimeline(runtime: Runtime): Promise<void> {
  return drive(runtime, [["pause", {}]]);
}

/** Stop at the clip's first frame, which the face shows while the timeline
 * is active. */
export function stopTimeline(runtime: Runtime): Promise<void> {
  return drive(runtime, [["stop", {}]]);
}

/** Move the playhead to `time`; a stopped timeline is left paused there. */
export function seekTimeline(runtime: Runtime, time: number): Promise<void> {
  return drive(runtime, [["seek", { time_ns: nanoseconds(time) }]]);
}

/** Loop at the clip's end, or hold its last frame. */
export function setTimelineLoop(
  runtime: Runtime,
  loop: boolean,
): Promise<void> {
  return drive(runtime, [["set_loop", { mode: loop ? "loop" : "once" }]]);
}

/** The rate the playhead advances at while playing; paused stays paused. */
export function setTimelineSpeed(
  runtime: Runtime,
  speed: number,
): Promise<void> {
  return drive(runtime, [["set_speed", { speed: { f32: speed } }]]);
}
