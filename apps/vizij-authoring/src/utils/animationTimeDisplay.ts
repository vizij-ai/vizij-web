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

/**
 * Parse a time the user typed, in whichever unit the timeline is showing.
 *
 * Accepts a bare number in the current unit, and tolerates the unit suffix the
 * readout itself prints (`1.5s`, `48f`) so round-tripping a displayed value
 * works. An explicit suffix wins over the current mode — someone who types
 * `48f` in Seconds mode means frame 48.
 *
 * Returns null for anything unparseable, so the caller can leave the field
 * alone rather than snapping the playhead to zero on a typo.
 */
export function parseTimeInput(
  text: string,
  mode: AnimationTimeDisplayMode,
  fps = ANIMATION_TIMELINE_FPS,
): number | null {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length === 0) {
    return null;
  }

  const suffixed = /^(-?\d*\.?\d+)\s*(s|f)?$/.exec(trimmed);
  if (!suffixed) {
    return null;
  }
  const value = Number.parseFloat(suffixed[1]!);
  if (!Number.isFinite(value)) {
    return null;
  }

  const unit = suffixed[2] ?? (mode === "frames" ? "f" : "s");
  const seconds = unit === "f" ? framesToSeconds(value, fps) : value;
  return Math.max(0, seconds);
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
