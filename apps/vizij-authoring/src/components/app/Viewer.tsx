import { VizijRuntimeFace, VizijRuntimeProvider } from "@vizij/runtime-react";
import type { VizijAssetBundle } from "@vizij/runtime-react";
import { useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { Button } from "../ui";
import {
  useGraphRuntime,
  useGraphRuntimeStoreApi,
} from "../../state/RigControllerProvider";
import {
  createRuntimeGraphMutation,
  type RuntimeGraphBridgeState,
} from "./runtimeGraphMutation";

function RuntimeInputBridge() {
  const { setInput, ready } = useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();

  useEffect(() => {
    graphRuntimeStore.setState({
      stageRuntimeInput: ready
        ? (graphPath: string, value: number) => {
            setInput(graphPath, { float: value });
          }
        : undefined,
    });
  }, [graphRuntimeStore, ready, setInput]);

  return null;
}

function RuntimeGraphBridge() {
  const { setGraphBundle } = useVizijRuntime();
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const lastGraphRefsRef = useRef<RuntimeGraphBridgeState | null>(null);

  useEffect(() => {
    const nextState: RuntimeGraphBridgeState = {
      graphSpec,
      poseGraphSpec,
      poseConfig,
    };
    const mutation = createRuntimeGraphMutation(
      lastGraphRefsRef.current,
      nextState,
    );
    if (!mutation) {
      return;
    }
    lastGraphRefsRef.current = nextState;
    if (process.env.NODE_ENV !== "production") {
      console.log("[vizij-runtime][graph-bridge]", {
        mutationClass: mutation.mutationClass,
        hasRig: Boolean(mutation.bundle.rig),
        hasPoseGraph: Boolean(mutation.bundle.pose?.graph),
        hasPoseConfig: Boolean(mutation.bundle.pose?.config),
      });
    }
    setGraphBundle(mutation.bundle, mutation.options);
  }, [graphSpec, poseGraphSpec, poseConfig, setGraphBundle]);

  return null;
}

function RuntimeStatusDebug() {
  const { loading, ready, rootId, error, controllers, outputPaths } =
    useVizijRuntime();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[vizij-runtime][viewer]", {
        loading,
        ready,
        rootId,
        error,
        controllers,
        outputPaths: outputPaths.length,
      });
    }
  }, [loading, ready, rootId, error, controllers, outputPaths.length]);
  return (
    <div className="absolute bottom-2 right-2 z-10 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
      {`runtime: ${ready ? "ready" : loading ? "loading" : "idle"} | rootId: ${
        rootId ?? "null"
      } | graphs: ${controllers.graphs.length}`}
    </div>
  );
}

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  bundle: VizijAssetBundle | null;
  onClearSelection: () => void;
  showSelectionGlow: boolean;
  onImportClick: () => void;
  onLoadQuori: () => void;
  onLoadHugo: () => void;
}

export function Viewer({
  rootId,
  namespace: _namespace,
  bundle,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  onLoadHugo,
}: ViewerProps) {
  const runtimeWarning = useGraphRuntime((state) => state.graphWarning);
  const runtimeError = useGraphRuntime((state) => state.graphError);
  return (
    <main className="h-full w-full relative bg-bg-panel overflow-hidden">
      {(runtimeWarning || runtimeError) && (
        <div className="absolute top-0 left-0 right-0 z-10 flex flex-col gap-2 p-3 pointer-events-none">
          {runtimeError && (
            <div className="rounded-md bg-red-950/80 text-red-200 text-xs font-semibold px-3 py-2 border border-red-800/60 shadow-lg">
              {runtimeError}
            </div>
          )}
          {runtimeWarning && (
            <div className="rounded-md bg-amber-950/70 text-amber-200 text-xs font-semibold px-3 py-2 border border-amber-700/60 shadow-lg">
              {runtimeWarning}
            </div>
          )}
        </div>
      )}
      <div className="h-full w-full">
        {rootId && bundle ? (
          <VizijRuntimeProvider assetBundle={bundle} autostart>
            <RuntimeInputBridge />
            <RuntimeGraphBridge />
            <RuntimeStatusDebug />
            <div
              className="h-full w-full"
              onPointerDown={(event) => {
                if (event.button === 0) {
                  onClearSelection();
                }
              }}
            >
              <VizijRuntimeFace
                className="h-full w-full"
                showSafeArea={false}
                showSelectionGlow={showSelectionGlow}
              />
            </div>
          </VizijRuntimeProvider>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-text-primary gap-6 p-8 text-center animate-in fade-in duration-700">
            <div className="flex flex-col gap-2">
              <p className="text-text-primary font-medium text-lg">
                Empty Scene
              </p>
              <p className="text-sm max-w-xs mx-auto text-text-muted">
                Load a Vizij asset (.glb) to begin rigging and composing your
                scene.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={onImportClick} size="md">
                Import File
              </Button>
              <Button variant="secondary" onClick={onLoadQuori} size="md">
                Load Quori
              </Button>
              <Button variant="secondary" onClick={onLoadHugo} size="md">
                Load Hugo
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
