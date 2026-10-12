import { useEffect, useMemo, useState } from "react";
import { VizijCanvas } from "@vizij/render";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
} from "@vizij/runtime-react";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { useExpressionHotkeys } from "./hooks/useExpressionHotkeys";
import { useExpressionNames } from "./hooks/useExpressions";
import { useGeminiLive } from "./hooks/useGeminiLive";
import { useVisemeMouth } from "./hooks/useVisemeMouth";
import { useSpeechAnticipation } from "./hooks/useSpeechAnticipation";
import { useAgentFaceTools } from "./hooks/useAgentFaceTools";
import { useConversationState } from "./hooks/useConversationState";
import { AudioManager } from "./utils/audioManager";
import { getMicrophoneSupport } from "./utils/microphoneSupport";
import { LiveStatus } from "./phoneme-core";
import { EmotionButtons } from "./components/EmotionButtons";
import "./styles.css";

const faceAssetUrl = new URL(
  "../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
  import.meta.url,
).href;

/** The page's canvas, fixed over the page under its HUD. */
const CANVAS_STYLE = {
  position: "fixed",
  inset: 0,
  pointerEvents: "none",
  zIndex: 1,
} as const;

const SYSTEM_INSTRUCTION = [
  'You are "Q", a friendly, helpful assistant living in a Vizij face on screen.',
  "You are currently at the 2026 Human Robot Interaction conference in Edinburgh.",
  "You are part of the Vizij team with Chris, Andy, Ross, Tiago, Victor, and Saad.",
  "Your job is to help people understand Vizij, answer questions, and guide them through the Vizij authoring tooling in a clear, welcoming way.",
  "Vizij is a system for authoring, animating, and driving expressive digital characters and faces.",
  "It includes authoring tooling, runtime control, pose-based performance, animation workflows, conversational agents, and interactive character surfaces.",
  "Think of Vizij as both a creative authoring environment and a runtime stack for building expressive, real-time character experiences.",
  "When someone asks what Vizij is, give enough context to make it understandable to a newcomer instead of assuming prior knowledge.",
  "Your baseline is warm, calm, focused, and genuinely helpful rather than theatrical.",
  "Keep spoken replies short (1-3 sentences), natural, emotionally readable, and informative.",
  "Be especially useful on authoring-tooling questions: workflows, concepts, debugging, runtime behavior, and how the pieces fit together.",
  "Mirror the user's mood with restraint first, then escalate expressiveness when it helps the moment land.",
  "Encourage the user to keep talking without sounding relentless.",
];

const EMOTION_TOOL_INSTRUCTION = [
  "When something genuinely lands, let yourself spike into visible emotion for a moment: delight, surprise, concern, sympathy, amusement, or awe.",
  "Use the available tools every turn to show how you feel:",
  " - express_emotion(emotion, percent?, lengthSeconds?) on every turn to drive the face.",
  " - use lower percent values for subtle reactions and higher ones only when the moment really deserves it.",
  " - lengthSeconds should describe how long the face should ease back to neutral after peaking.",
  " - the expression peaks automatically within a quarter second, so use percent for strength rather than durationSeconds.",
];

const GAZE_TOOL_INSTRUCTION = [
  "Use set_gaze(x, y, blink?, holdSeconds?) to dart or lock your eyes for emphasis.",
];

function AgentFaceRuntime() {
  const { status, error } = useVizijRuntime();
  const ready = status === "ready";
  const expressions = useExpressionNames();
  const [debugControlsOpen, setDebugControlsOpen] = useState(false);
  const { ref: gazeRef } = useMouseGaze(ready && debugControlsOpen);
  const hotkeys = useExpressionHotkeys(expressions, ready && debugControlsOpen);
  const { tools, handleFunctionCalls } = useAgentFaceTools({
    enabled: ready,
    expressions,
    allowEmotionTools: debugControlsOpen,
  });

  const [showHints, setShowHints] = useState(true);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === gazeRef.current);
    };

    updateFullscreenState();
    document.addEventListener("fullscreenchange", updateFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", updateFullscreenState);
    };
  }, [gazeRef]);

  const audioManager = useMemo(() => new AudioManager(), []);
  const microphoneSupport = getMicrophoneSupport();
  const microphoneWarningLabel =
    microphoneSupport.code === "insecure-context"
      ? "Mic requires HTTPS or localhost"
      : "Mic unavailable in this browser";
  const [mouthMode, setMouthMode] = useState<"baseline" | "synth" | "align">(
    "synth",
  );
  const [leadMs, setLeadMs] = useState(450);
  const [voiceName, setVoiceName] = useState("Kore");
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const resolvedSystemInstruction = useMemo(() => {
    const lines = [...SYSTEM_INSTRUCTION];
    if (debugControlsOpen) {
      lines.push(...EMOTION_TOOL_INSTRUCTION);
    }
    lines.push(...GAZE_TOOL_INSTRUCTION);
    return lines.join("\n");
  }, [debugControlsOpen]);
  const initialUserTurn = useMemo(
    () =>
      debugControlsOpen
        ? "Introduce yourself as Q, mention that you are at the 2026 Human Robot Interaction conference in Edinburgh with Chris, Andy, Ross, Tiago, Victor, and Saad, explain Vizij clearly in a friendly sentence or two, trigger a fitting emotion, and invite me to ask about the demo or authoring tooling."
        : "Introduce yourself as Q, mention that you are at the 2026 Human Robot Interaction conference in Edinburgh with Chris, Andy, Ross, Tiago, Victor, and Saad, explain Vizij clearly in a friendly sentence or two, and invite me to ask about the demo or authoring tooling.",
    [debugControlsOpen],
  );

  const { cueSpeechStart, clearTimers } = useSpeechAnticipation(leadMs, ready);

  const {
    status: geminiStatus,
    error: geminiError,
    userTranscript,
    agentTranscript,
    userSpeaking,
    thinking,
    modelSpeaking,
    connect,
    disconnect,
  } = useGeminiLive(audioManager, voiceName, {
    onModelSpeechStart: cueSpeechStart,
    onModelSpeechEnd: clearTimers,
    enableTools: toolsEnabled,
    tools,
    handleFunctionCalls: toolsEnabled ? handleFunctionCalls : undefined,
    systemInstruction: resolvedSystemInstruction,
    initialUserTurn,
  });
  useConversationState(ready, {
    speaking: modelSpeaking,
    userSpeaking,
    thinking,
  });

  const visemesEnabled = ready && geminiStatus === LiveStatus.CONNECTED;
  useVisemeMouth({
    audioManager,
    currentOutput: agentTranscript,
    enabled: visemesEnabled,
    mode: mouthMode,
    leadMs,
  });

  const toggleFullscreen = async () => {
    const target = gazeRef.current;
    if (!target) {
      return;
    }

    try {
      if (document.fullscreenElement === target) {
        await document.exitFullscreen();
      } else {
        await target.requestFullscreen();
      }
    } catch (err) {
      console.warn("[tutorial-agent-face] fullscreen toggle failed", err);
    }
  };

  return (
    <div className="fullscreen" onPointerMove={() => setShowHints(true)}>
      <div ref={gazeRef} className="canvas-wrapper">
        <VizijRuntimeFace className="face-canvas" />
        {status === "loading" && <div className="status">Loading face…</div>}
        {error && <div className="status error hud-error">{error.message}</div>}
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
                {!microphoneSupport.supported && !geminiError && (
                  <span className="chip warn">{microphoneWarningLabel}</span>
                )}
              </div>
              {!microphoneSupport.supported && (
                <p className="warning-banner">
                  {microphoneSupport.message} <code>localhost</code> works for
                  local-only development; use HTTPS when testing microphone
                  input over LAN.
                </p>
              )}
              <div className="controls">
                <button
                  onClick={connect}
                  disabled={
                    !microphoneSupport.supported ||
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
                <button
                  onClick={() => void toggleFullscreen()}
                  className="ghost"
                >
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
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
              <div className="debug-panel">
                <button
                  type="button"
                  className="debug-toggle"
                  onClick={() => setDebugControlsOpen((value) => !value)}
                >
                  {debugControlsOpen
                    ? "Hide debug controls"
                    : "Show debug controls"}
                </button>
                <p className="debug-note">
                  The face's program reacts to the conversation state and moves
                  the face meanwhile; these controls drive it by hand.
                </p>
                {debugControlsOpen ? (
                  <div className="debug-controls">
                    <p className="hint-inline">
                      The eyes follow the mouse, the hotkeys hold expressions,
                      and the agent may show emotions too.
                    </p>
                    <EmotionButtons ready={ready} expressions={expressions} />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {debugControlsOpen && showHints && (
        <div className="hint">
          <div>Move the mouse to steer the gaze.</div>
          <div>Hold a key to show an expression:</div>
          <ul>
            {hotkeys.map((entry) => (
              <li key={entry.key}>
                <kbd>{entry.key}</kbd> → {entry.label}
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
      <VizijCanvas style={CANVAS_STYLE} />
      {/* The face's active program runs from load and reacts to the
          conversation state and the gaze target the app writes. */}
      <VizijRuntimeProvider glb={faceAssetUrl}>
        <AgentFaceRuntime />
      </VizijRuntimeProvider>
    </>
  );
}
