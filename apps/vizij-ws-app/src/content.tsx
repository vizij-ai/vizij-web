import { useEffect, useState, useCallback, useRef } from "react";
import {
  VizijRuntimeProvider,
  VizijRuntimeFace,
  useVizijRuntime,
  type VizijAssetBundle,
} from "@vizij/runtime-react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useWsContext } from "./ws-context";
import {
  getGlbSource,
  createAssetBundleFromSource,
  createAssetBundleFromFile,
} from "./lib/createAssetBundle";
import { useSyncedData } from "./use-synced-data";

function Content() {
  const [assetBundle, setAssetBundle] = useState<VizijAssetBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasCheckedCliSource = useRef(false);

  const { isConnected, port } = useWsContext();

  // Check for CLI source on mount
  useEffect(() => {
    if (hasCheckedCliSource.current) return;
    hasCheckedCliSource.current = true;

    const checkCliSource = async () => {
      try {
        const source = await getGlbSource();
        if (source) {
          console.log("Loading GLB from CLI source:", source);
          const bundle = await createAssetBundleFromSource(source);
          setAssetBundle(bundle);
        }
      } catch (err) {
        console.error("Error loading CLI source:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    checkCliSource();
  }, []);

  // Handle file dialog
  const handleOpenFile = useCallback(async () => {
    const selectedFile = await open({
      multiple: false,
      filters: [
        {
          name: "GLB/GLTF Files",
          extensions: ["gltf", "glb"],
        },
      ],
    });

    if (selectedFile && typeof selectedFile === "string") {
      setLoading(true);
      setError(null);
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
        const bundle = createAssetBundleFromFile(file);
        setAssetBundle(bundle);
      } catch (err) {
        console.error("Error reading file:", err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
  }, []);

  // Reset to file picker
  const handleBack = useCallback(() => {
    setAssetBundle(null);
    setError(null);
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

  // No asset bundle - show file picker
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
            <span className={isConnected ? "text-green-400" : "text-yellow-400"}>
              {isConnected ? "Running" : "Starting..."}
            </span>
          </p>
        </div>
        <p className="mt-4 text-xs text-neutral-600">
          Tip: Use --glb &lt;path-or-url&gt; to load a model on startup
        </p>
      </div>
    );
  }

  // Render with runtime provider
  return (
    <VizijRuntimeProvider
      assetBundle={assetBundle}
      autostart={true}
      driveOrchestrator={true}
    >
      <RuntimeContent onBack={handleBack} />
    </VizijRuntimeProvider>
  );
}

interface RuntimeContentProps {
  onBack: () => void;
}

function RuntimeContent({ onBack }: RuntimeContentProps) {
  const { loading, ready, error } = useVizijRuntime();
  const { isConnected, port } = useWsContext();
  const [bgColor, setBgColor] = useState("#737373");

  // Hook for WebSocket data sync
  useSyncedData();

  // Runtime loading state
  if (loading) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij WS</h1>
        <p className="text-neutral-400">Loading model...</p>
      </div>
    );
  }

  // Runtime error state
  if (error) {
    // Log full error details to console for debugging
    console.error("[vizij-ws] Runtime error:", error);
    console.error("[vizij-ws] Error cause:", error.cause);

    // Provide helpful message based on error phase
    const helpText =
      error.phase === "orchestrator"
        ? "The GLB file may be missing a VIZIJ_bundle extension or the orchestrator failed to initialize."
        : error.phase === "registration"
          ? "The GLB file is missing a rig graph. Make sure the file was exported with VIZIJ bundle data."
          : "Check the browser console (F12) for more details.";

    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij WS</h1>
        <p className="text-red-400">Error: {error.message}</p>
        <p className="text-neutral-400 text-sm max-w-md text-center">{helpText}</p>
        {error.cause && (
          <p className="text-neutral-500 text-xs max-w-md text-center font-mono">
            {String(error.cause)}
          </p>
        )}
        <button
          onClick={onBack}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  // Not ready yet
  if (!ready) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij WS</h1>
        <p className="text-neutral-400">Initializing...</p>
      </div>
    );
  }

  // Render the 3D viewer
  return (
    <div className="h-screen w-full relative" style={{ backgroundColor: bgColor }}>
      <VizijRuntimeFace className="h-full w-full" />

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
          <label className="block text-xs text-neutral-400 mb-1">Background</label>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="w-full h-8 rounded cursor-pointer"
          />
        </div>
        <div className="text-xs text-neutral-400">
          <p>WS: ws://localhost:{port}</p>
          <p className={isConnected ? "text-green-400" : "text-yellow-400"}>
            {isConnected ? "Connected" : "Connecting..."}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Content;
