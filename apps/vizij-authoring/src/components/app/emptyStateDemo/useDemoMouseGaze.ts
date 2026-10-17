import { useEffect, useRef, type RefObject } from "react";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";

/** The face standard's gaze target: where the eyes look, in `[0, 1]` across
 * the face (origin top-left, y down), and how firmly they hold it — at
 * weight 0 the face's program looks where it likes. */
const TARGET_X = "standard/vizij/gaze/target/x";
const TARGET_Y = "standard/vizij/gaze/target/y";
const WEIGHT = "standard/vizij/gaze/target/weight";

const POINTER_IDLE_TIMEOUT_MS = 1400;
const RELEASE_SECONDS = 0.4;
// The demo face area is short and wide, so vertical pointer travel is
// amplified to keep the eyes expressive across the full frame height.
const POINTER_Y_SCALE = 3;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * The eyes follow the pointer over the element the returned ref is put on,
 * through the gaze target; when the pointer leaves, lifts, or rests, the
 * target's weight eases back to 0 and the face's program has the eyes again.
 */
export function useDemoMouseGaze(): RefObject<HTMLDivElement | null> {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (!runtime || !target) {
      return;
    }
    let idleTimeout: number | null = null;
    const clearIdleTimeout = () => {
      if (idleTimeout !== null) {
        window.clearTimeout(idleTimeout);
        idleTimeout = null;
      }
    };
    const write = (path: string, value: number, seconds: number) => {
      void animateValue(runtime.path(path), value, {
        duration: seconds,
        easing: "easeInOut",
      }).catch((error: unknown) => {
        console.error("[vizij-authoring] the demo's gaze did not move", error);
      });
    };
    const release = () => {
      clearIdleTimeout();
      write(WEIGHT, 0, RELEASE_SECONDS);
    };
    const follow = (event: PointerEvent) => {
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      const x = clamp01((event.clientX - rect.left) / rect.width);
      const y = clamp01(
        0.5 +
          ((event.clientY - rect.top) / rect.height - 0.5) * POINTER_Y_SCALE,
      );
      write(TARGET_X, x, 0);
      write(TARGET_Y, y, 0);
      write(WEIGHT, 1, 0);
      clearIdleTimeout();
      idleTimeout = window.setTimeout(release, POINTER_IDLE_TIMEOUT_MS);
    };

    target.addEventListener("pointermove", follow);
    target.addEventListener("pointerdown", follow);
    target.addEventListener("pointerleave", release);
    target.addEventListener("pointerup", release);
    return () => {
      target.removeEventListener("pointermove", follow);
      target.removeEventListener("pointerdown", follow);
      target.removeEventListener("pointerleave", release);
      target.removeEventListener("pointerup", release);
      clearIdleTimeout();
    };
  }, [animateValue, runtime]);

  return ref;
}
