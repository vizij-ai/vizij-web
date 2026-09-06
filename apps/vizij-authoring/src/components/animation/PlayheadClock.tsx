import {
  useAnimationStore,
  type AnimationTimeDisplayMode,
} from "../../state/animationStore";
import { formatPlaybackClock } from "../../utils/animationTimeDisplay";

/**
 * A running clock, and the only thing allowed to re-render on every frame.
 *
 * The playhead moves 60 times a second. Reading it in `App` to build a label
 * string meant App re-rendered 60 times a second during playback, invalidating
 * the memo chain below it — the target lists, their `meta` strings, every prop
 * derived from them — so that one badge could change. Subscribing here keeps
 * the frame-rate re-render inside this element.
 */
export function PlayheadClock({
  timeDisplayMode,
}: {
  timeDisplayMode: AnimationTimeDisplayMode;
}) {
  const currentTime = useAnimationStore((state) => state.currentTime);
  return <>{formatPlaybackClock(currentTime, timeDisplayMode)}</>;
}
