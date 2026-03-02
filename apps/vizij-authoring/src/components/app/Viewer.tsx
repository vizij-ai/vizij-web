import { VizijRuntimeFace, VizijRuntimeProvider } from "@vizij/runtime-react";
import type {
  RuntimeOutputWrite,
  VizijAssetBundle,
} from "@vizij/runtime-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useVizijStore, useVizijStoreSetter } from "@vizij/render";
import type { StandardRigInput } from "@vizij/utils";
import { Button } from "../ui";
import { MotionGraphDriverBridge } from "../../motiongraph/MotionGraphDriverBridge";
import { InputValueBridge } from "../../motiongraph/components/InputValueBridge";
import { MotionGraphValueSampler } from "../../motiongraph/components/MotionGraphValueSampler";
import { useEditorStore } from "../../motiongraph/store/useEditorStore";
import {
  useBindingAuthoring,
  useGraphRuntime,
  useGraphRuntimeStoreApi,
} from "../../state/RigControllerProvider";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { AnimationRuntimeBridge } from "../../hooks/useAnimationTransport";
import {
  isPoseControlInputPath,
  isPoseOutputInputPath,
} from "../../poseRig/utils";
import { resolveExportBodiesFromWorld } from "../../utils/exportBodies";
import { RuntimeFaceControlsOverlay } from "./RuntimeFaceControlsOverlay";
import { buildRuntimeInputCatalogFromConstraints } from "./runtimeInputsFromConstraints";
import {
  applyLockedRuntimeOutputWrite,
  buildLockedRuntimeOutputIndex,
} from "./runtimeOutputLocks";
import type { FacePresetAssetOption } from "./facePresetAssets";

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

function toDeterministicSignature(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, currentValue) => {
    if (!currentValue || typeof currentValue !== "object") {
      return currentValue;
    }
    if (seen.has(currentValue as object)) {
      return "[Circular]";
    }
    seen.add(currentValue as object);
    if (Array.isArray(currentValue)) {
      return currentValue;
    }
    const record = currentValue as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    Object.keys(record)
      .sort((left, right) => left.localeCompare(right))
      .forEach((key) => {
        sorted[key] = record[key];
      });
    return sorted;
  });
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
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const payload = useMemo(() => {
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
    return {
      rig: graphSpec ? { id: "rig", spec: graphSpec } : undefined,
      pose: posePayload,
    };
  }, [graphSpec, poseConfig, poseGraphSpec]);
  const payloadSignature = useMemo(
    () => toDeterministicSignature(payload),
    [payload],
  );
  const lastPayloadSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastPayloadSignatureRef.current === payloadSignature) {
      return;
    }
    lastPayloadSignatureRef.current = payloadSignature;
    if (process.env.NODE_ENV !== "production") {
      console.log("[vizij-runtime][graph-bridge]", {
        hasRig: Boolean(payload.rig),
        hasPoseGraph: Boolean(payload.pose?.graph),
        hasPoseConfig: Boolean(payload.pose?.config),
      });
    }
    setGraphBundle(payload, { tier: "graphs" });
  }, [payload, payloadSignature, setGraphBundle]);

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

export interface ViewerProps {
  rootId: string | null;
  namespace: string;
  bundle: VizijAssetBundle | null;
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
  onLoadHugo: () => void;
  presetLoadOptions?: readonly FacePresetAssetOption[];
  onLoadPresetAsset?: (preset: FacePresetAssetOption) => void;
  onRuntimeExportBodiesChange?: (snapshot: RuntimeExportBodiesSnapshot) => void;
}

export function Viewer({
  rootId,
  namespace: _namespace,
  bundle,
  selectedSceneId = null,
  onSelectScene,
  onRuntimeInputsReady,
  onClearSelection,
  showSelectionGlow,
  onImportClick,
  onLoadQuori,
  onLoadHugo,
  presetLoadOptions,
  onLoadPresetAsset,
  onRuntimeExportBodiesChange,
}: ViewerProps) {
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const runtimeWarning = useGraphRuntime((state) => state.graphWarning);
  const runtimeError = useGraphRuntime((state) => state.graphError);
  const motionGraphVisible = useWorkspaceStore(
    (state) => state.panels.motiongraph.isVisible,
  );
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
  }, [applyStandardInputBatch, resetInputEntries]);

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
    onRuntimeInputsReady?.([], new Map());
  }, [bundle, graphRuntimeStore, onRuntimeInputsReady, rootId]);

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
            <AnimationRuntimeBridge />
            <InputValueBridge active={motionGraphVisible} />
            <MotionGraphDriverBridge active={motionGraphVisible} />
            <MotionGraphValueSampler
              active={motionGraphVisible && plotActive}
            />
            <RuntimeStatusDebug />
            <RuntimeFaceControlsOverlay
              onResetInputs={handleResetInputs}
              resetButtonLabel="Reset Main Inputs"
              resetButtonTitle="Reset main-face inputs to their default values"
            />
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
            <div className="flex w-full max-w-3xl flex-col items-center gap-3">
              <Button onClick={onImportClick} size="md">
                Import File
              </Button>
              {presetLoadOptions &&
              presetLoadOptions.length > 0 &&
              onLoadPresetAsset ? (
                <div className="grid w-full grid-cols-3 gap-2">
                  {presetLoadOptions.map((preset) => (
                    <Button
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
                  <Button variant="secondary" onClick={onLoadQuori} size="md">
                    Load Quori
                  </Button>
                  <Button variant="secondary" onClick={onLoadHugo} size="md">
                    Load Hugo
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
