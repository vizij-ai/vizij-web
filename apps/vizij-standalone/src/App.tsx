import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import type { VizijSpeechConfig } from "@vizij/render";
import { useWebSocketSync } from "./hooks/useWebSocketSync";
import { useSpeechController } from "./hooks/useSpeechController";

const DEFAULT_PORT = 9000;
const NAMESPACE = "vizij-standalone";

type StandaloneTransportEntry = {
  id: string;
  label: string;
  state: "playing" | "paused" | "stopped";
};

type StandaloneTransportCatalog = {
  animations: StandaloneTransportEntry[];
  programs: StandaloneTransportEntry[];
};

type StopAnimationEventPayload = {
  id: string;
  clearOutputs?: boolean;
};

type StopProgramEventPayload = {
  id: string;
  resetOutputs?: boolean;
};

function App() {
  const [assetBundle, setAssetBundle] = useState<VizijAssetBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState("#737373");
  const [wsConnected, setWsConnected] = useState(false);
  const [port, setPort] = useState(DEFAULT_PORT);
  const hasCheckedCliSource = useRef(false);

  // Load GLB from URL
  const loadFromUrl = useCallback(async (url: string) => {
    setLoading(true);
    setError(null);
    try {
      const bundle: VizijAssetBundle = {
        namespace: NAMESPACE,
        glb: { kind: "url", src: url },
      };
      setAssetBundle(bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load GLB from file
  const loadFromFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const bundle: VizijAssetBundle = {
        namespace: NAMESPACE,
        glb: { kind: "blob", blob: file },
      };
      setAssetBundle(bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle file dialog
  const handleOpenFile = useCallback(async () => {
    const selectedFile = await open({
      multiple: false,
      filters: [{ name: "GLB/GLTF Files", extensions: ["gltf", "glb"] }],
    });

    if (selectedFile && typeof selectedFile === "string") {
      try {
        const fileContents = await readFile(selectedFile);
        const fileName =
          selectedFile.split("/").pop() ||
          selectedFile.split("\\").pop() ||
          "model.glb";
        const mimeType = fileName.toLowerCase().endsWith(".glb")
          ? "model/gltf-binary"
          : "model/gltf+json";
        const file = new File([fileContents], fileName, { type: mimeType });
        await loadFromFile(file);
      } catch (err) {
        console.error("[vizij-standalone] Error reading file:", err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [loadFromFile]);

  // Check for CLI source on mount
  useEffect(() => {
    if (hasCheckedCliSource.current) return;
    hasCheckedCliSource.current = true;

    const checkCliSource = async () => {
      try {
        const source = await invoke<string | null>("get_glb_source");
        if (source) {
          console.log("[vizij-standalone] Loading from CLI source:", source);
          if (source.startsWith("http://") || source.startsWith("https://")) {
            await loadFromUrl(source);
          } else {
            const fileContents = await readFile(source);
            const fileName =
              source.split("/").pop() ||
              source.split("\\").pop() ||
              "model.glb";
            const mimeType = fileName.toLowerCase().endsWith(".glb")
              ? "model/gltf-binary"
              : "model/gltf+json";
            const file = new File([fileContents], fileName, { type: mimeType });
            await loadFromFile(file);
          }
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("[vizij-standalone] Error checking CLI source:", err);
        setLoading(false);
      }
    };

    checkCliSource();
  }, [loadFromFile, loadFromUrl]);

  // Start WebSocket server
  useEffect(() => {
    let mounted = true;

    const startServer = async () => {
      try {
        invoke<number>("get_port")
          .then((resolvedPort) => {
            if (mounted) setPort(resolvedPort);
          })
          .catch(() => {
            if (mounted) setPort(DEFAULT_PORT);
          });

        const running = await invoke<boolean>("is_ws_running");
        if (mounted) setWsConnected(running);

        if (!running) {
          console.log("[vizij-standalone] Starting WebSocket server...");
          await invoke("start_ws_server");
          if (mounted) setWsConnected(true);
        }
      } catch (err) {
        console.error("[vizij-standalone] WebSocket server error:", err);
        if (mounted) setWsConnected(false);
      }
    };

    startServer();
    const interval = setInterval(async () => {
      try {
        const running = await invoke<boolean>("is_ws_running");
        if (mounted) setWsConnected(running);
      } catch {
        if (mounted) setWsConnected(false);
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij Standalone</h1>
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij Standalone</h1>
        <p className="text-red-400">Error: {error}</p>
        <button
          onClick={() => {
            setError(null);
            handleOpenFile();
          }}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Try Another File
        </button>
      </div>
    );
  }

  // No model loaded - show file picker
  if (!assetBundle) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij Standalone</h1>
        <p className="text-neutral-400">No model loaded</p>
        <button
          onClick={handleOpenFile}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Open GLB/GLTF File
        </button>
        <div className="mt-8 text-sm text-neutral-500">
          <p>WebSocket server: ws://localhost:{port}</p>
          <p>
            Status:{" "}
            <span
              className={wsConnected ? "text-green-400" : "text-yellow-400"}
            >
              {wsConnected ? "Running" : "Starting..."}
            </span>
          </p>
        </div>
        <p className="mt-4 text-xs text-neutral-600">
          Tip: Use --glb &lt;path-or-url&gt; to load a model on startup
        </p>
      </div>
    );
  }

  // Render with VizijRuntimeProvider
  return (
    <VizijRuntimeProvider
      assetBundle={assetBundle}
      namespace={NAMESPACE}
      autostart={true}
      driveOrchestrator={true}
    >
      <AppContent
        bgColor={bgColor}
        setBgColor={setBgColor}
        wsConnected={wsConnected}
        port={port}
        onBack={() => setAssetBundle(null)}
      />
    </VizijRuntimeProvider>
  );
}

interface AppContentProps {
  bgColor: string;
  setBgColor: (color: string) => void;
  wsConnected: boolean;
  port: number;
  onBack: () => void;
}

function AppContent({
  bgColor,
  setBgColor,
  wsConnected,
  port,
  onBack,
}: AppContentProps) {
  const runtime = useVizijRuntime();

  // Hook that syncs WebSocket updates using same pattern as useMouseGaze:
  // setInput(`rig/${faceId}/${path}`, { float: value });
  const { inputConstraints, namespace, faceId } = useWebSocketSync();

  // Load CLI/env overrides for speech settings
  const [autoMicOverride, setAutoMicOverride] = useState<boolean | undefined>(
    undefined,
  );
  const [speechModeOverride, setSpeechModeOverride] = useState<
    "echo" | "conversation" | undefined
  >(undefined);
  useEffect(() => {
    invoke<Record<string, string>>("get_speech_keys")
      .then((keys) => {
        if (keys.autoMic !== undefined) {
          setAutoMicOverride(keys.autoMic === "true");
        }
        if (keys.speechMode === "echo" || keys.speechMode === "conversation") {
          setSpeechModeOverride(keys.speechMode);
        }
      })
      .catch(() => {
        // Tauri command not available
      });
  }, []);

  // Extract speech config from the loaded bundle's metadata
  const speechConfig = useMemo<VizijSpeechConfig | null>(() => {
    const meta = runtime.assetBundle?.bundle?.metadata;
    if (!meta || typeof meta !== "object") return null;
    const sc = (meta as Record<string, unknown>).speechConfig;
    if (!sc || typeof sc !== "object") return null;
    return sc as VizijSpeechConfig;
  }, [runtime.assetBundle?.bundle?.metadata]);

  // Extract pose data for viseme/emotion group resolution
  const poses = useMemo(
    () => runtime.assetBundle?.pose?.config?.poses ?? [],
    [runtime.assetBundle?.pose?.config?.poses],
  );

  const poseGroups = useMemo(
    () => runtime.assetBundle?.pose?.config?.poseGroups ?? [],
    [runtime.assetBundle?.pose?.config?.poseGroups],
  );
  const bundledPrograms = useMemo(() => {
    if (
      Array.isArray(runtime.assetBundle?.programs) &&
      runtime.assetBundle.programs.length > 0
    ) {
      return runtime.assetBundle.programs;
    }
    return (runtime.assetBundle?.bundle?.graphs ?? [])
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === "string" &&
          typeof entry.kind === "string" &&
          entry.kind.toLowerCase() === "motiongraph",
      )
      .map((entry) => ({
        id: entry.id,
        label: typeof entry.label === "string" ? entry.label : entry.id,
      }));
  }, [runtime.assetBundle?.bundle?.graphs, runtime.assetBundle?.programs]);

  const [transportCatalog, setTransportCatalog] =
    useState<StandaloneTransportCatalog>({
      animations: [],
      programs: [],
    });

  useEffect(() => {
    const updateCatalog = () => {
      const animations = (runtime.assetBundle?.animations ?? []).map(
        (entry) => {
          const playback = runtime.getAnimationState(entry.id);
          return {
            id: entry.id,
            label:
              (typeof entry.clip?.name === "string" &&
                entry.clip.name.trim()) ||
              entry.id,
            state: playback
              ? playback.playing
                ? "playing"
                : "paused"
              : "stopped",
          } satisfies StandaloneTransportEntry;
        },
      );

      const programs = bundledPrograms.map((entry) => {
        const playback = runtime.getProgramState(entry.id);
        return {
          id: entry.id,
          label:
            (typeof entry.label === "string" && entry.label.trim()) || entry.id,
          state: playback?.state ?? "stopped",
        } satisfies StandaloneTransportEntry;
      });

      setTransportCatalog((previous) => {
        const sameAnimations =
          previous.animations.length === animations.length &&
          previous.animations.every(
            (entry, index) =>
              entry.id === animations[index]?.id &&
              entry.label === animations[index]?.label &&
              entry.state === animations[index]?.state,
          );
        const samePrograms =
          previous.programs.length === programs.length &&
          previous.programs.every(
            (entry, index) =>
              entry.id === programs[index]?.id &&
              entry.label === programs[index]?.label &&
              entry.state === programs[index]?.state,
          );
        return sameAnimations && samePrograms
          ? previous
          : {
              animations,
              programs,
            };
      });
    };

    updateCatalog();
    const intervalId = window.setInterval(updateCatalog, 200);
    return () => window.clearInterval(intervalId);
  }, [
    runtime,
    bundledPrograms,
    runtime.assetBundle?.animations,
    runtime.controllers,
    runtime.ready,
  ]);

  useEffect(() => {
    invoke("set_transport_catalog", { catalog: transportCatalog }).catch(() => {
      // Tauri command not available
    });
  }, [transportCatalog]);

  // Initialize speech controller (no-op when speechConfig is null)
  const speech = useSpeechController({
    speechConfig,
    faceId: faceId || "face",
    poses,
    poseGroups,
    setInput: runtime.setInput,
    animateValue: runtime.animateValue,
    ready: runtime.ready,
    autoMicOverride,
    speechModeOverride,
  });

  // Listen for mute-microphone events from WebSocket methods (via Tauri)
  useEffect(() => {
    const unlisten = listen<boolean>("mute-microphone", (event) => {
      speech.setMicMuted(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [speech.setMicMuted]);

  // Listen for speak events from WebSocket methods (via Tauri)
  useEffect(() => {
    const unlisten = listen<string>("speak", (event) => {
      speech.speak(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [speech.speak]);

  // Listen for interrupt events from WebSocket methods (via Tauri)
  useEffect(() => {
    const unlisten = listen("interrupt-speech", () => {
      speech.interrupt();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [speech.interrupt]);

  useEffect(() => {
    const unlisten = listen<string>("animation-play", (event) => {
      void runtime.playAnimation(event.payload).catch((error) => {
        console.error("[vizij-standalone] Failed to play animation:", error);
      });
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runtime]);

  useEffect(() => {
    const unlisten = listen<string>("animation-pause", (event) => {
      runtime.pauseAnimation(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runtime]);

  useEffect(() => {
    const unlisten = listen<StopAnimationEventPayload>(
      "animation-stop",
      (event) => {
        runtime.stopAnimation(event.payload.id, {
          clearOutputs: event.payload.clearOutputs,
        });
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runtime]);

  useEffect(() => {
    const unlisten = listen<string>("program-play", (event) => {
      try {
        runtime.playProgram(event.payload);
      } catch (error) {
        console.error("[vizij-standalone] Failed to play program:", error);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runtime]);

  useEffect(() => {
    const unlisten = listen<string>("program-pause", (event) => {
      runtime.pauseProgram(event.payload);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runtime]);

  useEffect(() => {
    const unlisten = listen<StopProgramEventPayload>(
      "program-stop",
      (event) => {
        runtime.stopProgram(event.payload.id, {
          resetOutputs: event.payload.resetOutputs,
        });
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runtime]);

  // Sync mic state back to Rust AppState so get_mic_muted returns the correct value
  useEffect(() => {
    invoke("set_mic_muted_state", { muted: !speech.listening }).catch(() => {
      // Tauri command not available
    });
  }, [speech.listening]);

  const constraintCount = Object.keys(inputConstraints).length;
  const transportCount =
    transportCatalog.animations.length + transportCatalog.programs.length;

  return (
    <div
      className="h-screen w-full relative"
      style={{ backgroundColor: bgColor }}
    >
      <VizijRuntimeFace />

      {/* Hidden audio element for TTS playback */}
      <audio
        ref={speech.audioRef}
        style={{ display: "none" }}
        onPlay={speech.handleAudioPlay}
        onPause={speech.handleAudioPause}
        onEnded={speech.handleAudioEnded}
      />

      {/* Back button */}
      <button
        onClick={onBack}
        className="absolute top-2 left-2 px-3 py-2 bg-black/50 hover:bg-black/70 text-white rounded-lg text-sm transition-colors"
      >
        Back
      </button>

      {/* Settings panel */}
      <div className="absolute top-2 right-2 p-3 bg-black/50 rounded-lg text-white text-sm">
        <div className="mb-2">
          <label className="block text-xs text-neutral-400 mb-1">
            Background
          </label>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="w-full h-8 rounded cursor-pointer"
          />
        </div>
        <div className="text-xs text-neutral-400">
          <p>WS: ws://localhost:{port}</p>
          <p className={wsConnected ? "text-green-400" : "text-yellow-400"}>
            {wsConnected ? "Connected" : "Connecting..."}
          </p>
          <p className="mt-1">
            Runtime:{" "}
            <span
              className={
                runtime.ready
                  ? "text-green-400"
                  : runtime.loading
                    ? "text-yellow-400"
                    : "text-red-400"
              }
            >
              {runtime.ready ? "ready" : runtime.loading ? "loading" : "error"}
            </span>
          </p>
          {runtime.ready && (
            <>
              <p>Face ID: {faceId}</p>
              <p>Constraints: {constraintCount}</p>
              <p>Outputs: {runtime.outputPaths.length}</p>
              <p>Transport: {transportCount}</p>
              <p className="mt-1">FPS: {runtime.stepHz?.toFixed(0) ?? "-"}</p>
              {speech.enabled && (
                <p className="mt-1">
                  Speech:{" "}
                  <span
                    className={
                      speech.status === "listening"
                        ? "text-red-400"
                        : speech.status === "thinking"
                          ? "text-yellow-400"
                          : speech.status === "speaking"
                            ? "text-purple-400"
                            : "text-neutral-400"
                    }
                  >
                    {speech.status}
                  </span>
                  {!speech.keysConfigured && (
                    <span className="text-yellow-400"> (keys missing)</span>
                  )}
                </p>
              )}
              <p className="mt-1 text-[10px] text-neutral-500">
                Path: rig/{faceId}/&lt;path&gt;
              </p>
              {transportCatalog.animations.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-2">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Animations
                  </p>
                  <div className="space-y-2">
                    {transportCatalog.animations.map((entry) => (
                      <div
                        key={`anim-${entry.id}`}
                        className="rounded bg-white/5 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-white">
                            {entry.label}
                          </span>
                          <span
                            className={
                              entry.state === "playing"
                                ? "text-[10px] text-green-400"
                                : entry.state === "paused"
                                  ? "text-[10px] text-yellow-400"
                                  : "text-[10px] text-neutral-400"
                            }
                          >
                            {entry.state}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={() => {
                              void runtime
                                .playAnimation(entry.id)
                                .catch((error) => {
                                  console.error(
                                    "[vizij-standalone] Failed to play animation:",
                                    error,
                                  );
                                });
                            }}
                            className="rounded bg-green-600 px-2 py-1 text-[10px] text-white hover:bg-green-700"
                          >
                            Play
                          </button>
                          <button
                            onClick={() => runtime.pauseAnimation(entry.id)}
                            className="rounded bg-yellow-600 px-2 py-1 text-[10px] text-white hover:bg-yellow-700"
                          >
                            Pause
                          </button>
                          <button
                            onClick={() => runtime.stopAnimation(entry.id)}
                            className="rounded bg-red-600 px-2 py-1 text-[10px] text-white hover:bg-red-700"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {transportCatalog.programs.length > 0 && (
                <div className="mt-3 border-t border-white/10 pt-2">
                  <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Programs
                  </p>
                  <div className="space-y-2">
                    {transportCatalog.programs.map((entry) => (
                      <div
                        key={`program-${entry.id}`}
                        className="rounded bg-white/5 p-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[11px] text-white">
                            {entry.label}
                          </span>
                          <span
                            className={
                              entry.state === "playing"
                                ? "text-[10px] text-green-400"
                                : entry.state === "paused"
                                  ? "text-[10px] text-yellow-400"
                                  : "text-[10px] text-neutral-400"
                            }
                          >
                            {entry.state}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-1">
                          <button
                            onClick={() => {
                              try {
                                runtime.playProgram(entry.id);
                              } catch (error) {
                                console.error(
                                  "[vizij-standalone] Failed to play program:",
                                  error,
                                );
                              }
                            }}
                            className="rounded bg-green-600 px-2 py-1 text-[10px] text-white hover:bg-green-700"
                          >
                            Play
                          </button>
                          <button
                            onClick={() => runtime.pauseProgram(entry.id)}
                            className="rounded bg-yellow-600 px-2 py-1 text-[10px] text-white hover:bg-yellow-700"
                          >
                            Pause
                          </button>
                          <button
                            onClick={() => runtime.stopProgram(entry.id)}
                            className="rounded bg-red-600 px-2 py-1 text-[10px] text-white hover:bg-red-700"
                          >
                            Stop
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mic toggle button (only when speech is configured in the bundle) */}
      {speech.enabled && speech.keysConfigured && (
        <button
          onClick={speech.toggleMic}
          className={`absolute bottom-2 right-2 px-4 py-3 rounded-full text-white text-sm font-medium transition-colors ${
            speech.listening
              ? "bg-red-600 hover:bg-red-700"
              : speech.status === "thinking"
                ? "bg-yellow-600"
                : speech.status === "speaking"
                  ? "bg-purple-600"
                  : "bg-blue-600 hover:bg-blue-700"
          }`}
          title={`Speech: ${speech.status}${speech.error ? ` — ${speech.error}` : ""}`}
        >
          {speech.listening
            ? "Stop"
            : speech.status === "thinking"
              ? "Thinking..."
              : speech.status === "speaking"
                ? "Speaking..."
                : "Mic"}
        </button>
      )}

      {/* Debug button */}
      <button
        onClick={() => {
          console.log("[vizij-standalone] Runtime:", runtime);
          console.log("[vizij-standalone] Namespace:", namespace);
          console.log("[vizij-standalone] Constraint count:", constraintCount);
          console.log(
            "[vizij-standalone] Sample constraints:",
            Object.keys(inputConstraints).slice(0, 20),
          );
          console.log(
            "[vizij-standalone] Output paths:",
            runtime.outputPaths.slice(0, 20),
          );
          console.log("[vizij-standalone] Speech config:", speechConfig);
          console.log("[vizij-standalone] Speech status:", speech.status);
        }}
        className="absolute bottom-2 left-2 px-3 py-2 bg-black/50 hover:bg-black/70 text-white rounded-lg text-sm transition-colors"
      >
        Debug
      </button>
    </div>
  );
}

export default App;
