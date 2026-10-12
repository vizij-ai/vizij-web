import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useGazeTarget } from "./useGazeTarget";

const POINTER_IDLE_TIMEOUT_MS = 1400;
const FOLLOW_SECONDS = 0.08;
const RELEASE_SECONDS = 0.6;

function clamp(value: number) {
  return Math.min(Math.max(value, -1), 1);
}

export type MouseGazeHandle = {
  ref: RefObject<HTMLDivElement | null>;
  isPointerActive: boolean;
};

/**
 * The eyes follow the pointer over the returned element through the face
 * standard's gaze target, and go back to the face's own gaze once the
 * pointer leaves or rests.
 */
export function useMouseGaze(enabled: boolean): MouseGazeHandle {
  const gaze = useGazeTarget();
  const ref = useRef<HTMLDivElement>(null);
  const [isPointerActive, setPointerActive] = useState(false);

  useEffect(() => {
    const target = ref.current;
    if (!enabled || !target) return;
    let idleTimer: number | null = null;

    const release = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = null;
      setPointerActive(false);
      void gaze.release(RELEASE_SECONDS);
    };

    const handlePointer = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
      const y = clamp((1 - (event.clientY - rect.top) / rect.height) * 2 - 1);
      setPointerActive(true);
      void gaze.look(x, y, FOLLOW_SECONDS);
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(release, POINTER_IDLE_TIMEOUT_MS);
    };

    target.addEventListener("pointermove", handlePointer, true);
    target.addEventListener("pointerleave", release);
    return () => {
      target.removeEventListener("pointermove", handlePointer, true);
      target.removeEventListener("pointerleave", release);
      if (idleTimer) window.clearTimeout(idleTimer);
      void gaze.release(RELEASE_SECONDS);
    };
  }, [enabled, gaze]);

  return { ref, isPointerActive };
}
