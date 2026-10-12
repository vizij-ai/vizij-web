import { useCallback, useEffect, useRef } from "react";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";
import { useGazeTarget } from "./useGazeTarget";

const BLINK = "standard/vizij/blink";

/**
 * A glance before the agent speaks: a quick blink, the eyes down and to the
 * left through the gaze target, then back to the face's own gaze. `leadMs`
 * is how long before the speech the glance starts.
 */
export function useSpeechAnticipation(leadMs: number, enabled: boolean) {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  const gaze = useGazeTarget();
  const timeouts = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timeouts.current.forEach((id) => window.clearTimeout(id));
    timeouts.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const cueSpeechStart = useCallback(() => {
    if (!enabled || !runtime) return;
    clearTimers();
    const total = Math.max(leadMs / 1000, 0.05);
    const downSeconds = Math.min(total * 0.6, 0.35);
    const upSeconds = Math.min(total * 0.4, 0.25);

    const blink = runtime.path(BLINK);
    void animateValue(blink, 0.9, { duration: 0.06 });
    timeouts.current.push(
      window.setTimeout(() => {
        void animateValue(blink, 0, { duration: 0.12 });
      }, 80),
    );

    void gaze.look(-0.33, -0.27, downSeconds);
    timeouts.current.push(
      window.setTimeout(() => {
        void gaze.release(upSeconds);
      }, downSeconds * 1000),
    );
  }, [animateValue, clearTimers, enabled, gaze, leadMs, runtime]);

  return { cueSpeechStart, clearTimers };
}
