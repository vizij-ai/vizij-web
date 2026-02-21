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
  recordRuntimeFirstFrame,
  recordRuntimeReady,
} from "../../perf/runtimePerfMetrics";
import {
  createRuntimeGraphMutation,
  resolveRuntimeGraphMutationClass,
  type RuntimeGraphBridgeRevisions,
  type RuntimeGraphBridgeState,
} from "./runtimeGraphMutation";

type RuntimeGraphMutation = ReturnType<typeof createRuntimeGraphMutation>;
type RuntimeGraphMutationClass = RuntimeGraphMutation["mutationClass"];
type QueuedMutations = {
  topology: RuntimeGraphMutation | null;
  pose: RuntimeGraphMutation | null;
};

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
  const { ready, rootId, setGraphBundle } = useVizijRuntime();
  const runtimeRootId = rootId ?? null;
  const graphSpecRevision = useGraphRuntime((state) => state.graphSpecRevision);
  const poseRuntimeRevision = useGraphRuntime(
    (state) => state.poseRuntimeRevision,
  );
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const lastRevisionRef = useRef<RuntimeGraphBridgeRevisions | null>(null);
  const previousRootIdRef = useRef<string | null>(runtimeRootId);
  const previousReadyRef = useRef<boolean>(ready);
  const preReadyPublishedByClassRef = useRef<
    Record<RuntimeGraphMutationClass, boolean>
  >({
    topology: false,
    pose: false,
  });
  const queuedMutationsRef = useRef<QueuedMutations>({
    topology: null,
    pose: null,
  });

  const resetPreReadyState = useCallback(() => {
    preReadyPublishedByClassRef.current = {
      topology: false,
      pose: false,
    };
    queuedMutationsRef.current = {
      topology: null,
      pose: null,
    };
  }, []);

  const publishMutation = useCallback(
    (mutation: RuntimeGraphMutation): RuntimeGraphMutationClass => {
      if (process.env.NODE_ENV !== "production") {
        console.log("[vizij-runtime][graph-bridge]", {
          mutationClass: mutation.mutationClass,
          hasRig: Boolean(mutation.bundle.rig),
          hasPoseGraph: Boolean(mutation.bundle.pose?.graph),
          hasPoseConfig: Boolean(mutation.bundle.pose?.config),
        });
      }
      setGraphBundle(mutation.bundle, {
        ...mutation.options,
        mutationClass: mutation.mutationClass,
      });
      return mutation.mutationClass;
    },
    [setGraphBundle],
  );

  useEffect(() => {
    if (previousRootIdRef.current !== runtimeRootId) {
      previousRootIdRef.current = runtimeRootId;
      lastRevisionRef.current = null;
      resetPreReadyState();
    }
    if (previousReadyRef.current && !ready) {
      resetPreReadyState();
    }
    previousReadyRef.current = ready;
  }, [ready, resetPreReadyState, runtimeRootId]);

  useEffect(() => {
    const startMs =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    let publishedMutationClass: "topology" | "pose" | null = null;

    try {
      const nextRevisions: RuntimeGraphBridgeRevisions = {
        graphSpecRevision,
        poseRuntimeRevision,
      };
      const mutationClass = resolveRuntimeGraphMutationClass(
        lastRevisionRef.current,
        nextRevisions,
      );
      if (!mutationClass) {
        return;
      }
      lastRevisionRef.current = nextRevisions;

      const state: RuntimeGraphBridgeState = {
        graphSpec,
        poseGraphSpec,
        poseConfig,
      };
      const mutation = createRuntimeGraphMutation(state, mutationClass);
      if (!ready && runtimeRootId) {
        if (!preReadyPublishedByClassRef.current[mutation.mutationClass]) {
          preReadyPublishedByClassRef.current[mutation.mutationClass] = true;
          publishedMutationClass = publishMutation(mutation);
        } else {
          queuedMutationsRef.current[mutation.mutationClass] = mutation;
        }
        return;
      }
      publishedMutationClass = publishMutation(mutation);
    } finally {
      const endMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const snapshot = recordGraphBridgeRun(
        endMs - startMs,
        publishedMutationClass,
      );
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __vizijRuntimePerf?: unknown }).__vizijRuntimePerf =
          snapshot;
      }
    }
  }, [
    graphSpecRevision,
    poseRuntimeRevision,
    graphSpec,
    poseGraphSpec,
    poseConfig,
    publishMutation,
    ready,
    runtimeRootId,
  ]);

  useEffect(() => {
    if (!ready || !runtimeRootId) {
      return;
    }

    const pendingTopology = queuedMutationsRef.current.topology;
    const pendingPose = queuedMutationsRef.current.pose;
    if (!pendingTopology && !pendingPose) {
      return;
    }

    queuedMutationsRef.current = { topology: null, pose: null };
    const pendingMutations: RuntimeGraphMutation[] = [];
    if (pendingTopology) {
      pendingMutations.push(pendingTopology);
    }
    if (pendingPose) {
      pendingMutations.push(pendingPose);
    }

    for (const pendingMutation of pendingMutations) {
      const startMs =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      let publishedMutationClass: RuntimeGraphMutationClass | null = null;
      try {
        publishedMutationClass = publishMutation(pendingMutation);
      } finally {
        const endMs =
          typeof performance !== "undefined" ? performance.now() : Date.now();
        const snapshot = recordGraphBridgeRun(
          endMs - startMs,
          publishedMutationClass,
        );
        if (process.env.NODE_ENV !== "production") {
          (globalThis as { __vizijRuntimePerf?: unknown }).__vizijRuntimePerf =
            snapshot;
        }
      }
    }
  }, [publishMutation, ready, runtimeRootId]);

  return null;
}

function RuntimeLifecyclePerfBridge() {
  const { ready, rootId } = useVizijRuntime();
  const readyRootRef = useRef<string | null>(null);
  const firstFrameRootRef = useRef<string | null>(null);

  useEffect(() => {
    if (!rootId) {
      readyRootRef.current = null;
      firstFrameRootRef.current = null;
      return;
    }
    if (!ready) {
      readyRootRef.current = null;
      firstFrameRootRef.current = null;
      return;
    }
    if (readyRootRef.current !== rootId) {
      readyRootRef.current = rootId;
      recordRuntimeReady(rootId);
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
      const snapshot = recordRuntimeFirstFrame(rootId);
      if (process.env.NODE_ENV !== "production") {
        (globalThis as { __vizijRuntimePerf?: unknown }).__vizijRuntimePerf =
          snapshot;
        const importSummary = getLastRuntimeImportPerfSummary();
        if (importSummary && importSummary.rootId === rootId) {
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
  }, [ready, rootId]);

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
