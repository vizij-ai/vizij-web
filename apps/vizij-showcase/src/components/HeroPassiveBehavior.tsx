import { useEffect } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { HERO_EXPRESSIONS, useExpressions } from "../hooks/useExpressions";

const EMOTION_DURATION_RANGE: readonly [number, number] = [2000, 3000];
const EMOTION_COUNT_RANGE: readonly [number, number] = [2, 3];
const VISEME_DURATION_RANGE: readonly [number, number] = [90, 160];
const VISEME_COUNT_RANGE: readonly [number, number] = [14, 20];
const EMOTION_PAUSE_RANGE: readonly [number, number] = [1200, 2600];
const VISEME_PAUSE_RANGE: readonly [number, number] = [1000, 4000];
const EXPRESSION_WEIGHT = 0.75;
const VISEME_WEIGHT = 0.75;

/** The face standard's visemes, but silence. */
const VISEMES = [
  "PP",
  "FF",
  "TH",
  "DD",
  "kk",
  "CH",
  "SS",
  "nn",
  "RR",
  "aa",
  "E",
  "ih",
  "oh",
  "ou",
] as const;

/**
 * The hero's passive routine, beside the face's own program: a few
 * expressions, a pause, a burst of visemes as if speaking, a pause, again.
 * Expressions fade the face standard's weights; visemes play through the
 * device's `play_viseme`.
 */
export function HeroPassiveBehavior({ enabled = true }: { enabled?: boolean }) {
  const { runtime, status } = useVizijRuntime();
  const { set } = useExpressions();
  const ready = status === "ready";

  useEffect(() => {
    if (!enabled || !ready || !runtime) return;
    let cancelled = false;
    const timers = new Set<number>();
    let activeExpression: string | null = null;

    const schedule = (fn: () => void, delay: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, delay);
      timers.add(id);
    };
    const showExpression = (name: string | null) => {
      if (activeExpression && activeExpression !== name) {
        void set(activeExpression, 0, 0.25);
      }
      if (name) void set(name, EXPRESSION_WEIGHT, 0.25);
      activeExpression = name;
    };
    const playViseme = (shape: string) =>
      void runtime.invoke("play_viseme", { shape, weight: VISEME_WEIGHT });

    const expressions = (remaining: number) => {
      if (remaining <= 0) {
        showExpression(null);
        schedule(
          () => visemes(randomInt(VISEME_COUNT_RANGE)),
          randomMs(EMOTION_PAUSE_RANGE),
        );
        return;
      }
      showExpression(pick(HERO_EXPRESSIONS, activeExpression));
      schedule(
        () => expressions(remaining - 1),
        randomMs(EMOTION_DURATION_RANGE),
      );
    };
    const visemes = (remaining: number) => {
      if (remaining <= 0) {
        playViseme("sil");
        schedule(
          () => expressions(randomInt(EMOTION_COUNT_RANGE)),
          randomMs(VISEME_PAUSE_RANGE),
        );
        return;
      }
      playViseme(pick(VISEMES, null));
      schedule(() => visemes(remaining - 1), randomMs(VISEME_DURATION_RANGE));
    };

    expressions(randomInt(EMOTION_COUNT_RANGE));
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      showExpression(null);
    };
  }, [enabled, ready, runtime, set]);

  return null;
}

function randomMs([min, max]: readonly [number, number]) {
  return Math.random() * (max - min) + min;
}

function randomInt([min, max]: readonly [number, number]) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T extends string>(options: readonly T[], exclude: T | null): T {
  const available = options.filter((option) => option !== exclude);
  const from = available.length > 0 ? available : options;
  return from[Math.floor(Math.random() * from.length)];
}
