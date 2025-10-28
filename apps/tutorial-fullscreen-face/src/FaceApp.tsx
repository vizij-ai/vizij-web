import { useMemo, useCallback, useRef, useState, useEffect } from "react";
import { OrchestratorProvider, useOrchestrator } from "@vizij/orchestrator-react";
import { VizijContext, useDefaultVizijStore } from "@vizij/render";

import { FaceCanvas, FACE_NAMESPACE } from "./components/FaceCanvas";
import { RenderBridge } from "./orchestrator/RenderBridge";
import { useRigBootstrap } from "./orchestrator/useRigBootstrap";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { usePoseHotkeys, POSE_HOTKEY_ORDER } from "./hooks/usePoseHotkeys";
import { poseRigConfiguration } from "./assets";
import "./styles.css";

const FACE_ID = (poseRigConfiguration.faceId ?? "face").toLowerCase();

function FaceRuntime() {
  const { ready, error, outputPaths, poseConfig, stageNeutralInputs } =
    useRigBootstrap(FACE_ID);
  const gazeRef = useMouseGaze(FACE_ID, ready);
  usePoseHotkeys(FACE_ID, poseConfig, ready);

  const hotkeyHints = useMemo(() => {
    return poseConfig.poses.slice(0, POSE_HOTKEY_ORDER.length).map((pose, idx) => ({
      key: POSE_HOTKEY_ORDER[idx],
      label: pose.name ?? `Pose ${idx + 1}`,
    }));
  }, [poseConfig.poses]);

  return (
    <div className="fullscreen">
      {error ? <div className="status error hud-error">{error}</div> : null}
      <div ref={gazeRef} className="canvas-wrapper">
        <FaceCanvas />
      </div>
      <RenderBridge
        namespace={FACE_NAMESPACE}
        outputPaths={outputPaths}
        enabled={ready}
      />
      <RuntimeControls ready={ready} stageDefaults={stageNeutralInputs} />
      <div className="hint">
        <div>Move the mouse to steer gaze.</div>
        <div>Press the number keys to trigger poses:</div>
        <ul>
          {hotkeyHints.map((entry) => (
            <li key={entry.key}>
              <kbd>{entry.key.replace("Digit", "")}</kbd> → {entry.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FaceApp() {
  return (
    <VizijContext.Provider value={useDefaultVizijStore}>
      <OrchestratorProvider autostart={false}>
        <FaceRuntime />
      </OrchestratorProvider>
    </VizijContext.Provider>
  );
}

function RuntimeControls({
  ready,
  stageDefaults,
}: {
  ready: boolean;
  stageDefaults: (force?: boolean) => void;
}) {
  const { start, stop, running } = useManualLoop(ready, stageDefaults);
  const handleStart = useCallback(() => {
    start();
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  return (
    <div className="runtime-controls">
      <button onClick={handleStart} disabled={!ready || running}>
        Start
      </button>
      <button onClick={handleStop} disabled={!ready || !running}>
        Pause
      </button>
    </div>
  );
}

function useManualLoop(
  enabled: boolean,
  stageDefaults: (force?: boolean) => void,
) {
  const { step } = useOrchestrator();
  const timerRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const intervalMs = 1000 / 20; // 5 FPS baseline

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    if (!enabled || runningRef.current) {
      return;
    }
    runningRef.current = true;
    setRunning(true);
    stageDefaults();
    let last = performance.now();
    timerRef.current = window.setInterval(() => {
      if (!runningRef.current) {
        return;
      }
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      try {
        step(dt);
      } catch (err) {
        console.error("[fullscreen-face] orchestrator: step failed", err);
      }
    }, intervalMs);
  }, [enabled, intervalMs, stageDefaults, step]);

  useEffect(() => {
    if (!enabled && runningRef.current) {
      stop();
    }
    return stop;
  }, [enabled, stop]);

  return { start, stop, running };
}
