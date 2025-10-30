import { useEffect, useMemo } from "react";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import {
  faceAssetUrl,
  rigGraphSpec,
  poseRigGraphSpec,
  poseRigConfiguration,
} from "./assets";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { usePoseHotkeys, POSE_HOTKEY_ORDER } from "./hooks/usePoseHotkeys";

import "./styles.css";

const FACE_ID = (poseRigConfiguration.faceId ?? "face").toLowerCase();

const assetBundle: VizijAssetBundle = {
  namespace: "fullscreen-face",
  faceId: FACE_ID,
  glb: {
    kind: "url",
    src: faceAssetUrl,
    aggressiveImport: true,
  },
  rig: {
    id: `rig:${FACE_ID}`,
    spec: rigGraphSpec,
  },
  pose: {
    graph: {
      id: `pose:${FACE_ID}`,
      spec: poseRigGraphSpec,
    },
    config: poseRigConfiguration,
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

function FaceRuntime() {
  const { ready, loading, error, stagePoseNeutral } = useVizijRuntime();
  const gazeRef = useMouseGaze(ready);
  usePoseHotkeys(poseRigConfiguration, ready);

  useEffect(() => {
    if (ready) {
      stagePoseNeutral();
    }
  }, [ready, stagePoseNeutral]);

  const hotkeyHints = useMemo(() => {
    return poseRigConfiguration.poses
      .slice(0, POSE_HOTKEY_ORDER.length)
      .map((pose, idx) => ({
        key: POSE_HOTKEY_ORDER[idx],
        label: pose.name ?? `Pose ${idx + 1}`,
      }));
  }, [poseRigConfiguration.poses]);

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
    <div className="fullscreen">
      <div ref={gazeRef} className="canvas-wrapper">
        <VizijRuntimeFace className="face-canvas" showSafeArea={false} />
      </div>
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
    <VizijRuntimeProvider assetBundle={assetBundle} autostart>
      <FaceRuntime />
    </VizijRuntimeProvider>
  );
}
