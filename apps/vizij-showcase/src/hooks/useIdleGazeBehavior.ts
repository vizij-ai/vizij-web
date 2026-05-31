import { useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  mapNormalizedControlValue,
  mapUnitControlValue,
  resolveFaceControls,
} from "@vizij/studio-support";

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
  const {
    animateValue,
    faceId: runtimeFaceId,
    assetBundle,
    inputConstraints,
  } = useVizijRuntime();
  const controls = useMemo(
    () => resolveFaceControls(assetBundle, runtimeFaceId, inputConstraints),
    [assetBundle, inputConstraints, runtimeFaceId],
  );

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

    const animateSigned = (
      control: (typeof controls.eyes)[keyof typeof controls.eyes],
      value: number,
      duration: number,
      easing: "easeIn" | "easeOut" | "linear" | "easeInOut",
    ) => {
      if (!control) {
        return;
      }
      void animateValue(
        control.path,
        { float: mapNormalizedControlValue(control, value) },
        { duration, easing },
      );
    };

    const animateUnit = (
      control:
        | (typeof controls.eyelids)[keyof typeof controls.eyelids]
        | typeof controls.blink,
      value: number,
      duration: number,
      easing: "easeIn" | "easeOut" | "linear" | "easeInOut",
    ) => {
      if (!control) {
        return;
      }
      void animateValue(
        control.path,
        { float: mapUnitControlValue(control, value) },
        { duration, easing },
      );
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

      animateSigned(
        controls.eyes.leftX,
        clamp(x - offset),
        duration,
        "easeInOut",
      );
      animateSigned(
        controls.eyes.rightX,
        clamp(x + offset),
        duration,
        "easeInOut",
      );
      animateSigned(controls.eyes.leftY, clamp(y), duration, "easeInOut");
      animateSigned(
        controls.eyes.rightY,
        clamp(y + randomBetween(-0.05, 0.05)),
        duration,
        "easeInOut",
      );
    };

    const animateBlinkStage = (
      value: number,
      duration: number,
      easing: "easeIn" | "easeOut" | "linear" | "easeInOut",
    ) => {
      animateUnit(controls.blink, value, duration, easing);
      animateUnit(controls.eyelids.leftUpper, value, duration, easing);
      animateUnit(controls.eyelids.rightUpper, value, duration, easing);
    };

    const performBlink = () => {
      const closed = randomBetween(0.7, 0.95);
      animateBlinkStage(closed, 0.08, "easeIn");
      if (blinkResetTimer) {
        window.clearTimeout(blinkResetTimer);
      }
      blinkResetTimer = window.setTimeout(() => {
        animateBlinkStage(0, 0.12, "easeOut");
      }, 100);
    };

    scheduleGlance();
    scheduleBlink();

    return () => {
      clearTimers();
      animateBlinkStage(0, 0.12, "easeOut");
    };
  }, [animateValue, controls, enabled, pointerActive]);
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min = -1, max = 1) {
  return Math.min(Math.max(value, min), max);
}
