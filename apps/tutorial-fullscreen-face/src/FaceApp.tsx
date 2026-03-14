import { useEffect, useMemo, useState, useCallback } from "react";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { usePoseHotkeys, POSE_HOTKEY_LAYOUT } from "./hooks/usePoseHotkeys";
import "./styles.css";

const faceAssetUrl = new URL(
  "../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
  import.meta.url,
).href;

const assetBundle: VizijAssetBundle = {
  namespace: "fullscreen-face",
  glb: {
    kind: "url",
    src: faceAssetUrl,
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

function VizijRuntimeHud() {
  const { loading, error, ready } = useVizijRuntime();
  return (
    <div>
      Status:
      {loading && <div>Loading Face {ready}</div>}
      {error && <div>Error: {error.message}</div>}
      {!ready && <div>Initializing</div>}
    </div>
  );
}

function FaceRuntime() {
  const { ready, loading, error, stagePoseNeutral, assetBundle } =
    useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const gazeRef = useMouseGaze(ready);
  const { bindings } = usePoseHotkeys(poseConfig, ready);
  const [hintsVisible, setHintsVisible] = useState(false);

  const handlePointerMove = useCallback(() => {
    setHintsVisible(true);
  }, []);

  useEffect(() => {
    if (ready) {
      stagePoseNeutral();
    }
  }, [ready, stagePoseNeutral]);

  const hotkeyHints = useMemo(() => {
    if (!poseConfig || bindings.length === 0) {
      return [];
    }
    return bindings.slice(0, POSE_HOTKEY_LAYOUT.length).map((binding, idx) => ({
      key: POSE_HOTKEY_LAYOUT[idx]?.label ?? `${idx + 1}`,
      label: binding.pose.name ?? `Pose ${idx + 1}`,
      semanticKey: binding.semanticKey,
    }));
  }, [bindings, poseConfig]);

  if (loading) {
    return (
      <div className="fullscreen">
        <div className="status">Loading face…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fullscreen">
        <div className="status error hud-error">{error.message}</div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="fullscreen">
        <div className="status">Initialising orchestrator…</div>
      </div>
    );
  }

  return (
    <div className="fullscreen" onPointerMove={handlePointerMove}>
      <div ref={gazeRef} className="canvas-wrapper">
        <VizijRuntimeFace className="face-canvas" showSafeArea={false} />
      </div>
      {hintsVisible && (
        <div className="hint">
          <div>Move the mouse to steer gaze.</div>
          <div>Press the hotkeys to trigger poses:</div>
          {hotkeyHints.length > 0 ? (
            <ul>
              {hotkeyHints.map((entry) => (
                <li key={entry.key}>
                  <kbd>{entry.key}</kbd> → {entry.label}
                </li>
              ))}
            </ul>
          ) : (
            <div>Bundle did not include a pose rig with hotkeys.</div>
          )}
        </div>
      )}
    </div>
  );
}

export function FaceApp() {
  return (
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <VizijRuntimeHud />
      <FaceRuntime />
    </VizijRuntimeProvider>
  );
}
