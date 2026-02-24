import { VizijRuntimeFace, VizijRuntimeProvider } from "@vizij/runtime-react";
import type { VizijAssetBundle } from "@vizij/runtime-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import { Button } from "../ui";
import {
  useBindingAuthoring,
  useGraphRuntime,
  useGraphRuntimeStoreApi,
} from "../../state/RigControllerProvider";
import { isPoseControlInputPath } from "../../poseRig/utils";

type RuntimeRenderableSelectionType =
  | "group"
  | "shape"
  | "ellipse"
  | "rectangle";

function selectionTypeFromRenderableType(
  type: string | undefined,
): RuntimeRenderableSelectionType {
  if (type === "group" || type === "ellipse" || type === "rectangle") {
    return type;
  }
  return "shape";
}

interface RuntimeSelectionBridgeProps {
  selectedSceneId: string | null;
  onSelectScene: (id: string) => void;
}

function RuntimeSelectionBridge({
  selectedSceneId,
  onSelectScene,
}: RuntimeSelectionBridgeProps) {
  const { namespace } = useVizijRuntime();
  const setRuntimeStoreState = useVizijStoreSetter();
  const runtimeSelectedId = useVizijStore(
    (state) => state.elementSelection[0]?.id ?? null,
  );
  const pendingRuntimeSelectionRef = useRef<string | "__clear__" | null>(null);
  const forwardedRuntimeSelectionRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runtimeSelectedId) {
      if (pendingRuntimeSelectionRef.current === "__clear__") {
        pendingRuntimeSelectionRef.current = null;
      }
      forwardedRuntimeSelectionRef.current = null;
      return;
    }
    if (runtimeSelectedId === selectedSceneId) {
      forwardedRuntimeSelectionRef.current = null;
      return;
    }
    if (forwardedRuntimeSelectionRef.current === runtimeSelectedId) {
      return;
    }
    const pendingRuntimeSelection = pendingRuntimeSelectionRef.current;
    if (pendingRuntimeSelection === "__clear__" && runtimeSelectedId === null) {
      pendingRuntimeSelectionRef.current = null;
      return;
    }
    if (
      pendingRuntimeSelection &&
      pendingRuntimeSelection !== "__clear__" &&
      pendingRuntimeSelection === runtimeSelectedId
    ) {
      pendingRuntimeSelectionRef.current = null;
      return;
    }
    forwardedRuntimeSelectionRef.current = runtimeSelectedId;
    onSelectScene(runtimeSelectedId);
  }, [onSelectScene, runtimeSelectedId, selectedSceneId]);

  useEffect(() => {
    if (selectedSceneId === runtimeSelectedId) {
      return;
    }
    setRuntimeStoreState((state) => {
      if (!selectedSceneId) {
        if ((state.elementSelection?.length ?? 0) === 0) {
          return state;
        }
        pendingRuntimeSelectionRef.current = "__clear__";
        return { ...state, elementSelection: [] };
      }

      const renderable = state.world[selectedSceneId];
      if (!renderable) {
        return state;
      }

      const nextType = selectionTypeFromRenderableType(renderable.type);
      const existing = state.elementSelection[0];
      if (
        existing &&
        existing.id === selectedSceneId &&
        existing.type === nextType &&
        existing.namespace === namespace
      ) {
        return state;
      }

      pendingRuntimeSelectionRef.current = selectedSceneId;
      return {
        ...state,
        elementSelection: [
          {
            id: selectedSceneId,
            type: nextType,
            namespace,
          },
        ],
      };
    });
  }, [namespace, runtimeSelectedId, selectedSceneId, setRuntimeStoreState]);

  return null;
}

function RuntimeInputBridge() {
  const { setInput, ready, loading, rootId, outputPaths } = useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();

  useEffect(() => {
    graphRuntimeStore.setState({
      stageRuntimeInput: ready
        ? (graphPath: string, value: number) => {
            setInput(graphPath, { float: value });
          }
        : undefined,
      runtimeViewReady: ready,
      runtimeViewLoading: loading,
      runtimeViewRootId: rootId ?? null,
      runtimeViewOutputCount: outputPaths.length,
    });
  }, [graphRuntimeStore, loading, outputPaths.length, ready, rootId, setInput]);

  useEffect(
    () => () => {
      graphRuntimeStore.setState({
        stageRuntimeInput: undefined,
        runtimeViewReady: false,
        runtimeViewLoading: false,
        runtimeViewRootId: null,
        runtimeViewGraphCount: 0,
        runtimeViewOutputCount: 0,
      });
    },
    [graphRuntimeStore],
  );

  return null;
}

function RuntimeGraphBridge() {
  const { setGraphBundle } = useVizijRuntime();
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const lastGraphRefsRef = useRef<{
    graphSpec: unknown;
    poseGraphSpec: unknown;
    poseConfig: unknown;
  } | null>(null);

  useEffect(() => {
    const previous = lastGraphRefsRef.current;
    if (
      previous &&
      previous.graphSpec === graphSpec &&
      previous.poseGraphSpec === poseGraphSpec &&
      previous.poseConfig === poseConfig
    ) {
      return;
    }
    lastGraphRefsRef.current = {
      graphSpec,
      poseGraphSpec,
      poseConfig,
    };

    const shouldIncludePosePayload =
      Boolean(graphSpec) || Boolean(poseGraphSpec) || Boolean(poseConfig);
    const posePayload = shouldIncludePosePayload
      ? {
          graph: poseGraphSpec
            ? { id: "pose", spec: poseGraphSpec }
            : undefined,
          config: poseConfig ?? undefined,
        }
      : undefined;
    const payload = {
      rig: graphSpec ? { id: "rig", spec: graphSpec } : undefined,
      pose: posePayload,
    };
    if (process.env.NODE_ENV !== "production") {
      console.log("[vizij-runtime][graph-bridge]", {
        hasRig: Boolean(payload.rig),
        hasPoseGraph: Boolean(payload.pose?.graph),
        hasPoseConfig: Boolean(payload.pose?.config),
      });
    }
    setGraphBundle(payload, { tier: "graphs" });
  }, [graphSpec, poseGraphSpec, poseConfig, setGraphBundle]);

  return null;
}

function RuntimeStatusDebug() {
  const { loading, ready, rootId, error, controllers, outputPaths } =
    useVizijRuntime();
  const runtimeViewGraphCount = useGraphRuntime(
    (state) => state.runtimeViewGraphCount,
  );
  const runtimeViewOutputCount = useGraphRuntime(
    (state) => state.runtimeViewOutputCount,
  );
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
      } | graphs: ${runtimeViewGraphCount} | outputs: ${runtimeViewOutputCount}`}
    </div>
  );
}

function RuntimeFpsBadge() {
  const { ready, loading, stepHz } = useVizijRuntime();
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );

  const resetInputEntries = useMemo(() => {
    const updates: Record<string, number> = {};
    managedStandardInputs.forEach((entry) => {
      if (isPoseControlInputPath(entry.input.path)) {
        return;
      }
      const inputId = entry.input.id?.trim();
      if (!inputId) {
        return;
      }
      updates[inputId] = Number.isFinite(entry.input.defaultValue)
        ? entry.input.defaultValue
        : 0;
    });
    return updates;
  }, [managedStandardInputs]);

  const handleResetInputs = useCallback(() => {
    if (Object.keys(resetInputEntries).length === 0) {
      return;
    }
    applyStandardInputBatch(resetInputEntries);
  }, [applyStandardInputBatch, resetInputEntries]);

  if (!ready || loading) {
    return null;
  }

  const formattedFps =
    stepHz !== undefined ? `${Math.round(stepHz)} fps` : "— fps";

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-2">
      <div className="rounded bg-black/60 px-2 py-1 text-[10px] text-white">
        FPS: {formattedFps}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleResetInputs}
        title="Reset graph inputs to their default values"
      >
        Reset Inputs
      </Button>
    </div>
  );
}

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  bundle: VizijAssetBundle | null;
  selectedSceneId?: string | null;
  onSelectScene?: (id: string) => void;
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
  selectedSceneId = null,
  onSelectScene,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  onLoadHugo,
}: ViewerProps) {
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const runtimeWarning = useGraphRuntime((state) => state.graphWarning);
  const runtimeError = useGraphRuntime((state) => state.graphError);

  useEffect(() => {
    if (rootId && bundle) {
      return;
    }
    graphRuntimeStore.setState({
      stageRuntimeInput: undefined,
      runtimeViewReady: false,
      runtimeViewLoading: false,
      runtimeViewRootId: null,
      runtimeViewGraphCount: 0,
      runtimeViewOutputCount: 0,
    });
  }, [bundle, graphRuntimeStore, rootId]);

  const handleRuntimeControllersRegistered = useCallback(
    (ids: { graphs: string[]; anims: string[] }) => {
      graphRuntimeStore.setState({
        runtimeViewGraphCount: ids.graphs.length,
      });
    },
    [graphRuntimeStore],
  );

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
          <VizijRuntimeProvider
            assetBundle={bundle}
            autostart
            onRegisterControllers={handleRuntimeControllersRegistered}
          >
            {onSelectScene ? (
              <RuntimeSelectionBridge
                selectedSceneId={selectedSceneId}
                onSelectScene={onSelectScene}
              />
            ) : null}
            <RuntimeInputBridge />
            <RuntimeGraphBridge />
            <RuntimeStatusDebug />
            <RuntimeFpsBadge />
            <div className="h-full w-full">
              <VizijRuntimeFace
                className="h-full w-full"
                showSafeArea={false}
                showSelectionGlow={showSelectionGlow}
                onPointerMissed={() => {
                  onClearSelection();
                }}
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
