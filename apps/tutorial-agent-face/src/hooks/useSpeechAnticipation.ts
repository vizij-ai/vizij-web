import { useCallback, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

const EYE_PATHS = {
  leftX: "standard/left_eye/pos/x",
  leftY: "standard/left_eye/pos/y",
  rightX: "standard/right_eye/pos/x",
  rightY: "standard/right_eye/pos/y",
} as const;

const BLINK_PATH = "blink";

export function useSpeechAnticipation(leadMs: number, enabled: boolean) {
  const { animateValue, faceId: runtimeFaceId } = useVizijRuntime();
  const timeouts = useRef<number[]>([]);
  const faceSegment = (runtimeFaceId ?? "face").toLowerCase();

  const clearTimers = () => {
    timeouts.current.forEach((id) => window.clearTimeout(id));
    timeouts.current = [];
  };

  const cueSpeechStart = useCallback(() => {
    if (!enabled) return;
    clearTimers();
    const prefix = `rig/${faceSegment}/`;
    const to = (path: string, value: number, duration: number) =>
      animateValue(`${prefix}${path}`, { float: value }, { duration });

    const total = Math.max(leadMs / 1000, 0.05);
    const downDur = Math.min(total * 0.6, 0.35);
    const upDur = Math.min(total * 0.4, 0.25);

    // Blink quick
    void to(BLINK_PATH, 0.9, 0.06);
    timeouts.current.push(
      window.setTimeout(() => {
        void to(BLINK_PATH, 0, 0.12);
      }, 80),
    );

    // Look down-left
    void to(EYE_PATHS.leftX, -0.35, downDur);
    void to(EYE_PATHS.rightX, -0.32, downDur);
    void to(EYE_PATHS.leftY, -0.25, downDur);
    void to(EYE_PATHS.rightY, -0.28, downDur);

    // Return to center
    timeouts.current.push(
      window.setTimeout(() => {
        void to(EYE_PATHS.leftX, 0, upDur);
        void to(EYE_PATHS.rightX, 0, upDur);
        void to(EYE_PATHS.leftY, 0, upDur);
        void to(EYE_PATHS.rightY, 0, upDur);
      }, downDur * 1000),
    );
  }, [animateValue, enabled, faceSegment, leadMs]);

  return { cueSpeechStart, clearTimers };
}
