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
