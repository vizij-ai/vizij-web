import { sampleTrackAt } from "../../utils/sampleAnimationTrack";
import type { AnimationTrack } from "../../state/animationStore";

/**
 * The input values a clip produces at one time.
 *
 * Scrubbing used to move the playhead without moving the face: while playback
 * is stopped the seek only wrote `currentTime` to the store, and nothing drove
 * the rig. Binding the scrub to the animation runtime instead would mean
 * loading and pausing a clip mid-drag and would leave the app's own playback
 * state disagreeing with the runtime's, so the preview writes the rig inputs
 * directly — the same path the Inputs sliders use, evaluated with the same
 * function playback evaluates.
 *
 * Detached tracks and empty tracks contribute nothing: the first has no input
 * on this face, and the second has no curve to read.
 */
export function clipInputValuesAtTime(
  tracks: ReadonlyArray<AnimationTrack>,
  time: number,
): Record<string, number> {
  const values: Record<string, number> = {};
  for (const track of tracks) {
    if (track.detached || track.keyframes.length === 0) {
      continue;
    }
    const inputId = track.variableId?.trim();
    if (!inputId) {
      continue;
    }
    const value = sampleTrackAt(track, time);
    if (Number.isFinite(value)) {
      values[inputId] = value;
    }
  }
  return values;
}

/**
 * The values a scrub should write, or null when it should write nothing.
 *
 * Returns null while playing: the animation runtime is driving the rig then,
 * and a second writer racing it per frame would fight it. Also null when the
 * clip contributes nothing, so a scrub over an empty timeline does not issue
 * an empty batch on every pointer move.
 */
export function scrubPreviewValues(options: {
  tracks: ReadonlyArray<AnimationTrack>;
  time: number;
  playbackState: "playing" | "paused" | "stopped";
}): Record<string, number> | null {
  if (options.playbackState === "playing") {
    return null;
  }
  const values = clipInputValuesAtTime(options.tracks, options.time);
  return Object.keys(values).length > 0 ? values : null;
}
