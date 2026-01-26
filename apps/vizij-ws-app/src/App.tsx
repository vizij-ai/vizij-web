import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import { useWebSocketSync } from "./hooks/useWebSocketSync";

const DEFAULT_PORT = 9000;
const NAMESPACE = "vizij-ws";

function App() {
  const [assetBundle, setAssetBundle] = useState<VizijAssetBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState("#737373");
  const [wsConnected, setWsConnected] = useState(false);
  const [port] = useState(DEFAULT_PORT);
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
        console.error("[vizij-ws] Error reading file:", err);
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
          console.log("[vizij-ws] Loading from CLI source:", source);
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
        console.error("[vizij-ws] Error checking CLI source:", err);
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
        const running = await invoke<boolean>("is_ws_running");
        if (mounted) setWsConnected(running);

        if (!running) {
          console.log("[vizij-ws] Starting WebSocket server...");
          await invoke("start_ws_server");
          if (mounted) setWsConnected(true);
        }
      } catch (err) {
        console.error("[vizij-ws] WebSocket server error:", err);
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
        <h1 className="text-2xl font-bold">Vizij WS</h1>
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij WS</h1>
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
        <h1 className="text-2xl font-bold">Vizij WS</h1>
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

  const constraintCount = Object.keys(inputConstraints).length;

  return (
    <div
      className="h-screen w-full relative"
      style={{ backgroundColor: bgColor }}
    >
      <VizijRuntimeFace />

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
              <p className="mt-1">FPS: {runtime.stepHz?.toFixed(0) ?? "-"}</p>
              <p className="mt-1 text-[10px] text-neutral-500">
                Path: rig/{faceId}/&lt;path&gt;
              </p>
            </>
          )}
        </div>
      </div>

      {/* Debug button */}
      <button
        onClick={() => {
          console.log("[vizij-ws] Runtime:", runtime);
          console.log("[vizij-ws] Namespace:", namespace);
          console.log("[vizij-ws] Constraint count:", constraintCount);
          console.log(
            "[vizij-ws] Sample constraints:",
            Object.keys(inputConstraints).slice(0, 20),
          );
          console.log(
            "[vizij-ws] Output paths:",
            runtime.outputPaths.slice(0, 20),
          );
        }}
        className="absolute bottom-2 left-2 px-3 py-2 bg-black/50 hover:bg-black/70 text-white rounded-lg text-sm transition-colors"
      >
        Debug
      </button>
    </div>
  );
}

export default App;
