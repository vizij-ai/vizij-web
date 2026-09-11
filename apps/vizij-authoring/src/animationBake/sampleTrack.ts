import type { AnimationTrackIR } from "../types/animationClipIr";

export { sampleTrackAt } from "../utils/sampleAnimationTrack";

/** Sorted union of every track's key times. */
export function unionKeyTimes(
  tracks: ReadonlyArray<AnimationTrackIR>,
): number[] {
  const seen = new Set<number>();
  for (const track of tracks) {
    for (const keyframe of track.keyframes) {
      seen.add(keyframe.time);
    }
  }
  return [...seen].sort((left, right) => left - right);
}
