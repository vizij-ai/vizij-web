import { sampleTrackAt } from "../animationBake/sampleTrack";
import type { AnimationClipIR } from "../types/animationClipIr";
import type { StandardInputId } from "./types";

/**
 * A pose taken from a clip at a moment in time.
 *
 * Computed by sampling the clip rather than by reading the runtime, for two
 * reasons. It works while stopped — you can take a pose from a frame without
 * playing to it — and it is a pure function of the clip, so it is testable
 * without a device. The alternative, reading live values, cannot work for this
 * purpose. `capturePose` snapshots the pose store's `currentValues`, which is
 * a filtered mirror of the binding store's `inputValues` — see the effect in
 * `PoseRigProvider` that assigns `currentValues: filteredCurrent`, keyed on
 * `inputValues`. So the Inputs sliders do reach it, but a playing or scrubbed
 * clip does not: the animation drives the runtime directly and nothing mirrors
 * the runtime back into `inputValues` (the only animation-driven write in
 * `useRigController` is `syncTimelineLocks`, which sets locks, not values).
 * At a playhead `capturePose` therefore records slider state, not the frame.
 */

export type PoseCaptureScope =
  /**
   * Only the inputs this clip animates. The resulting pose composes with
   * everything else, which is almost always what "save this frame" means.
   */
  | "animated"
  /**
   * Every input in `baseValues`, with the clip's animated ones overlaid. The
   * pose then pins everything, including inputs the clip never touched.
   */
  | "all";

export interface PoseFromClipResult {
  values: Record<StandardInputId, number>;
  /** Track channels that resolved to no known input, so nothing is silently lost. */
  unresolvedChannels: string[];
  /**
   * Inputs the clip animates that happened to sit at neutral at this time, so
   * the pose abstains from them. Reported because "12 tracks, 4 values" needs
   * an explanation.
   */
  neutralInputIds: string[];
}

/**
 * Matches `PoseSnapshotService.capture`, which drops at-neutral channels the
 * same way. Kept in sync deliberately: two capture paths that disagree about
 * what "unset" means would produce poses that blend differently.
 */
const NEUTRAL_EPSILON = 1e-8;

/**
 * Sample `clip` at `time` into pose input values.
 *
 * `knownInputIds` is the catalog to validate against: a clip can carry tracks
 * for inputs the loaded face does not have — a detached track, or a clip
 * authored against a different rig — and those must be reported rather than
 * written into the pose as phantom inputs.
 *
 * In `animated` scope an input sitting at neutral is left out rather than
 * written as an explicit neutral. That is lossless when the pose is applied
 * alone — `PoseSnapshotService.apply` starts from the neutral values and
 * overlays the pose, so an absent input resolves to neutral anyway — and it is
 * what makes the pose blend correctly: a declared channel participates in
 * group averaging and drags every other pose toward neutral, whereas an absent
 * one abstains. A clip typically animates far more tracks than any one frame
 * actually displaces, so without this nearly every saved frame would fight the
 * poses it is blended with.
 */
export function poseFromClipAtTime(options: {
  clip: AnimationClipIR;
  /** Seconds, matching `AnimationClipIR`'s own unit. */
  time: number;
  knownInputIds: ReadonlySet<string>;
  /** Current values, used as the base when scope is "all". */
  baseValues?: Readonly<Record<StandardInputId, number>>;
  /**
   * The rig's neutral value per input. Inputs resting here are omitted in
   * `animated` scope. Without it nothing is dropped, since there is then no
   * basis for calling a value neutral.
   */
  neutralValues?: Readonly<Record<StandardInputId, number>>;
  scope?: PoseCaptureScope;
}): PoseFromClipResult {
  const { clip, time, knownInputIds } = options;
  const scope = options.scope ?? "animated";
  const neutralValues = options.neutralValues;

  const values: Record<StandardInputId, number> =
    scope === "all" ? { ...(options.baseValues ?? {}) } : {};
  const unresolvedChannels: string[] = [];
  const neutralInputIds: string[] = [];

  for (const track of clip.tracks) {
    // A detached track's channel no longer exists on the loaded face, so it
    // cannot contribute a value — but it is not an error either, since the
    // keyframes are deliberately retained for re-attachment.
    if (track.detached) {
      continue;
    }
    if (track.keyframes.length === 0) {
      continue;
    }
    const inputId = track.variableId;
    if (!knownInputIds.has(inputId)) {
      unresolvedChannels.push(track.channel);
      continue;
    }
    const value = sampleTrackAt(track, time);

    // `all` scope exists precisely to pin every input, including the ones
    // resting at neutral, so it never drops.
    if (scope === "animated" && neutralValues) {
      const neutral = neutralValues[inputId];
      if (
        neutral !== undefined &&
        Math.abs(value - neutral) < NEUTRAL_EPSILON
      ) {
        neutralInputIds.push(inputId);
        continue;
      }
    }
    values[inputId] = value;
  }

  return { values, unresolvedChannels, neutralInputIds };
}
