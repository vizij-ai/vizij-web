import { useCallback, useMemo } from "react";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";

/** The face standard's gaze target: where the eyes look, in `[0, 1]` across
 * the face (origin top-left, y down, resting at 0.5), and how firmly they
 * hold it — at weight 0 the face's program looks where it likes, at 1 the
 * eyes hold the target. */
const TARGET_X = "standard/vizij/gaze/target/x";
const TARGET_Y = "standard/vizij/gaze/target/y";
const WEIGHT = "standard/vizij/gaze/target/weight";

const clamp = (value: number) => Math.min(Math.max(value, 0), 1);

/**
 * Steer the eyes through the gaze target: `look(x, y)` — each in `[-1, 1]`,
 * right and up positive — eases the target there and its weight to 1;
 * `release` eases the weight back to 0, handing the eyes to the face's
 * program. The face's program implements the target.
 */
export function useGazeTarget() {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();

  const look = useCallback(
    async (x: number, y: number, seconds: number) => {
      if (!runtime) return;
      const timing = { duration: seconds, easing: "easeInOut" as const };
      await Promise.all([
        animateValue(runtime.path(TARGET_X), clamp((x + 1) / 2), timing),
        animateValue(runtime.path(TARGET_Y), clamp((1 - y) / 2), timing),
        animateValue(runtime.path(WEIGHT), 1, timing),
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
