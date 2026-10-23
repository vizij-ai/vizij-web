import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { profile } from "@vizij/runtime";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";

/** A face standard expression's weight, relative to the face. */
export const expressionKey = (name: string) =>
  `standard/vizij/expression/${name}`;

/** The face standard's expression names, from its profile (`vizij-face`),
 * `neutral` first as the profile lists it. */
export function useExpressionNames(): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let current = true;
    void profile("vizij-face").then((face) => {
      if (!current || !face) return;
      setNames(
        face.keys
          .filter((key) => key.meta?.tier === "expression")
          .map((key) => key.path.split("/").at(-1)!),
      );
    });
    return () => {
      current = false;
    };
  }, []);
  return names;
}

export type ShowExpression = (
  name: string,
  options: { peak: number; attackSeconds: number; releaseSeconds: number },
) => Promise<void>;

/**
 * Show one expression at a time: its weight eases up to `peak`, every other
 * expression shown eases back to 0, then it eases back down over
 * `releaseSeconds`. A newer tween on an expression replaces the running one,
 * so a newer expression takes over from the previous one's release.
 */
export function useShowExpression(): {
  show: ShowExpression;
  set: (name: string, weight: number, seconds: number) => Promise<void>;
} {
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

  const show = useCallback<ShowExpression>(
    async (name, { peak, attackSeconds, releaseSeconds }) => {
      const others = [...shown.current].filter((other) => other !== name);
      await Promise.all([
        set(name, peak, attackSeconds),
        ...others.map((other) => set(other, 0, attackSeconds)),
      ]);
      // Resolves at the peak; the release runs on.
      void set(name, 0, releaseSeconds);
    },
    [set],
  );

  return useMemo(() => ({ show, set }), [set, show]);
}
