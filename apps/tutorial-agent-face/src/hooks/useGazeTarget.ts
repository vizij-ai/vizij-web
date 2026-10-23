import { useCallback, useMemo } from "react";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";

/** The face standard's gaze target: where the eyes look, in `[0, 1]` across
 * the face (origin top-left, y down, resting at 0.5), and how firmly they
 * hold it — at weight 0 the face looks where it looks by itself, at 1 the
 * eyes hold the target. */
const TARGET_X = "standard/vizij/gaze/target/x";
const TARGET_Y = "standard/vizij/gaze/target/y";
const WEIGHT = "standard/vizij/gaze/target/weight";

export type GazeTarget = {
  /**
   * Look at `(x, y)` — each in `[-1, 1]`, right and up positive — over
   * `seconds`, raising the target's weight to 1 so the eyes hold it.
   */
  look(x: number, y: number, seconds: number): Promise<void>;
  /** Hand the eyes back to the face: ease the weight to 0 over `seconds`. */
  release(seconds: number): Promise<void>;
};

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * Steer the face's eyes through the face standard's gaze target. The face's
 * program keeps moving the eyes around the target; the app never writes the
 * eye positions themselves.
 */
export function useGazeTarget(): GazeTarget {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();

  const look = useCallback(
    async (x: number, y: number, seconds: number) => {
      if (!runtime) return;
      const duration = { duration: seconds, easing: "easeInOut" as const };
      await Promise.all([
        animateValue(runtime.path(TARGET_X), clamp((x + 1) / 2), duration),
        animateValue(runtime.path(TARGET_Y), clamp((1 - y) / 2), duration),
        animateValue(runtime.path(WEIGHT), 1, duration),
      ]);
    },
    [animateValue, runtime],
  );

  const release = useCallback(
    async (seconds: number) => {
      if (!runtime) return;
      await animateValue(runtime.path(WEIGHT), 0, {
        duration: seconds,
        easing: "easeInOut",
      });
    },
    [animateValue, runtime],
  );

  return useMemo(() => ({ look, release }), [look, release]);
}
