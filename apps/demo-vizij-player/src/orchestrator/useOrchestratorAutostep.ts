import { useEffect, useRef } from "react";
import { useOrchestrator } from "@vizij/orchestrator-react";

const FRAME_TIME = 1 / 60;

/**
 * Steps the orchestrator on `requestAnimationFrame` while `active` is true.
 */
export function useOrchestratorAutostep(active: boolean): void {
  const { step } = useOrchestrator();
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    let cancelled = false;

    const tick = () => {
      if (cancelled) {
        return;
      }
      try {
        step(FRAME_TIME);
      } catch (err) {
        console.error("demo-animating-faces: orchestrator step failed", err);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, step]);
}
