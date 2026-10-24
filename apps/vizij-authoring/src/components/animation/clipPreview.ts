import { sampleAnimationTracks } from "../../utils/sampleAnimation";
import type { AnimationTrack } from "../../state/animationStore";

/**
 * The input values an animation produces at one time.
 *
 * Scrubbing moves the face, not only the playhead: while playback is stopped
 * nothing else drives the rig, so the preview writes the rig inputs directly
 * — the path the Inputs sliders use — with the values Arora's animation
 * module plays at that time (`sampleAnimationTracks`), read from a player of
 * the sampler's own rather than from the face's playback, whose transport
 * state the app owns.
 *
 * Detached tracks and empty tracks contribute nothing: the first has no input
 * on this face, and the second has no curve to read.
 */
export async function clipInputValuesAtTime(
  tracks: ReadonlyArray<AnimationTrack>,
  time: number,
): Promise<Record<string, number>> {
  const played = tracks.flatMap((track) => {
    const inputId = track.variableId?.trim();
    return !track.detached && track.keyframes.length > 0 && inputId
      ? [{ track, inputId }]
      : [];
  });
  const sampled = await sampleAnimationTracks(
    played.map(({ track }) => track),
    [time],
  );
  const values: Record<string, number> = {};
  played.forEach(({ inputId }, index) => {
    const value = sampled[index]![0]!;
    if (Number.isFinite(value)) {
      values[inputId] = value;
    }
  });
  return values;
}

/**
 * The values a scrub should write, or null when it should write nothing.
 *
 * Null while playing: the animation runtime is driving the rig then, and a
 * second writer racing it per frame would fight it. Also null when the
 * animation contributes nothing, so a scrub over an empty timeline does not
 * issue an empty batch on every pointer move.
 */
export async function scrubPreviewValues(options: {
  tracks: ReadonlyArray<AnimationTrack>;
  time: number;
  playbackState: "playing" | "paused" | "stopped";
}): Promise<Record<string, number> | null> {
  if (options.playbackState === "playing") {
    return null;
  }
  const values = await clipInputValuesAtTime(options.tracks, options.time);
  return Object.keys(values).length > 0 ? values : null;
}
