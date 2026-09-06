import type { AnimationTimeDisplayMode } from "../state/animationStore";

export const ANIMATION_TIMELINE_FPS = 32;

function clampFiniteSeconds(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
}

export function secondsToFrames(seconds: number, fps = ANIMATION_TIMELINE_FPS) {
  return Math.round(clampFiniteSeconds(seconds) * fps);
}

export function framesToSeconds(frame: number, fps = ANIMATION_TIMELINE_FPS) {
  if (!Number.isFinite(frame)) {
    return 0;
  }
  return Math.max(0, frame) / fps;
}

/**
 * Quantize a time to the frame grid while the timeline is in Frames mode.
 *
 * Applied to *new* edits only — scrubbing, dragging a key, inserting one — and
 * never to keyframes already stored. Without it the display lies: a key at
 * 3.9940s reads as "128f" while another at 3.9633s also reads as "128f", so two
 * keys the UI labels identically sit at different times and a lid silently
 * desyncs from its eye. Rewriting existing keys instead would be lossy for
 * imported clips authored at another rate, which is why this is not a pass over
 * the data.
 */
export function snapTimeToFrame(
  seconds: number,
  mode: AnimationTimeDisplayMode,
  fps = ANIMATION_TIMELINE_FPS,
): number {
  if (mode !== "frames") {
    return seconds;
  }
  if (!Number.isFinite(seconds)) {
    return 0;
  }
  return Math.max(0, Math.round(seconds * fps) / fps);
}

export function formatPlaybackClock(
  seconds: number,
  mode: AnimationTimeDisplayMode,
): string {
  const safe = clampFiniteSeconds(seconds);
  if (mode === "frames") {
    return `${secondsToFrames(safe)}f`;
  }
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const ms = Math.floor((safe % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
}

export function formatKeyframeTime(
  seconds: number,
  mode: AnimationTimeDisplayMode,
): string {
  const safe = clampFiniteSeconds(seconds);
  if (mode === "frames") {
    return `${secondsToFrames(safe)}f`;
  }
  return `${safe.toFixed(3)}s`;
}
