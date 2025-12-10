import { useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";

const EYE_PATHS = {
  leftX: "standard/left_eye/pos/x",
  leftY: "standard/left_eye/pos/y",
  rightX: "standard/right_eye/pos/x",
  rightY: "standard/right_eye/pos/y",
} as const;

const EYELID_PATHS = {
  leftUpper: "standard/left_eye_top_eyelid/pos/y",
  rightUpper: "standard/right_eye_top_eyelid/pos/y",
} as const;

const BLINK_PATH = "blink";

const GLANCE_DELAY_RANGE = [1600, 4200] as const;
const BLINK_DELAY_RANGE = [2200, 5200] as const;

type IdleGazeOptions = {
  enabled: boolean;
  pointerActive: boolean;
};

export function useIdleGazeBehavior({
  enabled,
  pointerActive,
}: IdleGazeOptions) {
  const { animateValue, faceId: runtimeFaceId } = useVizijRuntime();
  const faceSegment = (runtimeFaceId ?? "face").toLowerCase();

  const rigPaths = useMemo(() => {
    const prefix = `rig/${faceSegment}/`;
    return {
      eyes: {
        leftX: `${prefix}${EYE_PATHS.leftX}`,
        leftY: `${prefix}${EYE_PATHS.leftY}`,
        rightX: `${prefix}${EYE_PATHS.rightX}`,
        rightY: `${prefix}${EYE_PATHS.rightY}`,
      },
      eyelids: {
        leftUpper: `${prefix}${EYELID_PATHS.leftUpper}`,
        rightUpper: `${prefix}${EYELID_PATHS.rightUpper}`,
      },
      blink: `${prefix}${BLINK_PATH}`,
    };
  }, [faceSegment]);

  useEffect(() => {
    if (!enabled || pointerActive) {
      return;
    }

    let glanceTimer: number | null = null;
    let blinkTimer: number | null = null;
    let blinkResetTimer: number | null = null;

    const clearTimers = () => {
      if (glanceTimer) {
        window.clearTimeout(glanceTimer);
        glanceTimer = null;
      }
      if (blinkTimer) {
        window.clearTimeout(blinkTimer);
        blinkTimer = null;
      }
      if (blinkResetTimer) {
        window.clearTimeout(blinkResetTimer);
        blinkResetTimer = null;
      }
    };

    const scheduleGlance = () => {
      const delay = randomBetween(...GLANCE_DELAY_RANGE);
      glanceTimer = window.setTimeout(() => {
        performGlance();
        scheduleGlance();
      }, delay);
    };

    const scheduleBlink = () => {
      const delay = randomBetween(...BLINK_DELAY_RANGE);
      blinkTimer = window.setTimeout(() => {
        performBlink();
        scheduleBlink();
      }, delay);
    };

    const performGlance = () => {
      const x = randomBetween(-0.45, 0.45);
      const y = randomBetween(-0.2, 0.35);
      const offset = randomBetween(-0.05, 0.05);
      const duration = randomBetween(0.45, 0.8);
      void animateValue(
        rigPaths.eyes.leftX,
        { float: clamp(x - offset) },
        {
          duration,
          easing: "easeInOut",
        },
      );
      void animateValue(
        rigPaths.eyes.rightX,
        { float: clamp(x + offset) },
        {
          duration,
          easing: "easeInOut",
        },
      );
      void animateValue(
        rigPaths.eyes.leftY,
        { float: clamp(y) },
        {
          duration,
          easing: "easeInOut",
        },
      );
      void animateValue(
        rigPaths.eyes.rightY,
        { float: clamp(y + randomBetween(-0.05, 0.05)) },
        {
          duration,
          easing: "easeInOut",
        },
      );
    };

    const animateBlinkStage = (
      value: number,
      duration: number,
      easing: "easeIn" | "easeOut" | "linear" | "easeInOut",
    ) => {
      const config = { float: value };
      void animateValue(rigPaths.blink, config, { duration, easing });
      void animateValue(rigPaths.eyelids.leftUpper, config, {
        duration,
        easing,
      });
      void animateValue(rigPaths.eyelids.rightUpper, config, {
        duration,
        easing,
      });
    };

    const performBlink = () => {
      const closed = randomBetween(0.7, 0.95);
      const closeDuration = 0.08;
      const openDuration = 0.12;
      animateBlinkStage(closed, closeDuration, "easeIn");
      if (blinkResetTimer) {
        window.clearTimeout(blinkResetTimer);
      }
      blinkResetTimer = window.setTimeout(() => {
        animateBlinkStage(0, openDuration, "easeOut");
      }, 100);
    };

    scheduleGlance();
    scheduleBlink();

    return () => {
      clearTimers();
      animateBlinkStage(0, 0.12, "easeOut");
    };
  }, [animateValue, enabled, pointerActive, rigPaths]);
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}
