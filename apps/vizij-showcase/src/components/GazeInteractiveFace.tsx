import { useCallback, useEffect, useRef, useState } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { FEATURED_EXPRESSIONS, useExpressions } from "../hooks/useExpressions";
import { useMouseGaze } from "../hooks/useMouseGaze";
import { RuntimeFaceFrame } from "./RuntimeFaceFrame";

const WEIGHT = 0.75;
const REACTION_MS = 520;

/**
 * The gaze demo: the face's program keeps the face alive and looks where it
 * likes; the pointer takes the eyes through the face standard's gaze target,
 * and a click flashes a random expression.
 */
export function GazeInteractiveFace({ enabled = true }: { enabled?: boolean }) {
  const { status } = useVizijRuntime();
  const ready = status === "ready";
  const { ref: gazeRef } = useMouseGaze(ready && enabled);
  const { set, solo } = useExpressions();
  const [prompt, setPrompt] = useState("Move your cursor to steer gaze.");
  const [overlayVisible, setOverlayVisible] = useState(true);
  const resetTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    },
    [],
  );

  useEffect(() => {
    const node = gazeRef.current;
    if (!overlayVisible || !node) return;
    const hide = () => setOverlayVisible(false);
    node.addEventListener("pointermove", hide, { once: true });
    node.addEventListener("pointerdown", hide, { once: true });
    return () => {
      node.removeEventListener("pointermove", hide);
      node.removeEventListener("pointerdown", hide);
    };
  }, [gazeRef, overlayVisible]);

  const handleClick = useCallback(() => {
    if (!ready) return;
    setOverlayVisible(false);
    const name =
      FEATURED_EXPRESSIONS[
        Math.floor(Math.random() * FEATURED_EXPRESSIONS.length)
      ];
    void solo(name, WEIGHT, 0.15);
    setPrompt(`Reacting with ${name}.`);
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      void set(name, 0, 0.2);
      setPrompt("Click anywhere on the face to react.");
      resetTimer.current = null;
    }, REACTION_MS);
  }, [ready, set, solo]);

  return (
    <RuntimeFaceFrame
      variant="lg"
      label="Cursor-reactive gaze"
      subtitle="Pointer tracking + expression triggers"
      pointerTargetRef={gazeRef}
      onCanvasClick={handleClick}
      overlay={
        overlayVisible ? (
          <div className="face-overlay">
            <span className="face-overlay__pill">Live demo</span>
            <p>{prompt}</p>
            <p>
              Mouse movements steer the eyes, clicks trigger random expressions.
            </p>
          </div>
        ) : null
      }
      footer={
        <p className="face-frame__note">
          The pointer sets the face standard's gaze target, and its weight
          decides how firmly the eyes hold it against the face's own idle gaze —
          so any cursor, touch, or gaze input can puppeteer attention.
        </p>
      }
    />
  );
}
