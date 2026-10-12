import { useCallback, useMemo, useRef } from "react";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";

/** The face standard's expressions the showcase features. */
export const FEATURED_EXPRESSIONS = [
  "concerned",
  "happy",
  "sad",
  "sleepy",
  "surprised",
] as const;

/** The face standard's expressions the hero cycles through. */
export const HERO_EXPRESSIONS = [
  "happy",
  "surprised",
  "concerned",
  "sad",
  "excited",
] as const;

/** A face standard expression's weight, relative to the face. */
export const expressionKey = (name: string) =>
  `standard/vizij/expression/${name}`;

/**
 * Fade the face standard's expression weights: `set` tweens one, `solo`
 * tweens one to a weight and every other expression set before back to 0.
 */
export function useExpressions() {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  const shown = useRef(new Set<string>());

  const set = useCallback(
    async (name: string, weight: number, seconds: number) => {
      if (!runtime) return;
      if (weight > 0) shown.current.add(name);
      else shown.current.delete(name);
      await animateValue(runtime.path(expressionKey(name)), weight, {
        duration: seconds,
        easing: "easeInOut",
      });
    },
    [animateValue, runtime],
  );

  const solo = useCallback(
    async (name: string, weight: number, seconds: number) => {
      const others = [...shown.current].filter((other) => other !== name);
      await Promise.all([
        set(name, weight, seconds),
        ...others.map((other) => set(other, 0, seconds)),
      ]);
    },
    [set],
  );

  return useMemo(() => ({ set, solo }), [set, solo]);
}
