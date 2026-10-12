import { useEffect, useMemo } from "react";
import { useShowExpression } from "./useExpressions";

const KEYS = [..."1234567890QWERTYUIOPASDFGHJKLZXCVBNM"];
const WEIGHT = 0.7;
const FADE_SECONDS = 2;

export type ExpressionHotkey = { key: string; label: string };

/**
 * The face standard's expressions on the keyboard, one per key: holding a
 * key fades its expression's weight up, releasing it fades it back.
 */
export function useExpressionHotkeys(
  expressions: string[],
  enabled: boolean,
): ExpressionHotkey[] {
  const { set } = useShowExpression();
  const bound = useMemo(() => expressions.slice(0, KEYS.length), [expressions]);

  useEffect(() => {
    if (!enabled || bound.length === 0) return;
    const byKey = new Map(bound.map((name, index) => [KEYS[index], name]));
    const held = new Set<string>();
    const nameOf = (event: KeyboardEvent) => byKey.get(event.key.toUpperCase());

    const handleKeyDown = (event: KeyboardEvent) => {
      const name = nameOf(event);
      if (!name || held.has(name)) return;
      held.add(name);
      void set(name, WEIGHT, FADE_SECONDS);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const name = nameOf(event);
      if (!name) return;
      held.delete(name);
      void set(name, 0, FADE_SECONDS);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [bound, enabled, set]);

  return bound.map((name, index) => ({ key: KEYS[index], label: name }));
}
