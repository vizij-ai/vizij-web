import { useCallback, useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { FEATURED_EXPRESSIONS, useExpressions } from "../hooks/useExpressions";

const WEIGHT = 0.75;
const FADE_SECONDS = 0.2;
const PULSE_MS = 650;

/**
 * Buttons and hotkeys over the face standard's featured expressions: a
 * button pulses its expression's weight, a held key holds it.
 */
export function ExpressionPanel() {
  const { status } = useVizijRuntime();
  const ready = status === "ready";
  const { set, solo } = useExpressions();
  const pulseTimer = useRef<number | null>(null);

  const pulse = useCallback(
    (name: string) => {
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      void solo(name, WEIGHT, FADE_SECONDS);
      pulseTimer.current = window.setTimeout(() => {
        void set(name, 0, FADE_SECONDS);
        pulseTimer.current = null;
      }, PULSE_MS);
    },
    [set, solo],
  );

  useEffect(() => {
    if (!ready) return;
    const held = new Set<string>();
    const nameOf = (event: KeyboardEvent) => {
      const index = Number(event.key) - 1;
      return Number.isInteger(index) ? FEATURED_EXPRESSIONS[index] : undefined;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const name = nameOf(event);
      if (!name || held.has(name)) return;
      held.add(name);
      void solo(name, WEIGHT, FADE_SECONDS);
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
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    };
  }, [ready, set, solo]);

  return (
    <div className="feature-card expression-panel">
      <p className="feature-card__eyebrow">Expressions</p>
      <h3>Tap to emote.</h3>
      <p className="feature-card__description">
        Each button fades one of the face standard's expression weights; the
        face's adaptation maps it onto its own poses. Hotkeys mirror each button
        so you can rehearse and perform live.
      </p>
      <div className="pose-grid">
        {FEATURED_EXPRESSIONS.map((name, index) => (
          <button
            key={name}
            type="button"
            className="pose-button"
            disabled={!ready}
            onClick={() => pulse(name)}
          >
            <span>{name}</span>
            <kbd>{index + 1}</kbd>
          </button>
        ))}
      </div>
    </div>
  );
}
