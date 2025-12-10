import { useEffect, useMemo } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import {
  usePoseHotkeys,
  type PoseHotkeyBinding,
} from "../hooks/usePoseHotkeys";
import { useIdleGazeBehavior } from "../hooks/useIdleGazeBehavior";

const EMOTION_DURATION_RANGE: readonly [number, number] = [2000, 3000];
const EMOTION_COUNT_RANGE: readonly [number, number] = [2, 3];
const VIZEME_DURATION_RANGE: readonly [number, number] = [50, 100];
const VIZEME_COUNT_RANGE: readonly [number, number] = [19, 20];
const EMOTION_PAUSE_RANGE: readonly [number, number] = [1200, 2600];
const VIZEME_PAUSE_RANGE: readonly [number, number] = [1000, 4000];

export function HeroPassiveBehavior({ enabled = true }: { enabled?: boolean }) {
  const { ready, assetBundle, animateValue } = useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const { bindings } = usePoseHotkeys(poseConfig, ready && enabled);

  const emotionBindings = useMemo(
    () => filterBindingsByKind(bindings, "emotion"),
    [bindings],
  );
  const vizemeBindings = useMemo(
    () => filterBindingsByKind(bindings, "viseme"),
    [bindings],
  );

  useIdleGazeBehavior({ enabled: ready && enabled, pointerActive: false });
  useAlternatingEmotionVizemeRoutine({
    enabled: ready && enabled,
    emotionBindings,
    vizemeBindings,
    animateValue,
  });

  return null;
}

type PoseKind = "emotion" | "viseme";

function filterBindingsByKind(bindings: PoseHotkeyBinding[], kind: PoseKind) {
  const needles =
    kind === "emotion"
      ? ["emotion", "mood", "affect", "feel"]
      : ["viseme", "phoneme", "lip", "speech"];
  return bindings.filter((binding) => {
    const target = [binding.pose.group, binding.pose.name, binding.pose.id]
      .filter(Boolean)
      .map((value) => value?.toLowerCase() ?? "")
      .join(" ");
    return needles.some((needle) => target.includes(needle));
  });
}

type AlternatorOptions = {
  enabled: boolean;
  emotionBindings: PoseHotkeyBinding[];
  vizemeBindings: PoseHotkeyBinding[];
  animateValue: ReturnType<typeof useVizijRuntime>["animateValue"];
};

function useAlternatingEmotionVizemeRoutine({
  enabled,
  emotionBindings,
  vizemeBindings,
  animateValue,
}: AlternatorOptions) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    const timers = new Set<number>();
    let activeEmotion: PoseHotkeyBinding | null = null;
    let activeVizeme: PoseHotkeyBinding | null = null;

    const clearTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };

    const stopEmotion = (immediate = false) => {
      if (activeEmotion) {
        if (immediate) {
          animateBinding(activeEmotion, 0, 0);
        } else {
          animateBinding(activeEmotion, 0, 0.2);
        }
        activeEmotion = null;
      }
    };

    const stopVizeme = (immediate = false) => {
      if (activeVizeme) {
        animateBinding(activeVizeme, 0, immediate ? 0 : 0.15);
        activeVizeme = null;
      }
    };

    const schedule = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
    };

    const animateBinding = (
      binding: PoseHotkeyBinding,
      value: number,
      duration: number,
    ) => {
      const path = binding.weightPath;
      void animateValue(path, { float: value }, { duration });
    };

    type Stage = "emotion" | "emotionPause" | "vizeme" | "vizemePause";

    const enterStage = (nextStage: Stage) => {
      if (cancelled) {
        return;
      }
      switch (nextStage) {
        case "emotion": {
          stopVizeme();
          if (emotionBindings.length === 0) {
            enterStage("vizeme");
            return;
          }
          const target = randomIntRange(EMOTION_COUNT_RANGE);
          runEmotionCycle(target);
          break;
        }
        case "emotionPause": {
          stopEmotion();
          stopVizeme();
          const pause = randomRangeMs(EMOTION_PAUSE_RANGE);
          schedule(() => enterStage("vizeme"), pause);
          break;
        }
        case "vizeme": {
          stopEmotion();
          if (vizemeBindings.length === 0) {
            enterStage("vizemePause");
            return;
          }
          const target = randomIntRange(VIZEME_COUNT_RANGE);
          runVizemeCycle(target);
          break;
        }
        case "vizemePause": {
          stopEmotion();
          stopVizeme();
          const pause = randomRangeMs(VIZEME_PAUSE_RANGE);
          schedule(() => enterStage("emotion"), pause);
          break;
        }
      }
    };

    const runEmotionCycle = (remaining: number) => {
      if (cancelled) {
        return;
      }
      if (remaining <= 0) {
        stopEmotion();
        enterStage("emotionPause");
        return;
      }
      const next = pickRandomBinding(emotionBindings, activeEmotion);
      if (!next) {
        enterStage("vizeme");
        return;
      }
      if (activeEmotion && activeEmotion.pose.id !== next.pose.id) {
        animateBinding(activeEmotion, 0, 0.25);
      }
      activeEmotion = next;
      animateBinding(next, 1, 0.25);
      const hold = randomRangeMs(EMOTION_DURATION_RANGE);
      schedule(() => {
        if (activeEmotion && activeEmotion.pose.id === next.pose.id) {
          animateBinding(next, 0, 0.25);
          activeEmotion = null;
        }
        runEmotionCycle(remaining - 1);
      }, hold);
    };

    const runVizemeCycle = (remaining: number) => {
      if (cancelled) {
        return;
      }
      if (remaining <= 0) {
        stopVizeme();
        enterStage("vizemePause");
        return;
      }
      const next = pickRandomBinding(vizemeBindings, activeVizeme);
      if (!next) {
        enterStage("vizemePause");
        return;
      }
      if (activeVizeme && activeVizeme.pose.id !== next.pose.id) {
        animateBinding(activeVizeme, 0, 0.12);
      }
      activeVizeme = next;
      const hold = randomRangeMs(VIZEME_DURATION_RANGE);
      animateBinding(next, 1, 0.12);
      schedule(() => {
        if (activeVizeme && activeVizeme.pose.id === next.pose.id) {
          animateBinding(next, 0, 0.12);
          activeVizeme = null;
        }
        runVizemeCycle(remaining - 1);
      }, hold);
    };

    const warmupBindings = [...emotionBindings, ...vizemeBindings];
    if (warmupBindings.length > 0) {
      warmupBindings.forEach((binding, index) => {
        const delay = index * 20;
        schedule(() => {
          if (cancelled) {
            return;
          }
          animateBinding(binding, 1, 0.1);
          schedule(() => {
            animateBinding(binding, 0, 0.1);
          }, 100);
        }, delay);
      });
      const totalWarmup = warmupBindings.length * 20 + 120;
      schedule(() => enterStage("emotion"), totalWarmup);
    } else {
      enterStage("emotion");
    }

    return () => {
      cancelled = true;
      clearTimers();
      stopEmotion(true);
      stopVizeme(true);
    };
  }, [animateValue, emotionBindings, enabled, vizemeBindings]);
}

function randomRangeMs(range: readonly [number, number]) {
  const [min, max] = range;
  return Math.random() * (max - min) + min;
}

function randomIntRange(range: readonly [number, number]) {
  const [min, max] = range;
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.max(
    lower,
    Math.floor(Math.random() * (upper - lower + 1)) + lower,
  );
}

function pickRandomBinding(
  bindings: PoseHotkeyBinding[],
  exclude: PoseHotkeyBinding | null,
) {
  if (bindings.length === 0) {
    return null;
  }
  if (bindings.length === 1) {
    return bindings[0];
  }
  const available = exclude
    ? bindings.filter((binding) => binding.pose.id !== exclude.pose.id)
    : bindings;
  if (available.length === 0) {
    return bindings[0];
  }
  const index = Math.floor(Math.random() * available.length);
  return available[index];
}
