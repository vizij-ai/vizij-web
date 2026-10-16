import { useCallback, useState } from "react";
import { VizijCanvas } from "@vizij/render";
import {
  VizijRuntimeFace,
  VizijRuntimeProvider,
  useVizijRuntime,
} from "@vizij/runtime-react";
import { useFaceHotkeys } from "./hooks/useFaceHotkeys";
import "./styles.css";

const faceAssetUrl = new URL(
  "../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
  import.meta.url,
).href;

/** `?autoplay` runs the face's active program from load. */
const autoplay = new URLSearchParams(window.location.search).has("autoplay");

const CANVAS_STYLE = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 1,
} as const;

function FaceRuntime() {
  const { status, error } = useVizijRuntime();
  const ready = status === "ready";
  const hotkeys = useFaceHotkeys(ready);
  const [hintsVisible, setHintsVisible] = useState(false);
  const showHints = useCallback(() => setHintsVisible(true), []);

  return (
    <div className="fullscreen" onPointerMove={showHints}>
      <div className="canvas-wrapper">
        <VizijRuntimeFace className="face-canvas" />
      </div>
      {error && <div className="status error hud-error">{error.message}</div>}
      {ready && hintsVisible && (
        <div className="hint">
          <div>
            Hold a key to show an expression, or press one for a viseme:
          </div>
          <ul>
            {hotkeys.map((hotkey) => (
              <li key={hotkey.key}>
                <kbd>{hotkey.key}</kbd> → {hotkey.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FaceApp() {
  return (
    <>
      {/* Over the page's backdrop, under its hints. */}
      <VizijCanvas style={CANVAS_STYLE} />
      <VizijRuntimeProvider
        glb={faceAssetUrl}
        options={{ program: autoplay ? "auto" : "none" }}
      >
        <FaceRuntime />
      </VizijRuntimeProvider>
    </>
  );
}
