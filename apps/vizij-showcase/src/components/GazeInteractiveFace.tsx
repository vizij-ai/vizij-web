import { useState, useEffect, useRef, useCallback } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { usePoseHotkeys } from "../hooks/usePoseHotkeys";
import { useMouseGaze } from "../hooks/useMouseGaze";
import { useIdleGazeBehavior } from "../hooks/useIdleGazeBehavior";
import { RuntimeFaceFrame } from "./RuntimeFaceFrame";

export function GazeInteractiveFace({ enabled = true }: { enabled?: boolean }) {
  const { ready, assetBundle } = useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const { bindings, setPoseWeight } = usePoseHotkeys(
    poseConfig,
    ready && enabled,
  );
  const { ref: gazeRef, isPointerActive } = useMouseGaze(ready && enabled);
  useIdleGazeBehavior({
    enabled: ready && enabled,
    pointerActive: isPointerActive,
  });
  const [prompt, setPrompt] = useState("Move your cursor to steer gaze.");
  const resetTimer = useRef<number | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(true);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!overlayVisible) {
      return;
    }
    const node = gazeRef.current;
    if (!node) {
      return;
    }
    const hideOverlay = () => setOverlayVisible(false);
    node.addEventListener("pointermove", hideOverlay, { once: true });
    node.addEventListener("pointerdown", hideOverlay, { once: true });
    return () => {
      node.removeEventListener("pointermove", hideOverlay);
      node.removeEventListener("pointerdown", hideOverlay);
    };
  }, [gazeRef, overlayVisible]);

  const handleClick = useCallback(() => {
    if (!ready) {
      return;
    }
    if (bindings.length === 0) {
      setPrompt("Pose bundle required for click reactions.");
      return;
    }
    setOverlayVisible(false);
    const randomBinding = bindings[Math.floor(Math.random() * bindings.length)];
    bindings.forEach((binding) => {
      if (binding.pose.id === randomBinding.pose.id) {
        return;
      }
      setPoseWeight(binding, 0);
    });
    setPoseWeight(randomBinding, 1);
    setPrompt(
      `Reacting with ${randomBinding.pose.name ?? randomBinding.pose.id}.`,
    );
    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
    }
    resetTimer.current = window.setTimeout(() => {
      setPoseWeight(randomBinding, 0);
      setPrompt("Click anywhere on the face to react.");
      resetTimer.current = null;
    }, 520);
  }, [bindings, ready, setPoseWeight]);

  return (
    <RuntimeFaceFrame
      variant="lg"
      label="Cursor-reactive gaze"
      subtitle="Pointer tracking + pose triggers"
      pointerTargetRef={gazeRef}
      onCanvasClick={handleClick}
      overlay={
        overlayVisible ? (
          <div className="face-overlay">
            <span className="face-overlay__pill">Live demo</span>
            <p>{prompt}</p>
            <p>Mouse movements steer the eyes, clicks trigger random poses.</p>
          </div>
        ) : null
      }
      footer={
        <p className="face-frame__note">
          In this demo we normalise pointer movement into Vizij eye rig paths so
          any cursor, touch, or gaze input can puppeteer attention.
        </p>
      }
    />
  );
}
