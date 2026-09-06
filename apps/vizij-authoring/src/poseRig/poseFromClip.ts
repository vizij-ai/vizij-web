import { sampleTrackAt } from "../animationBake/sampleTrack";
import type { AnimationClipIR } from "../types/animationClipIr";
import type { StandardInputId } from "./types";

/**
 * A pose taken from a clip at a moment in time.
 *
 * Computed by sampling the clip rather than by reading the runtime, for two
 * reasons. It works while stopped — you can take a pose from a frame without
 * playing to it — and it is a pure function of the clip, so it is testable
 * without a device. The alternative, reading live values, is also currently
 * broken for this purpose: `capturePose` snapshots the pose store's
 * `currentValues`, which only ever changes when an Inputs slider moves, so at
 * a playhead it captures the last slider positions rather than the frame.
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
}

/**
 * Sample `clip` at `time` into pose input values.
 *
 * `knownInputIds` is the catalog to validate against: a clip can carry tracks
 * for inputs the loaded face does not have — a detached track, or a clip
 * authored against a different rig — and those must be reported rather than
 * written into the pose as phantom inputs.
 */
export function poseFromClipAtTime(options: {
  clip: AnimationClipIR;
  /** Seconds, matching `AnimationClipIR`'s own unit. */
  time: number;
  knownInputIds: ReadonlySet<string>;
  /** Current values, used as the base when scope is "all". */
  baseValues?: Readonly<Record<StandardInputId, number>>;
  scope?: PoseCaptureScope;
}): PoseFromClipResult {
  const { clip, time, knownInputIds } = options;
  const scope = options.scope ?? "animated";

  const values: Record<StandardInputId, number> =
    scope === "all" ? { ...(options.baseValues ?? {}) } : {};
  const unresolvedChannels: string[] = [];

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
    values[inputId] = sampleTrackAt(track, time);
  }

  return { values, unresolvedChannels };
}
