import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useShallow } from "zustand/shallow";
import { loadGLTF, useVizijStore, Vizij, Group } from "vizij";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { useSyncedData } from "./use-synced-data";
import { useWsContext } from "./ws-context";

// Default model to load on startup
const DEFAULT_MODEL_PATH = "C:\\repo\\semio\\vizij-web\\apps\\vizij-showcase\\public\\assets\\Hugo_Latest.glb";

interface Bounds {
  center: { x: number; y: number };
  size: { x: number; y: number };
}

function Content() {
  const [rootId, setRootId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rootGroup, setRootGroup] = useState<Group | undefined>(undefined);
  const [safeArea, setSafeArea] = useState<Bounds>({
    center: { x: 0, y: 0 },
    size: { x: 3, y: 2 },
  });
  const [bgColor, setBgColor] = useState<string>("#737373");
  const [loadingDefault, setLoadingDefault] = useState(true);
  const hasAttemptedDefaultLoad = useRef(false);

  const { isConnected, port } = useWsContext();

  const { addWorldElements, updateElementById } = useVizijStore(
    useShallow((state) => ({
      addWorldElements: state.addWorldElements,
      updateElementById: state.updateElementById,
    }))
  );

  // Handle file loading
  const handleFile = useCallback(
    (f: File) => {
      const reader = new FileReader();
      reader.addEventListener(
        "load",
        (event) => {
          const loadHandler = async (): Promise<void> => {
            if (event.target && typeof event.target.result === "string") {
              const [world, animatables] = await loadGLTF(
                event.target.result,
                ["default"],
                false,
                safeArea
              );
              const root = Object.values(world).find(
                (e) => e.type === "group" && e.rootBounds
              );
              addWorldElements(world, animatables, true);
              setRootId((root as Group | undefined)?.id ?? "");
              setRootGroup(root as Group | undefined);
              const bounds = (root as Group | undefined)?.rootBounds;
              if (bounds) {
                setSafeArea(bounds);
              }
              setFile(f);
            }
          };

          void loadHandler()
            .then((result) => {
              console.log("Loading result:", result);
            })
            .catch((error) => {
              console.error("Error loading:", error);
            });
        },
        false
      );
      reader.readAsDataURL(f);
    },
    [addWorldElements, safeArea]
  );

  useEffect(() => {
    if (file) {
      handleFile(file);
    }
  }, [file, handleFile]);

  useEffect(() => {
    if (rootId && rootGroup) {
      updateElementById(rootId, (element) => {
        if (element.type === "group") {
          element.rootBounds = safeArea;
        }
        return element;
      });
    }
  }, [safeArea, rootId, rootGroup, updateElementById]);

  const animatables = useVizijStore(useShallow((state) => state.animatables));

  const nameToIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(animatables).forEach(([id, animatable]) => {
      if (animatable.pub?.output) {
        map[animatable.pub?.output] = id;
      } else if (animatable.name !== undefined && animatable.name !== "") {
        map[animatable.name] = id;
      }
    });
    return map;
  }, [animatables]);

  useSyncedData(nameToIdMap);

  // Auto-load default model on startup
  useEffect(() => {
    if (hasAttemptedDefaultLoad.current) return;
    hasAttemptedDefaultLoad.current = true;

    const loadDefaultModel = async () => {
      try {
        console.log("Loading default model:", DEFAULT_MODEL_PATH);
        const fileContents = await readFile(DEFAULT_MODEL_PATH);
        const fileName = DEFAULT_MODEL_PATH.split("\\").pop() || "model.glb";
        const mimeType = "model/gltf-binary";
        const fileBlob = new Blob([fileContents], { type: mimeType });
        const newFile = new File([fileBlob], fileName, { type: mimeType });
        setFile(newFile);
      } catch (error) {
        console.error("Error loading default model:", error);
      } finally {
        setLoadingDefault(false);
      }
    };

    loadDefaultModel();
  }, []);

  const handleOpenFile = async () => {
    const selectedFile = await open({
      multiple: false,
      filters: [
        {
          name: "Vizij Files",
          extensions: ["gltf", "glb"],
        },
      ],
    });

    if (selectedFile && typeof selectedFile === "string") {
      console.log("found file", selectedFile);
      try {
        const fileContents = await readFile(selectedFile);
        const fileName =
          selectedFile.split("/").pop() ||
          selectedFile.split("\\").pop() ||
          "model.gltf";
        const mimeType = fileName.toLowerCase().endsWith(".glb")
          ? "model/gltf-binary"
          : "model/gltf+json";
        const fileBlob = new Blob([fileContents], { type: mimeType });
        const newFile = new File([fileBlob], fileName, { type: mimeType });
        setFile(newFile);
      } catch (error) {
        console.error("Error reading file:", error);
        setFile(null);
        setRootId(null);
      }
    } else {
      setFile(null);
      setRootId(null);
    }
  };

  if (!rootId) {
    return (
      <div className="h-screen w-full bg-neutral-800 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Vizij WS</h1>
        {loadingDefault ? (
          <p className="text-neutral-400">Loading default model...</p>
        ) : (
          <>
            <p className="text-neutral-400">No model loaded</p>
            <button
              onClick={handleOpenFile}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              Open GLTF/GLB File
            </button>
          </>
        )}
        <div className="mt-8 text-sm text-neutral-500">
          <p>WebSocket server: ws://localhost:{port}</p>
          <p>
            Status:{" "}
            <span className={isConnected ? "text-green-400" : "text-yellow-400"}>
              {isConnected ? "Running" : "Starting..."}
            </span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full relative" style={{ backgroundColor: bgColor }}>
      <Vizij className="h-full w-full" rootId={rootId} />

      {/* Back button */}
      <button
        onClick={() => {
          setRootId(null);
          setFile(null);
          setRootGroup(undefined);
          setSafeArea({
            center: { x: 0, y: 0 },
            size: { x: 3, y: 2 },
          });
        }}
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
