import { ANIMATION_TIMELINE_FPS } from "../utils/animationTimeDisplay";

/**
 * One displayed frame, in seconds.
 *
 * The transport used to default its step to `1/30` while the ruler's frame
 * unit is 32fps, so "step" never advanced exactly one frame of what the clock
 * showed — off by ~2ms per press, and visibly wrong after a few.
 */
export const ANIMATION_STEP_SECONDS = 1 / ANIMATION_TIMELINE_FPS;

/**
 * Where a frame step lands, clamped to the clip.
 *
 * `deltaSeconds` may be negative: stepping backward is a step of `-1/fps`, and
 * the old implementation clamped the delta itself with `Math.max(0, …)`, which
 * silently turned every backward step into a forward one — the reason the
 * control was forward-only.
 */
export function nextStepTime(options: {
  baseTime: number;
  deltaSeconds: number;
  /** Clip duration; `0` or less means unbounded. */
  durationSeconds: number;
}): number {
  const { baseTime, deltaSeconds, durationSeconds } = options;
  const base = Number.isFinite(baseTime) ? baseTime : 0;
  const delta = Number.isFinite(deltaSeconds) ? deltaSeconds : 0;
  const unclamped = base + delta;
  if (durationSeconds > 0) {
    return Math.max(0, Math.min(unclamped, durationSeconds));
  }
  return Math.max(0, unclamped);
}
