import { useEffect, useMemo, useState } from "react";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { useIdleGazeBehavior } from "./hooks/useIdleGazeBehavior";
import { usePoseHotkeys, POSE_HOTKEY_ORDER } from "./hooks/usePoseHotkeys";
import { usePoseWarmup } from "./hooks/usePoseWarmup";
import { useGeminiLive } from "./hooks/useGeminiLive";
import { useVisemeMouth } from "./hooks/useVisemeMouth";
import { useSpeechAnticipation } from "./hooks/useSpeechAnticipation";
import { useVolumeChin } from "./hooks/useVolumeChin";
import { useAgentFaceTools } from "./hooks/useAgentFaceTools";
import { AudioManager } from "./utils/audioManager";
import { LiveStatus } from "./phoneme-core";
import { EmotionButtons } from "./components/EmotionButtons";
import "./styles.css";

const faceAssetUrl = "/assets/Quori_Live.glb";

const assetBundle: VizijAssetBundle = {
  namespace: "tutorial-agent-face",
  glb: {
    kind: "url",
    src: faceAssetUrl,
    aggressiveImport: true,
  },
  pose: {
    stageNeutralFilter: (_id, path) => !path.includes("/color/"),
  },
};

const SYSTEM_INSTRUCTION = [
  "You are an over-the-top, hyper-expressive conversational partner living in a Vizij face on screen.",
  "React BIG to everything the user says: gasp, gush, groan, and celebrate with dramatic energy.",
  "Keep spoken replies short (1-2 sentences) and playful.",
  "Use the available tools every turn to show how you feel:",
  " - express_emotion(emotion, intensity?, holdSeconds?) to pulse a matching pose.",
  " - set_gaze(x, y, blink?, holdSeconds?) to dart or lock your eyes for emphasis.",
  "Encourage the user to keep talking and mirror their mood with your voice and the face.",
].join("\n");

function AgentFaceRuntime() {
  const { ready, loading, error, stagePoseNeutral, assetBundle } =
    useVizijRuntime();
  const poseConfig = assetBundle.pose?.config ?? null;
  const { ref: gazeRef, isPointerActive } = useMouseGaze(ready);
  const { bindings } = usePoseHotkeys(poseConfig, ready, {
    enableHotkeys: false,
  });
  const { tools, handleFunctionCalls, gazeActive } = useAgentFaceTools({
    enabled: ready,
    bindings,
  });
  useIdleGazeBehavior({
    enabled: ready,
    pointerActive: isPointerActive || gazeActive,
  });
  const { warming } = usePoseWarmup(bindings, ready);

  const [showHints, setShowHints] = useState(true);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  useEffect(() => {
    if (ready) {
      stagePoseNeutral();
    }
  }, [ready, stagePoseNeutral]);

  const hotkeyHints = useMemo(() => {
    if (!poseConfig) return [];
    return poseConfig.poses
      .slice(0, POSE_HOTKEY_ORDER.length)
      .map((pose, idx) => ({
        key: POSE_HOTKEY_ORDER[idx],
        label: pose.name ?? `Pose ${idx + 1}`,
      }));
  }, [poseConfig]);

  const audioManager = useMemo(() => new AudioManager(), []);
  const [mouthMode, setMouthMode] = useState<"baseline" | "synth" | "align">(
    "synth",
  );
  const [blendWindowMs, setBlendWindowMs] = useState(360);
  const [leadMs, setLeadMs] = useState(450);
  const [voiceName, setVoiceName] = useState("Kore");
  const [toolsEnabled, setToolsEnabled] = useState(true);

  const { cueSpeechStart, clearTimers } = useSpeechAnticipation(leadMs, ready);

  const {
    status: geminiStatus,
    error: geminiError,
    userTranscript,
    agentTranscript,
    connect,
    disconnect,
  } = useGeminiLive(audioManager, voiceName, {
    onModelSpeechStart: cueSpeechStart,
    onModelSpeechEnd: clearTimers,
    enableTools: toolsEnabled,
    tools,
    handleFunctionCalls: toolsEnabled ? handleFunctionCalls : undefined,
    systemInstruction: SYSTEM_INSTRUCTION,
    initialUserTurn:
      "Give an overly dramatic hello, fire an emotion that matches your excitement, and invite me to talk.",
  });

  const visemesEnabled = ready && geminiStatus === LiveStatus.CONNECTED;
  useVisemeMouth({
    audioManager,
    currentOutput: agentTranscript,
    enabled: visemesEnabled,
    mode: mouthMode,
    transitionMs: blendWindowMs,
    leadMs,
  });
  useVolumeChin({
    audioManager,
    enabled: visemesEnabled,
    ready,
    smoothMs: 100,
    path: "/outerface001/chin/value",
  });

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
    <div className="fullscreen" onPointerMove={() => setShowHints(true)}>
      <div ref={gazeRef} className="canvas-wrapper">
        <VizijRuntimeFace className="face-canvas" showSafeArea={false} />
        {warming && (
          <div className="status overlay">
            <div>Loading face rig…</div>
            <div className="sub">Priming poses</div>
          </div>
        )}
        <div className={`hud ${controlsCollapsed ? "collapsed" : ""}`}>
          <div className="hud-header">
            <div>
              <p className="eyebrow">Vizij tutorial · Gemini live</p>
              <h1>tutorial-agent-face</h1>
            </div>
            <button
              className="collapse"
              onClick={() => setControlsCollapsed((v) => !v)}
            >
              {controlsCollapsed ? "Show" : "Hide"}
            </button>
          </div>
          {!controlsCollapsed && (
            <>
              <div className="chip-row">
                <span className={`chip ${geminiStatus.toLowerCase()}`}>
                  {geminiStatus}
                </span>
                {geminiError && (
                  <span className="chip error">{geminiError}</span>
                )}
              </div>
              <div className="controls">
                <button
                  onClick={connect}
                  disabled={
                    geminiStatus === LiveStatus.CONNECTED ||
                    geminiStatus === LiveStatus.CONNECTING
                  }
                >
                  {geminiStatus === LiveStatus.CONNECTING
                    ? "Connecting…"
                    : "Connect"}
                </button>
                <button
                  onClick={disconnect}
                  className="ghost"
                  disabled={geminiStatus === LiveStatus.DISCONNECTED}
                >
                  Disconnect
                </button>
              </div>
              <div className="selector">
                <label className="label" htmlFor="voice-select">
                  Voice
                </label>
                <select
                  id="voice-select"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                >
                  <option value="Kore">Kore</option>
                  <option value="Charon">Charon</option>
                  <option value="Aoede">Aoede</option>
                  <option value="Fenrir">Fenrir</option>
                  <option value="Puck">Puck</option>
                </select>
              </div>
              <div className="selector">
                <label className="label" htmlFor="tools-toggle">
                  Function calling
                </label>
                <input
                  id="tools-toggle"
                  type="checkbox"
                  checked={toolsEnabled}
                  onChange={(e) => setToolsEnabled(e.target.checked)}
                />{" "}
                <span className="hint-inline">
                  Let the agent steer gaze/expressions
                </span>
              </div>
              <div className="selector">
                <label className="label" htmlFor="mouth-mode">
                  Mouth source
                </label>
                <select
                  id="mouth-mode"
                  value={mouthMode}
                  onChange={(e) =>
                    setMouthMode(
                      e.target.value as "baseline" | "synth" | "align",
                    )
                  }
                >
                  <option value="synth">Audio + text (synth)</option>
                  <option value="baseline">Text-only baseline</option>
                  <option value="align">Audio + text (align)</option>
                </select>
              </div>
              <div className="slider-row">
                <label className="label" htmlFor="blend-window">
                  Blend window (ms)
                </label>
                <input
                  id="blend-window"
                  type="range"
                  min={10}
                  max={960}
                  step={5}
                  value={blendWindowMs}
                  onChange={(e) => setBlendWindowMs(Number(e.target.value))}
                />
                <p className="slider-value">{blendWindowMs} ms</p>
              </div>
              <div className="slider-row">
                <label className="label" htmlFor="lead-ms">
                  Viseme lead (ms)
                </label>
                <input
                  id="lead-ms"
                  type="range"
                  min={-40}
                  max={520}
                  step={5}
                  value={leadMs}
                  onChange={(e) => setLeadMs(Number(e.target.value))}
                />
                <p className="slider-value">
                  {leadMs >= 0 ? `+${leadMs}` : `${leadMs}`} ms
                </p>
              </div>
              <div className="transcripts">
                <div>
                  <p className="label">You</p>
                  <p className="line">
                    {userTranscript || "(waiting for mic)"}
                  </p>
                </div>
                <div>
                  <p className="label">Agent</p>
                  <p className="line">
                    {agentTranscript || "(model will answer here)"}
                  </p>
                </div>
              </div>
              <p className="hint-inline">
                Hold a short conversation; the mouth will track visemes in real
                time.
              </p>
              <EmotionButtons />
            </>
          )}
        </div>
      </div>

      {showHints && (
        <div className="hint">
          <div>Move the mouse to steer gaze.</div>
          <div>Press the number keys to trigger poses:</div>
          {hotkeyHints.length > 0 ? (
            <ul>
              {hotkeyHints.map((entry) => (
                <li key={entry.key}>
                  <kbd>{entry.key.replace("Digit", "")}</kbd> → {entry.label}
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
      <AgentFaceRuntime />
    </VizijRuntimeProvider>
  );
}
