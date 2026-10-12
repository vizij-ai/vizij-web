import { useEffect, useState } from "react";
import { profile } from "@vizij/runtime";
import { useAnimateValue, useVizijRuntime } from "@vizij/runtime-react";

const KEYS = [..."1234567890QWERTYUIOPASDFGHJKLZXCVBNM"];

/** How far a held expression goes, and how long it takes to get there. */
const EXPRESSION_WEIGHT = 0.75;
const EXPRESSION_SECONDS = 2;
const VISEME_WEIGHT = 0.75;

export interface FaceHotkey {
  /** The key, as printed on it. */
  key: string;
  label: string;
}

type Binding =
  | { kind: "expression"; path: string; label: string }
  | { kind: "viseme"; shape: string; label: string };

/**
 * Keyboard shortcuts over the face standard, from its profile
 * (`vizij-face`): the expressions first, then the visemes, one per key of
 * `KEYS`. Holding an expression's key fades its weight up, releasing it fades
 * it back; a viseme's key plays the viseme once (`play_viseme`).
 */
export function useFaceHotkeys(enabled: boolean): FaceHotkey[] {
  const { runtime } = useVizijRuntime();
  const { animateValue } = useAnimateValue();
  const [bindings, setBindings] = useState<Binding[]>([]);

  useEffect(() => {
    let current = true;
    void profile("vizij-face").then((face) => {
      if (!current || !face) return;
      const expressions = face.keys
        .filter((key) => key.meta?.tier === "expression")
        .map<Binding>((key) => ({
          kind: "expression",
          path: key.path,
          label: key.path.split("/").at(-1)!,
        }));
      const visemes = face.keys
        .filter((key) => /^standard\/vizij\/viseme\/[^/]+$/.test(key.path))
        .map<Binding>((key) => {
          const shape = key.path.split("/").at(-1)!;
          return { kind: "viseme", shape, label: `viseme ${shape}` };
        });
      setBindings([...expressions, ...visemes].slice(0, KEYS.length));
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !runtime || bindings.length === 0) {
      return;
    }
    const byKey = new Map(
      bindings.map((binding, index) => [KEYS[index], binding]),
    );
    const held = new Set<string>();
    const bindingOf = (event: KeyboardEvent) =>
      byKey.get(event.key.toUpperCase());

    const handleKeyDown = (event: KeyboardEvent) => {
      const binding = bindingOf(event);
      if (!binding || held.has(binding.label)) return;
      held.add(binding.label);
      if (binding.kind === "expression") {
        void animateValue(runtime.path(binding.path), EXPRESSION_WEIGHT, {
          duration: EXPRESSION_SECONDS,
        });
      } else {
        void runtime.invoke("play_viseme", {
          shape: binding.shape,
          weight: VISEME_WEIGHT,
        });
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      const binding = bindingOf(event);
      if (!binding) return;
      held.delete(binding.label);
      if (binding.kind === "expression") {
        void animateValue(runtime.path(binding.path), 0, {
          duration: EXPRESSION_SECONDS,
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [animateValue, bindings, enabled, runtime]);

  return bindings.map((binding, index) => ({
    key: KEYS[index],
    label: binding.label,
  }));
}
