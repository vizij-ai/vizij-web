import { VizijRuntimeFace, VizijRuntimeProvider } from "@vizij/runtime-react";
import type {
  RuntimeGraphBundleAppliedEvent,
  RuntimeOutputWrite,
  VizijAssetBundle,
} from "@vizij/runtime-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import {
  buildMotionGraphPreviewBundle,
  buildRuntimeGraphPreviewBundle,
  buildRuntimeInputCatalogFromConstraints,
  toDeterministicSignature,
  type AuthoringPreviewTarget,
  type AnimationClipIR,
} from "@vizij/studio-support";
import type { StandardRigInput } from "@vizij/utils";
import { Button } from "../ui";
import { InputValueBridge } from "../../motiongraph/components/InputValueBridge";
import { MotionGraphValueSampler } from "../../motiongraph/components/MotionGraphValueSampler";
import {
  useEditorStore,
  type EditorEdge,
  type EditorNode,
} from "../../motiongraph/store/useEditorStore";
import {
  useBindingAuthoring,
  useGraphRuntime,
  useGraphRuntimeStoreApi,
} from "../../state/RigControllerProvider";
import { createAuthoringCompileTargets } from "../../state/graphRuntimeStore";
import { useAnimationStore } from "../../state/animationStore";
import { AnimationRuntimeBridge } from "../../hooks/useAnimationTransport";
import { isAuthoringDebugEnabled } from "../../utils/debug";
import {
  isPoseControlInputPath,
  isPoseOutputInputPath,
} from "../../poseRig/utils";
import { resolveExportBodiesFromWorld } from "../../utils/exportBodies";
import {
  RuntimeFaceControlsOverlay,
  type RuntimeFaceOverlayAction,
} from "./RuntimeFaceControlsOverlay";
import {
  applyLockedRuntimeOutputWrite,
  buildLockedRuntimeOutputIndex,
} from "./runtimeOutputLocks";
import type { FacePresetAssetOption } from "./facePresetAssets";

const AUTHORING_PREVIEW_TARGET_KEYS = new Set<AuthoringPreviewTarget>([
  "runtime-graph",
  "animation",
  "motiongraph",
]);

function parseAuthoringPreviewTarget(
  value: string | undefined,
): AuthoringPreviewTarget | null {
  return AUTHORING_PREVIEW_TARGET_KEYS.has(value as AuthoringPreviewTarget)
    ? (value as AuthoringPreviewTarget)
    : null;
}

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
  const { setInput, animateValue, ready, loading, rootId, outputPaths } =
    useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();

  useEffect(() => {
    graphRuntimeStore.setState({
      stageRuntimeInput: ready
        ? (graphPath: string, value: number) => {
            setInput(graphPath, { float: value });
          }
        : undefined,
      animateRuntimeValue: ready
        ? (graphPath: string, value: number, duration: number) => {
            void animateValue(graphPath, { float: value }, { duration });
          }
        : undefined,
      runtimeViewReady: ready,
      runtimeViewLoading: loading,
      runtimeViewRootId: rootId ?? null,
      runtimeViewOutputCount: outputPaths.length,
    });
  }, [
    animateValue,
    graphRuntimeStore,
    loading,
    outputPaths.length,
    ready,
    rootId,
    setInput,
  ]);

  useEffect(
    () => () => {
      graphRuntimeStore.setState({
        stageRuntimeInput: undefined,
        animateRuntimeValue: undefined,
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

export interface RuntimeExportBodiesSnapshot {
  rootFilteredBodies: unknown[];
  anyBodies: unknown[];
  runtimeRootId: string | null;
}

interface RuntimeExportBodyBridgeProps {
  targetRootId: string | null;
  onRuntimeExportBodiesChange?: (snapshot: RuntimeExportBodiesSnapshot) => void;
}

function RuntimeExportBodyBridge({
  targetRootId,
  onRuntimeExportBodiesChange,
}: RuntimeExportBodyBridgeProps) {
  const { rootId: runtimeRootId } = useVizijRuntime();
  const world = useVizijStore((state) => state.world);
  const getExportableBodies = useVizijStore(
    (state) => state.getExportableBodies,
  );
  const rootFilteredFromStore = useMemo(
    () => getExportableBodies(targetRootId ? [targetRootId] : undefined),
    [getExportableBodies, targetRootId, world],
  );
  const anyFromStore = useMemo(
    () => getExportableBodies(),
    [getExportableBodies, world],
  );
  const rootFilteredBodies = useMemo(
    () =>
      rootFilteredFromStore.length > 0
        ? rootFilteredFromStore
        : resolveExportBodiesFromWorld(
            world as Record<string, unknown>,
            targetRootId ? [targetRootId] : undefined,
          ),
    [rootFilteredFromStore, targetRootId, world],
  );
  const anyBodies = useMemo(
    () =>
      anyFromStore.length > 0
        ? anyFromStore
        : resolveExportBodiesFromWorld(world as Record<string, unknown>),
    [anyFromStore, world],
  );

  useEffect(() => {
    if (!onRuntimeExportBodiesChange) {
      return;
    }
    onRuntimeExportBodiesChange({
      rootFilteredBodies,
      anyBodies,
      runtimeRootId: runtimeRootId ?? null,
    });
  }, [
    anyBodies,
    onRuntimeExportBodiesChange,
    rootFilteredBodies,
    runtimeRootId,
  ]);

  useEffect(
    () => () => {
      if (!onRuntimeExportBodiesChange) {
        return;
      }
      onRuntimeExportBodiesChange({
        rootFilteredBodies: [],
        anyBodies: [],
        runtimeRootId: null,
      });
    },
    [onRuntimeExportBodiesChange],
  );

  return null;
}

interface RuntimeInputCatalogBridgeProps {
  onRuntimeInputsReady: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
}

function RuntimeInputCatalogBridge({
  onRuntimeInputsReady,
}: RuntimeInputCatalogBridgeProps) {
  const { ready, inputConstraints, namespace } = useVizijRuntime();
  const { inputs, byId } = useMemo(
    () =>
      buildRuntimeInputCatalogFromConstraints(ready ? inputConstraints : null, {
        namespace,
      }),
    [inputConstraints, namespace, ready],
  );
  const lastSignatureRef = useRef<string | null>(null);

  const signature = useMemo(() => {
    if (!ready || inputs.length === 0) {
      return "__empty__";
    }
    return inputs
      .map(
        (input) =>
          `${input.id}:${input.path}:${input.defaultValue}:${input.range.min}:${input.range.max}`,
      )
      .join("|");
  }, [inputs, ready]);

  useEffect(() => {
    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;
    onRuntimeInputsReady(inputs, byId);
  }, [byId, inputs, onRuntimeInputsReady, signature]);

  return null;
}

function RuntimeGraphBridge() {
  const { setGraphBundle } = useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const previewBundle = useMemo(
    () =>
      buildRuntimeGraphPreviewBundle({
        rigSpec: graphSpec,
        poseGraphSpec,
        poseConfig,
      }),
    [graphSpec, poseConfig, poseGraphSpec],
  );
  const lastPayloadSignatureRef = useRef<string | null>(null);
  const managedPayloadRef = useRef(false);

  useEffect(() => {
    const shouldPublish = previewBundle.hasPayload || managedPayloadRef.current;
    if (!shouldPublish) {
      return;
    }
    if (lastPayloadSignatureRef.current === previewBundle.signature) {
      return;
    }
    lastPayloadSignatureRef.current = previewBundle.signature;
    graphRuntimeStore.setState({
      authoringCompileStatus: "compiling",
      authoringCompileTarget: "runtime-graph",
      authoringCompileMessage: null,
      authoringCompileSignature: previewBundle.signature,
    });
    if (isAuthoringDebugEnabled("runtime")) {
      console.log("[vizij-runtime][graph-bridge]", {
        hasRig: Boolean(previewBundle.bundle.rig),
        hasPoseGraph: Boolean(previewBundle.bundle.pose?.graph),
        hasPoseConfig: Boolean(previewBundle.bundle.pose?.config),
      });
    }
    setGraphBundle(previewBundle.bundle, {
      tier: "graphs",
      source: {
        key: "runtime-graph",
        signature: previewBundle.signature,
      },
    });
    managedPayloadRef.current = previewBundle.hasPayload;
    graphRuntimeStore.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "runtime-graph",
      authoringCompileMessage: null,
      authoringCompileSignature: previewBundle.signature,
    });
  }, [graphRuntimeStore, previewBundle, setGraphBundle]);

  return null;
}

function RuntimeStatusDebug() {
  const { loading, ready, rootId, error, controllers, outputPaths } =
    useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const runtimeViewGraphCount = useGraphRuntime(
    (state) => state.runtimeViewGraphCount,
  );
  const runtimeViewOutputCount = useGraphRuntime(
    (state) => state.runtimeViewOutputCount,
  );
  useEffect(() => {
    if (isAuthoringDebugEnabled("runtime")) {
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
  useEffect(() => {
    if (!error) {
      return;
    }
    const currentState = graphRuntimeStore.getState();
    const currentTarget = currentState.authoringCompileTarget;
    if (!currentTarget) {
      return;
    }
    graphRuntimeStore.setState({
      authoringCompileStatus: "runtime-error",
      authoringCompileTarget: currentTarget,
      authoringCompileMessage: error.message,
      authoringCompileSignature: currentState.authoringCompileSignature,
    });
  }, [error, graphRuntimeStore]);
  const runtimeState = ready ? "ready" : loading ? "loading" : "idle";
  return (
    <div
      data-testid="main-runtime-status"
      className="absolute bottom-2 right-2 z-10 rounded bg-black/55 px-2 py-1 text-[10px] text-white/80"
    >
      {`runtime: ${runtimeState} | graphs: ${runtimeViewGraphCount} | outputs: ${runtimeViewOutputCount}`}
    </div>
  );
}

interface MotionGraphRuntimeResetEntry {
  path: string;
  value: number;
}

function MotionGraphRuntimeBridge({
  controllerId = null,
  playbackState = "stopped",
  nodes,
  edges,
  resetValues = [],
  plotActive = false,
}: {
  controllerId?: string | null;
  playbackState?: "playing" | "paused" | "stopped";
  nodes?: EditorNode[] | null;
  edges?: EditorEdge[] | null;
  resetValues?: readonly MotionGraphRuntimeResetEntry[];
  plotActive?: boolean;
}) {
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const {
    assetBundle,
    controllers,
    pauseProgram,
    playProgram,
    setGraphBundle,
    stopProgram,
  } = useVizijRuntime();
  const previousSessionRef = useRef<{
    controllerId: string | null;
    playbackState: "playing" | "paused" | "stopped";
  }>({
    controllerId: null,
    playbackState: "stopped",
  });
  const stopProgramRef = useRef(stopProgram);
  const touchedProgramBundleRef = useRef(false);
  const managedProgramIdRef = useRef<string | null>(null);
  const appliedProgramSignatureRef = useRef<string | null>(null);
  const lastProgramSignatureRef = useRef<string | null>(null);
  const lastPlaybackCommandRef = useRef<string | null>(null);
  useEffect(() => {
    stopProgramRef.current = stopProgram;
  }, [stopProgram]);
  const currentPrograms = useMemo(
    () =>
      [...(assetBundle.programs ?? [])].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    [assetBundle.programs],
  );
  const currentProgramSignature = useMemo(
    () => toDeterministicSignature(currentPrograms),
    [currentPrograms],
  );
  const previewBundle = useMemo(
    () =>
      buildMotionGraphPreviewBundle({
        controllerId,
        nodes,
        edges,
        resetValues,
        currentPrograms,
        previousManagedProgramId: managedProgramIdRef.current,
      }),
    [controllerId, currentPrograms, edges, nodes, resetValues],
  );
  const programAsset = previewBundle.programAsset;
  useEffect(() => {
    if (previewBundle.managedProgramId) {
      managedProgramIdRef.current = previewBundle.managedProgramId;
    }
  }, [previewBundle.managedProgramId]);
  const desiredPrograms = previewBundle.programs;
  const desiredProgramSignature = previewBundle.signature;
  const controllerSignature = useMemo(
    () => toDeterministicSignature(controllers),
    [controllers],
  );
  const active =
    playbackState === "playing" &&
    programAsset !== null &&
    Array.isArray(nodes);

  useEffect(() => {
    if (lastProgramSignatureRef.current !== currentProgramSignature) {
      lastProgramSignatureRef.current = currentProgramSignature;
      if (currentProgramSignature !== desiredProgramSignature) {
        appliedProgramSignatureRef.current = null;
      }
    }

    if (!programAsset && !touchedProgramBundleRef.current) {
      return;
    }

    if (currentProgramSignature === desiredProgramSignature) {
      appliedProgramSignatureRef.current = desiredProgramSignature;
      if (desiredPrograms.length === 0) {
        touchedProgramBundleRef.current = false;
      }
      if (!programAsset) {
        managedProgramIdRef.current = null;
      }
      return;
    }

    if (appliedProgramSignatureRef.current === desiredProgramSignature) {
      return;
    }

    appliedProgramSignatureRef.current = desiredProgramSignature;
    touchedProgramBundleRef.current = true;
    graphRuntimeStore.setState({
      authoringCompileStatus: "compiling",
      authoringCompileTarget: "motiongraph",
      authoringCompileMessage: null,
      authoringCompileSignature: desiredProgramSignature,
    });
    setGraphBundle(previewBundle.bundle, {
      tier: "graphs",
      source: {
        key: "motiongraph",
        signature: desiredProgramSignature,
      },
    });
    graphRuntimeStore.setState({
      authoringCompileStatus: "compiled",
      authoringCompileTarget: "motiongraph",
      authoringCompileMessage: null,
      authoringCompileSignature: desiredProgramSignature,
    });
  }, [
    currentProgramSignature,
    desiredProgramSignature,
    desiredPrograms,
    graphRuntimeStore,
    previewBundle.bundle,
    programAsset,
    setGraphBundle,
  ]);

  useLayoutEffect(() => {
    const previous = previousSessionRef.current;
    const targetChanged =
      previous.controllerId !== null && previous.controllerId !== controllerId;
    const transitionedToStopped =
      previous.controllerId !== null &&
      previous.playbackState !== "stopped" &&
      playbackState === "stopped";
    if ((targetChanged || transitionedToStopped) && previous.controllerId) {
      stopProgram(previous.controllerId);
    }
    previousSessionRef.current = {
      controllerId,
      playbackState,
    };
  }, [controllerId, playbackState, stopProgram]);

  useEffect(() => {
    if (!programAsset) {
      return;
    }

    const commandKey = `${programAsset.id}:${desiredProgramSignature}:${playbackState}:${controllerSignature}`;
    if (lastPlaybackCommandRef.current === commandKey) {
      return;
    }

    try {
      if (playbackState === "playing") {
        playProgram(programAsset.id);
      } else if (playbackState === "paused") {
        pauseProgram(programAsset.id);
      } else {
        stopProgram(programAsset.id);
      }
      lastPlaybackCommandRef.current = commandKey;
    } catch (error) {
      console.warn("[motiongraph] Failed to apply runtime program command", {
        programId: programAsset.id,
        playbackState,
        error,
      });
      lastPlaybackCommandRef.current = null;
    }
  }, [
    controllerSignature,
    desiredProgramSignature,
    pauseProgram,
    playbackState,
    playProgram,
    programAsset,
    stopProgram,
  ]);

  useEffect(
    () => () => {
      const previous = previousSessionRef.current.controllerId;
      if (previous) {
        stopProgramRef.current(previous);
      }
    },
    [],
  );

  return (
    <>
      <InputValueBridge active={active} nodes={nodes ?? undefined} />
      <MotionGraphValueSampler active={active && plotActive} />
    </>
  );
}

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  bundle: VizijAssetBundle | null;
  runtimeEnabled?: boolean;
  animationSourceActive?: boolean;
  animationRuntimeClip?: AnimationClipIR | null;
  animationTransportSessionKey?: number;
  motionGraphRuntimeNodes?: EditorNode[] | null;
  motionGraphRuntimeEdges?: EditorEdge[] | null;
  motionGraphPlaybackState?: "playing" | "paused" | "stopped";
  motionGraphRuntimeControllerId?: string | null;
  motionGraphRuntimeResetValues?: readonly MotionGraphRuntimeResetEntry[];
  runtimeStatusLabel?: string;
  runtimeActions?: RuntimeFaceOverlayAction[];
  runtimePlaybackState?: "playing" | "paused" | "stopped";
  onPlayRuntime?: () => void;
  onPauseRuntime?: () => void;
  selectedSceneId?: string | null;
  onSelectScene?: (id: string) => void;
  onRuntimeInputsReady?: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
  onClearSelection: () => void;
  showSelectionGlow: boolean;
  onImportClick: () => void;
  onLoadQuori: () => void;
  presetLoadOptions?: readonly FacePresetAssetOption[];
  onLoadPresetAsset?: (preset: FacePresetAssetOption) => void;
  onRuntimeExportBodiesChange?: (snapshot: RuntimeExportBodiesSnapshot) => void;
}

export function Viewer({
  rootId,
  namespace: _namespace,
  bundle,
  runtimeEnabled = true,
  animationSourceActive = true,
  animationRuntimeClip = null,
  animationTransportSessionKey = 0,
  motionGraphRuntimeNodes = null,
  motionGraphRuntimeEdges = null,
  motionGraphPlaybackState = "stopped",
  motionGraphRuntimeControllerId = null,
  motionGraphRuntimeResetValues = [],
  runtimeStatusLabel,
  runtimeActions = [],
  runtimePlaybackState,
  onPlayRuntime,
  onPauseRuntime,
  selectedSceneId = null,
  onSelectScene,
  onRuntimeInputsReady,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  presetLoadOptions,
  onLoadPresetAsset,
  onRuntimeExportBodiesChange,
}: ViewerProps) {
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const runtimeWarning = useGraphRuntime((state) => state.graphWarning);
  const runtimeError = useGraphRuntime((state) => state.graphError);
  const plotActive = useEditorStore((state) => state.plotActive);
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const runtimeAnimatables = useVizijStore((state) => state.animatables);
  const lockedInspectorTargetIds = useBindingAuthoring(
    (state) => state.lockedInspectorTargetIds,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const stopAnimationTimeline = useAnimationStore((state) => state.stop);
  const lockedRuntimeOutputIndex = useMemo(
    () => buildLockedRuntimeOutputIndex(lockedInspectorTargetIds),
    [lockedInspectorTargetIds],
  );
  const lockedRuntimeOutputIndexRef = useRef(lockedRuntimeOutputIndex);
  const runtimeAnimatablesRef = useRef(runtimeAnimatables);

  useEffect(() => {
    lockedRuntimeOutputIndexRef.current = lockedRuntimeOutputIndex;
  }, [lockedRuntimeOutputIndex]);
  useEffect(() => {
    runtimeAnimatablesRef.current = runtimeAnimatables;
  }, [runtimeAnimatables]);

  const transformOutputWrite = useCallback(
    (write: RuntimeOutputWrite) =>
      applyLockedRuntimeOutputWrite(
        write,
        lockedRuntimeOutputIndexRef.current,
        {
          fallbackCurrentValue:
            runtimeAnimatablesRef.current[write.id]?.default,
        },
      ),
    [],
  );

  const resetInputEntries = useMemo(() => {
    const updates: Record<string, number> = {};
    managedStandardInputs.forEach((entry) => {
      if (
        isPoseControlInputPath(entry.input.path) ||
        isPoseOutputInputPath(entry.input.path)
      ) {
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
    stopAnimationTimeline();
  }, [applyStandardInputBatch, resetInputEntries, stopAnimationTimeline]);

  useEffect(() => {
    if (rootId && bundle && runtimeEnabled) {
      return;
    }
    graphRuntimeStore.setState({
      stageRuntimeInput: undefined,
      animateRuntimeValue: undefined,
      runtimeViewReady: false,
      runtimeViewLoading: false,
      runtimeViewRootId: null,
      runtimeViewGraphCount: 0,
      runtimeViewOutputCount: 0,
      authoringCompileStatus: "idle",
      authoringCompileTarget: null,
      authoringCompileMessage: null,
      authoringCompileSignature: null,
      authoringCompileTargets: createAuthoringCompileTargets(),
    });
    onRuntimeInputsReady?.([], new Map());
  }, [bundle, graphRuntimeStore, onRuntimeInputsReady, rootId, runtimeEnabled]);

  const handleRuntimeControllersRegistered = useCallback(
    (ids: { graphs: string[]; anims: string[] }) => {
      graphRuntimeStore.setState({
        runtimeViewGraphCount: ids.graphs.length,
      });
    },
    [graphRuntimeStore],
  );
  const handleRuntimeGraphBundleApplied = useCallback(
    (event: RuntimeGraphBundleAppliedEvent) => {
      const target = parseAuthoringPreviewTarget(event.source.key);
      const signature = event.source.signature ?? null;
      graphRuntimeStore.setState((state) => {
        const baseUpdate = {
          runtimeViewGraphCount: event.controllers.graphs.length,
        };
        if (!target) {
          return baseUpdate;
        }

        const targetState = state.authoringCompileTargets[target];
        const targetMatches =
          targetState?.signature === signature &&
          (targetState.status === "compiled" ||
            targetState.status === "compiling");
        if (!targetMatches) {
          return baseUpdate;
        }

        const globalMatches =
          state.authoringCompileTarget === target &&
          state.authoringCompileSignature === signature &&
          (state.authoringCompileStatus === "compiled" ||
            state.authoringCompileStatus === "compiling");
        if (globalMatches) {
          return {
            ...baseUpdate,
            authoringCompileStatus: "registered" as const,
            authoringCompileTarget: target,
            authoringCompileMessage: null,
            authoringCompileSignature: signature,
          };
        }

        return {
          ...baseUpdate,
          authoringCompileTargets: {
            ...state.authoringCompileTargets,
            [target]: {
              status: "registered" as const,
              message: null,
              signature,
            },
          },
        };
      });
    },
    [graphRuntimeStore],
  );

  return (
    <main
      data-testid="main-viewer"
      className="h-full w-full relative bg-bg-panel overflow-hidden"
    >
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
        {rootId && bundle && runtimeEnabled ? (
          <VizijRuntimeProvider
            assetBundle={bundle}
            autostart
            orchestratorBackend="aroraWeb"
            onRegisterControllers={handleRuntimeControllersRegistered}
            onRuntimeGraphBundleApplied={handleRuntimeGraphBundleApplied}
            transformOutputWrite={transformOutputWrite}
          >
            {onSelectScene ? (
              <RuntimeSelectionBridge
                selectedSceneId={selectedSceneId}
                onSelectScene={onSelectScene}
              />
            ) : null}
            {onRuntimeInputsReady ? (
              <RuntimeInputCatalogBridge
                onRuntimeInputsReady={onRuntimeInputsReady}
              />
            ) : null}
            {onRuntimeExportBodiesChange ? (
              <RuntimeExportBodyBridge
                targetRootId={rootId}
                onRuntimeExportBodiesChange={onRuntimeExportBodiesChange}
              />
            ) : null}
            <RuntimeInputBridge />
            <RuntimeGraphBridge />
            <AnimationRuntimeBridge
              active={animationSourceActive}
              clip={animationRuntimeClip}
              transportSessionKey={animationTransportSessionKey}
            />
            <MotionGraphRuntimeBridge
              controllerId={motionGraphRuntimeControllerId}
              playbackState={motionGraphPlaybackState}
              nodes={motionGraphRuntimeNodes}
              edges={motionGraphRuntimeEdges}
              resetValues={motionGraphRuntimeResetValues}
              plotActive={plotActive}
            />
            <RuntimeStatusDebug />
            <RuntimeFaceControlsOverlay
              onResetInputs={handleResetInputs}
              runtimeStatusLabel={runtimeStatusLabel}
              runtimeStatusTestId="main-runtime-status-chip"
              runtimePlaybackState={runtimePlaybackState}
              onPlayRuntime={onPlayRuntime}
              onPauseRuntime={onPauseRuntime}
              runtimeActions={runtimeActions}
              resetButtonLabel="Reset Main Inputs"
              resetButtonTitle="Reset main-face inputs to their default values"
              resetButtonTestId="main-runtime-reset-inputs"
              readyFlagTestId="main-runtime-ready-flag"
            />
            <div data-testid="main-runtime-view" className="h-full w-full">
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
        ) : rootId && bundle ? (
          <div
            data-testid="main-runtime-disabled-state"
            className="flex h-full w-full items-center justify-center p-8 text-center"
          >
            <div className="flex max-w-md flex-col gap-2 text-text-primary">
              <p className="text-lg font-medium">Runtime Preview Disabled</p>
              <p className="text-sm text-text-muted">
                Memory investigation mode loaded the authoring face without
                mounting the main runtime preview.
              </p>
            </div>
          </div>
        ) : (
          <div
            data-testid="main-viewer-empty-state"
            className="flex flex-col items-center justify-center h-full text-text-primary gap-6 p-8 text-center animate-in fade-in duration-700"
          >
            <div className="flex flex-col gap-2">
              <p className="text-text-primary font-medium text-lg">
                Empty Scene
              </p>
              <p className="text-sm max-w-xs mx-auto text-text-muted">
                Load a Vizij asset (.glb) to begin rigging and composing your
                scene.
              </p>
            </div>
            <div className="flex w-full max-w-3xl flex-col items-center gap-3">
              <Button
                data-testid="main-import-file-button"
                onClick={onImportClick}
                size="md"
              >
                Import File
              </Button>
              {presetLoadOptions &&
              presetLoadOptions.length > 0 &&
              onLoadPresetAsset ? (
                <div className="grid w-full grid-cols-3 gap-2">
                  {presetLoadOptions.map((preset) => (
                    <Button
                      data-testid={`main-preset-${preset.id.replace(/[:/]/g, "-")}`}
                      key={preset.id}
                      variant="secondary"
                      size="sm"
                      className="w-full justify-center text-[11px]"
                      disabled={!preset.available}
                      onClick={() => onLoadPresetAsset(preset)}
                      title={
                        preset.available
                          ? `Load ${preset.filename}`
                          : `${preset.label} asset not available`
                      }
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-3">
                  <Button
                    data-testid="main-preset-quori-latest"
                    variant="secondary"
                    onClick={onLoadQuori}
                    size="md"
                  >
                    Load Quori
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
