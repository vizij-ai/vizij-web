import { useEffect, useMemo, useRef, useState } from "react";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import { useMouseGaze } from "./hooks/useMouseGaze";
import { useIdleGazeBehavior } from "./hooks/useIdleGazeBehavior";
import { usePoseHotkeys, POSE_HOTKEY_LAYOUT } from "./hooks/usePoseHotkeys";
import { usePoseWarmup } from "./hooks/usePoseWarmup";
import { useGeminiLive } from "./hooks/useGeminiLive";
import { useVisemeMouth } from "./hooks/useVisemeMouth";
import { useSpeechAnticipation } from "./hooks/useSpeechAnticipation";
import { useVolumeChin } from "./hooks/useVolumeChin";
import { useAgentFaceTools } from "./hooks/useAgentFaceTools";
import { useSpeechGraphTopics } from "./hooks/useSpeechGraphTopics";
import { AudioManager } from "./utils/audioManager";
import { getMicrophoneSupport } from "./utils/microphoneSupport";
import { LiveStatus } from "./phoneme-core";
import { EmotionButtons } from "./components/EmotionButtons";
import {
  hasGraphSpeechControl,
  resolveTutorialSpeechRuntime,
  resolveVisiblePrograms,
  shouldEnableDebugPoseFallback,
} from "./utils/speechRuntime";
import "./styles.css";

const faceAssetUrl = new URL(
  "../../vizij-authoring/public/assets/Quori_Current_Extended.glb",
  import.meta.url,
).href;

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
  const runtime = useVizijRuntime();
  const {
    ready,
    loading,
    error,
    stagePoseNeutral,
    assetBundle,
    faceId: runtimeFaceId,
    playProgram,
  } = runtime;
  const poseConfig = assetBundle.pose?.config ?? null;
  const resolvedFaceId = poseConfig?.faceId ?? runtimeFaceId ?? "face";
  const speechRuntime = useMemo(
    () => resolveTutorialSpeechRuntime(assetBundle),
    [assetBundle],
  );
  const visiblePrograms = useMemo(
    () => resolveVisiblePrograms(assetBundle),
    [assetBundle],
  );
  const graphSpeechControlEnabled = useMemo(
    () =>
      hasGraphSpeechControl({
        assetBundle,
        activeMotionGraphId: speechRuntime.activeMotionGraphId,
        faceId: resolvedFaceId,
        speechPaths: speechRuntime.speechPaths,
      }),
    [assetBundle, resolvedFaceId, speechRuntime],
  );
  const [debugControlsOpen, setDebugControlsOpen] = useState(false);
  const mouseGazeDebugEnabled = debugControlsOpen;
  const { ref: gazeRef, isPointerActive } = useMouseGaze(
    ready && mouseGazeDebugEnabled,
  );
  const debugPoseFallbackEnabled = useMemo(
    () =>
      shouldEnableDebugPoseFallback({
        debugControlsOpen,
        hasGraphSpeechControl: graphSpeechControlEnabled,
      }),
    [debugControlsOpen, graphSpeechControlEnabled],
  );
  const { bindings, setPoseWeight } = usePoseHotkeys(poseConfig, ready, {
    enableHotkeys: debugPoseFallbackEnabled,
  });
  const { tools, handleFunctionCalls, gazeActive } = useAgentFaceTools({
    enabled: ready,
    bindings,
    allowEmotionTools: debugPoseFallbackEnabled,
  });
  useIdleGazeBehavior({
    enabled: ready,
    pointerActive: isPointerActive || gazeActive,
  });
  const { warming } = usePoseWarmup(bindings, ready);

  const [showHints, setShowHints] = useState(true);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const autoPlayTriggeredRef = useRef(false);

  useEffect(() => {
    if (ready) {
      stagePoseNeutral();
    }
  }, [ready, stagePoseNeutral]);

  useEffect(() => {
    autoPlayTriggeredRef.current = false;
  }, [speechRuntime.activeMotionGraphId]);

  useEffect(() => {
    if (!ready || loading || !graphSpeechControlEnabled) {
      return;
    }
    if (autoPlayTriggeredRef.current) {
      return;
    }
    const activeMotionGraphId = speechRuntime.activeMotionGraphId;
    if (!activeMotionGraphId) {
      return;
    }
    const match = visiblePrograms.find(
      (program) => program.id === activeMotionGraphId,
    );
    if (!match) {
      return;
    }
    try {
      playProgram(activeMotionGraphId);
      autoPlayTriggeredRef.current = true;
    } catch {
      // Retry on the next render cycle if registration has not finished yet.
    }
  }, [
    graphSpeechControlEnabled,
    loading,
    playProgram,
    ready,
    speechRuntime.activeMotionGraphId,
    visiblePrograms,
  ]);

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

  const hotkeyHints = useMemo(() => {
    if (!poseConfig || bindings.length === 0) return [];
    return bindings.slice(0, POSE_HOTKEY_LAYOUT.length).map((binding, idx) => ({
      key: POSE_HOTKEY_LAYOUT[idx]?.label ?? `${idx + 1}`,
      label: binding.pose.name ?? `Pose ${idx + 1}`,
    }));
  }, [bindings, poseConfig]);

  const audioManager = useMemo(() => new AudioManager(), []);
  const microphoneSupport = getMicrophoneSupport();
  const microphoneWarningLabel =
    microphoneSupport.code === "insecure-context"
      ? "Mic requires HTTPS or localhost"
      : "Mic unavailable in this browser";
  const [mouthMode, setMouthMode] = useState<"baseline" | "synth" | "align">(
    "synth",
  );
  const [blendWindowMs, setBlendWindowMs] = useState(360);
  const [leadMs, setLeadMs] = useState(450);
  const [voiceName, setVoiceName] = useState("Kore");
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const resolvedSystemInstruction = useMemo(() => {
    const lines = [...SYSTEM_INSTRUCTION];
    if (debugPoseFallbackEnabled) {
      lines.push(...EMOTION_TOOL_INSTRUCTION);
    }
    lines.push(...GAZE_TOOL_INSTRUCTION);
    return lines.join("\n");
  }, [debugPoseFallbackEnabled]);
  const initialUserTurn = useMemo(
    () =>
      debugPoseFallbackEnabled
        ? "Introduce yourself as Q, mention that you are at the 2026 Human Robot Interaction conference in Edinburgh with Chris, Andy, Ross, Tiago, Victor, and Saad, explain Vizij clearly in a friendly sentence or two, trigger a fitting emotion, and invite me to ask about the demo or authoring tooling."
        : "Introduce yourself as Q, mention that you are at the 2026 Human Robot Interaction conference in Edinburgh with Chris, Andy, Ross, Tiago, Victor, and Saad, explain Vizij clearly in a friendly sentence or two, and invite me to ask about the demo or authoring tooling.",
    [debugPoseFallbackEnabled],
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
  useSpeechGraphTopics({
    enabled: ready && graphSpeechControlEnabled,
    ready,
    faceId: resolvedFaceId,
    speechPaths: speechRuntime.speechPaths,
    values: {
      modelSpeaking,
      userSpeaking,
      thinking,
    },
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
              <div className="debug-panel">
                {graphSpeechControlEnabled ? (
                  <button
                    type="button"
                    className="debug-toggle"
                    onClick={() => setDebugControlsOpen((value) => !value)}
                  >
                    {debugControlsOpen
                      ? "Hide debug controls"
                      : "Show debug controls"}
                  </button>
                ) : (
                  <p className="debug-toggle static">Fallback pose controls</p>
                )}
                <p className="debug-note">
                  {graphSpeechControlEnabled
                    ? "Speech state is currently graph-driven through the authored motiongraph."
                    : "Graph speech inputs were not found in the loaded bundle, so manual pose fallback remains active."}
                </p>
                {debugPoseFallbackEnabled ? (
                  <div className="debug-controls">
                    <p className="hint-inline">
                      Mouse gaze, pose hotkeys, and emotion buttons are
                      debug-only fallback controls.
                    </p>
                    <EmotionButtons
                      ready={ready}
                      bindings={bindings}
                      setPoseWeight={setPoseWeight}
                    />
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {debugPoseFallbackEnabled && showHints && (
        <div className="hint">
          {mouseGazeDebugEnabled ? (
            <div>Move the mouse to steer gaze.</div>
          ) : null}
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
      <AgentFaceRuntime />
    </VizijRuntimeProvider>
  );
}
