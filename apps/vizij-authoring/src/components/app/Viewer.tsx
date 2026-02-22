import { VizijRuntimeFace, VizijRuntimeProvider } from "@vizij/runtime-react";
import type { VizijAssetBundle } from "@vizij/runtime-react";
import { useCallback, useEffect, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { Button } from "../ui";
import {
  useGraphRuntime,
  useGraphRuntimeStoreApi,
} from "../../state/RigControllerProvider";
import {
  getLastRuntimeImportPerfSummary,
  recordGraphBridgeRun,
  recordRuntimeControllerRegistrationRun,
  recordRuntimeDebugEvent,
  recordRuntimeFirstFrame,
  recordRuntimeReady,
} from "../../perf/runtimePerfMetrics";
import { useRuntimeInputDispatcher } from "../../hooks/useRuntimeInputDispatcher";
import {
  resolveRuntimeGraphMutationDecision,
  type RuntimeGraphMutationClass,
  type RuntimeGraphBridgeRevisions,
} from "./runtimeGraphMutation";

function RuntimeInputBridge() {
  const { controllableReady } = useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const dispatchRuntimeInput = useRuntimeInputDispatcher();

  useEffect(() => {
    graphRuntimeStore.setState({
      stageRuntimeInput: controllableReady ? dispatchRuntimeInput : undefined,
    });
  }, [controllableReady, dispatchRuntimeInput, graphRuntimeStore]);

  return null;
}

interface RuntimeSelectionBridgeProps {
  selectedSceneId: string | null;
  onSelectSceneChange?: (id: string | null) => void;
}

function RuntimeSelectionBridge({
  selectedSceneId,
  onSelectSceneChange,
}: RuntimeSelectionBridgeProps) {
  const runtime = useVizijRuntime();
  const runtimeSelection = runtime as typeof runtime & {
    selectedElementId?: string | null;
    selectElementById?: (id: string | null) => void;
  };
  const selectedElementId = runtimeSelection.selectedElementId ?? null;
  const selectElementById =
    runtimeSelection.selectElementById ?? (() => undefined);
  const previousSelectedSceneIdRef = useRef<string | null>(selectedSceneId);
  const previousRuntimeSelectionRef = useRef<string | null>(selectedElementId);

  useEffect(() => {
    const previousExternal = previousSelectedSceneIdRef.current;
    const previousRuntime = previousRuntimeSelectionRef.current;
    const externalChanged = selectedSceneId !== previousExternal;
    const runtimeChanged = selectedElementId !== previousRuntime;

    if (
      externalChanged &&
      !runtimeChanged &&
      selectedElementId !== selectedSceneId
    ) {
      selectElementById(selectedSceneId);
    } else if (
      runtimeChanged &&
      !externalChanged &&
      selectedElementId !== selectedSceneId
    ) {
      onSelectSceneChange?.(selectedElementId);
    } else if (!externalChanged && !runtimeChanged) {
      if (selectedElementId !== selectedSceneId) {
        if (selectedSceneId === null) {
          onSelectSceneChange?.(selectedElementId);
        } else {
          selectElementById(selectedSceneId);
        }
      }
    }

    previousSelectedSceneIdRef.current = selectedSceneId;
    previousRuntimeSelectionRef.current = selectedElementId;
  }, [
    onSelectSceneChange,
    selectElementById,
    selectedElementId,
    selectedSceneId,
  ]);

  return null;
}

function RuntimeGraphBridge() {
  const { setGraphBundle } = useVizijRuntime();
  const graphSpecRevision = useGraphRuntime((state) => state.graphSpecRevision);
  const poseGraphSpecRevision = useGraphRuntime(
    (state) => state.poseGraphSpecRevision,
  );
  const poseRuntimeRevision = useGraphRuntime(
    (state) => state.poseRuntimeRevision,
  );
  const graphBridgeForceTopologyRevision = useGraphRuntime(
    (state) => state.graphBridgeForceTopologyRevision,
  );
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const lastRevisionRef = useRef<RuntimeGraphBridgeRevisions | null>(null);

  useEffect(() => {
    const startMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    let publishedMutationClass: RuntimeGraphMutationClass | null = null;

    try {
      const nextRevisions: RuntimeGraphBridgeRevisions = {
        graphSpecRevision,
        poseGraphSpecRevision,
        poseRuntimeRevision,
        graphBridgeForceTopologyRevision,
      };
      const decision = resolveRuntimeGraphMutationDecision(
        lastRevisionRef.current,
        nextRevisions,
        {
          graphSpec,
          poseGraphSpec,
          poseConfig,
        },
      );
      if (decision.kind !== "publish") {
        recordRuntimeDebugEvent("viewer-graph-bridge-skip", {
          reason: decision.reason,
          graphSpecRevision,
          poseGraphSpecRevision,
          poseRuntimeRevision,
          graphBridgeForceTopologyRevision,
        });
        return;
      }
      publishedMutationClass = decision.mutationClass;
      recordRuntimeDebugEvent("viewer-graph-bridge-publish", {
        mutationClass: decision.mutation.mutationClass,
        graphSpecRevision,
        poseGraphSpecRevision,
        poseRuntimeRevision,
        graphBridgeForceTopologyRevision,
        hasRig: Boolean(decision.mutation.bundle.rig),
        hasPoseGraph: Boolean(decision.mutation.bundle.pose?.graph),
        hasPoseConfig: Boolean(decision.mutation.bundle.pose?.config),
      });

      if (process.env.NODE_ENV !== "production") {
        console.log("[vizij-runtime][graph-bridge]", {
          mutationClass: decision.mutation.mutationClass,
          hasRig: Boolean(decision.mutation.bundle.rig),
          hasPoseGraph: Boolean(decision.mutation.bundle.pose?.graph),
          hasPoseConfig: Boolean(decision.mutation.bundle.pose?.config),
        });
      }
      setGraphBundle(decision.mutation.bundle, {
        ...decision.mutation.options,
        mutationClass: decision.mutation.mutationClass,
      });
      lastRevisionRef.current = decision.revisions;
    } finally {
      const endMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const snapshot = recordGraphBridgeRun(
        endMs - startMs,
        publishedMutationClass,
        { publishedAtMs: endMs },
      );
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __vizijRuntimePerf?: unknown }).__vizijRuntimePerf =
          snapshot;
      }
    }
  }, [
    graphSpecRevision,
    poseGraphSpecRevision,
    poseRuntimeRevision,
    graphBridgeForceTopologyRevision,
    graphSpec,
    poseGraphSpec,
    poseConfig,
    setGraphBundle,
  ]);

  return null;
}

function RuntimeLifecyclePerfBridge() {
  const { controllableReady, rootId } = useVizijRuntime();
  const readyRootRef = useRef<string | null>(null);
  const firstFrameRootRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rootId) {
      readyRootRef.current = null;
      firstFrameRootRef.current = null;
      return;
    }
    if (!controllableReady) {
      readyRootRef.current = null;
      firstFrameRootRef.current = null;
      return;
    }
    if (readyRootRef.current !== rootId) {
      readyRootRef.current = rootId;
      recordRuntimeReady(rootId, "main");
      recordRuntimeDebugEvent("viewer-runtime-ready", { rootId });
    }
    if (firstFrameRootRef.current === rootId) {
      return;
    }

    let cancelled = false;
    const frameHandle = requestAnimationFrame(() => {
      if (cancelled) {
        return;
      }
      firstFrameRootRef.current = rootId;
      const snapshot = recordRuntimeFirstFrame(rootId, "main");
      recordRuntimeDebugEvent("viewer-runtime-first-frame", { rootId });
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __vizijRuntimePerf?: unknown }).__vizijRuntimePerf =
          snapshot;
        const importSummary = getLastRuntimeImportPerfSummary("main");
        if (importSummary && importSummary.rootId === rootId) {
          (
            globalThis as { __vizijImportPerfSummary?: unknown }
          ).__vizijImportPerfSummary = importSummary;
          // eslint-disable-next-line no-console -- import runtime diagnostics
          console.info("[vizij-authoring] import render perf summary", {
            ...importSummary,
          });
        }
      }
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameHandle);
    };
  }, [controllableReady, rootId]);

  return null;
}

function RuntimeStatusDebug() {
  const {
    loading,
    ready,
    firstFrameReady,
    controllableReady,
    rootId,
    error,
    controllers,
    outputPaths,
    stepHz,
  } = useVizijRuntime();
  const runtimeStageLabel = controllableReady
    ? "Controls ready"
    : firstFrameReady
      ? "Face visible, wiring controls"
      : ready
        ? "Loading face"
        : loading
          ? "Initializing runtime"
          : "Idle";

  const runtimeStageTone = controllableReady
    ? "text-emerald-200 border-emerald-600/60 bg-emerald-950/60"
    : "text-amber-100 border-amber-600/60 bg-amber-950/60";
  const formattedFps =
    stepHz !== undefined ? `${Math.round(stepHz)} fps` : "— fps";

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[vizij-runtime][viewer]", {
        loading,
        ready,
        firstFrameReady,
        controllableReady,
        rootId,
        error,
        controllers,
        outputPaths: outputPaths.length,
      });
    }
  }, [
    controllableReady,
    controllers,
    error,
    firstFrameReady,
    loading,
    outputPaths.length,
    ready,
    rootId,
  ]);
  return (
    <div
      className={`absolute bottom-2 right-2 z-10 rounded border px-2 py-1 text-[10px] backdrop-blur-sm ${runtimeStageTone}`}
    >
      <p className="m-0 font-semibold">{runtimeStageLabel}</p>
      <p className="m-0 text-[9px] opacity-85">
        {`root: ${rootId ?? "null"} • graphs: ${controllers.graphs.length} • ${formattedFps}`}
      </p>
    </div>
  );
}

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  bundle: VizijAssetBundle | null;
  selectedSceneId?: string | null;
  onSelectSceneChange?: (id: string | null) => void;
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
  onSelectSceneChange,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  onLoadHugo,
}: ViewerProps) {
  const runtimeWarning = useGraphRuntime((state) => state.graphWarning);
  const runtimeError = useGraphRuntime((state) => state.graphError);
  const handleRegisterControllers = useCallback(
    (
      _ids: { graphs: string[]; anims: string[] },
      meta?: { durationMs: number; token: number },
    ) => {
      const snapshot = recordRuntimeControllerRegistrationRun(meta?.durationMs);
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __vizijRuntimePerf?: unknown }).__vizijRuntimePerf =
          snapshot;
      }
    },
    [],
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
            onRegisterControllers={handleRegisterControllers}
          >
            <RuntimeInputBridge />
            <RuntimeGraphBridge />
            <RuntimeLifecyclePerfBridge />
            <RuntimeSelectionBridge
              selectedSceneId={selectedSceneId}
              onSelectSceneChange={onSelectSceneChange}
            />
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
