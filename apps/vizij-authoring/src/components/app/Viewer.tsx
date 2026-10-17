import {
  VizijRuntimeFace,
  useOptionalVizijRuntime,
  useVizijRuntime,
} from "@vizij/runtime-react";
import { composeVizij, outputKeys, type Pick } from "@vizij/runtime";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  ToneMappingMode,
  VizijBundleExtension,
  VizijBundleGraphEntry,
} from "@vizij/render";
import type { GraphSpec } from "@vizij/node-graph";
import type { StandardRigInput } from "@vizij/utils";
import { Button } from "../ui";
import { MotionGraphDriverBridge } from "../../motiongraph/MotionGraphDriverBridge";
import { InputValueBridge } from "../../motiongraph/components/InputValueBridge";
import { MotionGraphValueSampler } from "../../motiongraph/components/MotionGraphValueSampler";
import {
  useEditorStore,
  type EditorEdge,
  type EditorNode,
} from "../../motiongraph/store/useEditorStore";
import { buildGraphSpec } from "../../motiongraph/utils/buildGraphSpec";
import {
  useBindingAuthoring,
  useGraphRuntime,
} from "../../state/RigControllerProvider";
import { useAnimationStore } from "../../state/animationStore";
import { useWorkspaceStore } from "../../state/workspaceStore";
import { AnimationRuntimeBridge } from "../../hooks/useAnimationTransport";
import type { AnimationClipIR } from "../../types/animationClipIr";
import {
  isPoseControlInputPath,
  isPoseOutputInputPath,
} from "../../poseRig/utils";
import type { PoseRigConfigFile } from "../../poseRig/types";
import {
  RuntimeFaceControlsOverlay,
  type RuntimeFaceOverlayAction,
} from "./RuntimeFaceControlsOverlay";
import { buildRuntimeInputCatalogFromDescription } from "./runtimeInputsFromConstraints";
import { EmptyStateDemo } from "./emptyStateDemo/EmptyStateDemo";
import { AUTHORING_FACE_OPTIONS } from "./faceComposition";
import { heldOutputChanges } from "./runtimeOutputLocks";
import type { FacePresetAssetOption } from "./facePresetAssets";

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

interface RuntimeInputCatalogBridgeProps {
  onRuntimeInputsReady: (
    inputs: StandardRigInput[],
    byId: Map<string, StandardRigInput>,
  ) => void;
}

/** The face's rig inputs, with their ranges and defaults, as its bundle
 * declares them (`describe`). */
function RuntimeInputCatalogBridge({
  onRuntimeInputsReady,
}: RuntimeInputCatalogBridgeProps) {
  const { description } = useVizijRuntime();
  const { inputs, byId } = useMemo(
    () => buildRuntimeInputCatalogFromDescription(description),
    [description],
  );
  const lastSignatureRef = useRef<string | null>(null);

  const signature = useMemo(() => {
    if (inputs.length === 0) {
      return "__empty__";
    }
    return inputs
      .map(
        (input) =>
          `${input.id}:${input.path}:${input.defaultValue}:${input.range.min}:${input.range.max}`,
      )
      .join("|");
  }, [inputs]);

  useEffect(() => {
    if (lastSignatureRef.current === signature) {
      return;
    }
    lastSignatureRef.current = signature;
    onRuntimeInputsReady(inputs, byId);
  }, [byId, inputs, onRuntimeInputsReady, signature]);

  useEffect(
    () => () => {
      onRuntimeInputsReady([], new Map());
    },
    [onRuntimeInputsReady],
  );

  return null;
}

/**
 * The bundle `bundle` becomes once the authored rig and pose graphs replace
 * its own: what the face runs while it is being authored.
 */
function bundleWithAuthoredGraphs(
  bundle: VizijBundleExtension | null,
  rig: GraphSpec | null | undefined,
  poseDriver: GraphSpec | null | undefined,
  poseConfig: PoseRigConfigFile | null | undefined,
): VizijBundleExtension {
  const base: VizijBundleExtension = bundle ?? { version: 1 };
  const graphs: VizijBundleGraphEntry[] = [...(base.graphs ?? [])];
  const put = (
    kind: string,
    id: string,
    spec: GraphSpec | null | undefined,
  ) => {
    if (!spec) {
      return;
    }
    const index = graphs.findIndex((entry) => entry.kind === kind);
    const entry = {
      ...(index >= 0 ? graphs[index] : { id, kind }),
      spec: spec as unknown as Record<string, unknown>,
    } as VizijBundleGraphEntry;
    if (index >= 0) {
      graphs[index] = entry;
    } else {
      graphs.push(entry);
    }
  };
  put("rig", "rig", rig);
  put("pose-driver", "pose", poseDriver);
  return {
    ...base,
    graphs,
    ...(poseConfig
      ? {
          poses: {
            ...(base.poses ?? {}),
            config: poseConfig as unknown as NonNullable<
              VizijBundleExtension["poses"]
            >["config"],
          },
        }
      : {}),
  };
}

/**
 * The authored rig and pose graphs, loaded into the face's device as they
 * change: the bundle's composition with those graphs in place of its own
 * (`composeVizij`), swapped in whole (`loadGraph`). The device keeps its
 * runs, its animation players and its store; the scene is not reloaded.
 */
function RuntimeGraphBridge({
  bundle,
}: {
  bundle: VizijBundleExtension | null;
}) {
  const { runtime } = useVizijRuntime();
  const graphSpec = useGraphRuntime((state) => state.graphSpec);
  const poseGraphSpec = useGraphRuntime((state) => state.poseGraphSpec);
  const poseConfig = useGraphRuntime((state) => state.poseConfig);
  const authored = useMemo(
    () =>
      graphSpec || poseGraphSpec || poseConfig
        ? bundleWithAuthoredGraphs(bundle, graphSpec, poseGraphSpec, poseConfig)
        : null,
    [bundle, graphSpec, poseConfig, poseGraphSpec],
  );
  const signature = useMemo(
    () =>
      authored
        ? toDeterministicSignature([authored.graphs, authored.poses])
        : null,
    [authored],
  );
  const loadedRef = useRef<{ runtime: unknown; signature: string } | null>(
    null,
  );

  useEffect(() => {
    if (!runtime || !authored || !signature) {
      return;
    }
    if (
      loadedRef.current?.runtime === runtime &&
      loadedRef.current.signature === signature
    ) {
      return;
    }
    loadedRef.current = { runtime, signature };
    let current = true;
    void (async () => {
      try {
        // The face's own composition, its animation source included: a
        // graph swapped in whole keeps only what it composes.
        const spec = await composeVizij(
          { asset: { version: "2.0" }, extensions: { VIZIJ_bundle: authored } },
          {
            graphs: AUTHORING_FACE_OPTIONS.graphs,
            program: AUTHORING_FACE_OPTIONS.program,
            animations: true,
          },
        );
        if (current) {
          await runtime.loadGraph(spec);
        }
      } catch (error) {
        console.error(
          "[vizij-authoring] the authored graphs did not load",
          error,
        );
      }
    })();
    return () => {
      current = false;
    };
  }, [authored, runtime, signature]);

  return null;
}

/** The inspector's locks as holds: the view declines the device's writes to
 * a locked animatable or component while it stays locked. */
function RuntimeHoldBridge() {
  const { runtime } = useVizijRuntime();
  const locked = useBindingAuthoring((state) => state.lockedInspectorTargetIds);
  const heldRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!runtime) {
      return;
    }
    const { hold, release } = heldOutputChanges(heldRef.current, locked);
    if (release.length > 0) {
      runtime.release(release);
    }
    if (hold.length > 0) {
      runtime.hold(hold);
    }
    heldRef.current = new Set(locked);
  }, [locked, runtime]);

  return null;
}

function RuntimeStatusDebug() {
  const { status, error, vizijId, description } = useVizijRuntime();
  const graphCount = description?.graphs.length ?? 0;
  const outputCount = Object.keys(description?.animatables ?? {}).length;
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[vizij-runtime][viewer]", {
        status,
        vizijId,
        error,
        graphs: graphCount,
        outputs: outputCount,
      });
    }
  }, [error, graphCount, outputCount, status, vizijId]);
  return (
    <div
      data-testid="main-runtime-status"
      className="absolute bottom-2 right-2 z-10 rounded bg-black/60 px-2 py-1 text-[10px] text-white"
    >
      {`runtime: ${status} | vizij: ${vizijId} | graphs: ${graphCount} | outputs: ${outputCount}`}
    </div>
  );
}

/**
 * The motion-graph editor's program on the face, while it plays: the editor
 * runs it (`MotionGraphDriverBridge`), its input sources write the store, and
 * the sampler reads its outputs. When it stops, or another program takes its
 * place, the keys its outputs wrote return to rest (`reset_keys` of
 * `outputKeys`); a pause leaves them holding.
 */
function MotionGraphRuntimeBridge({
  controllerId = null,
  playbackState = "stopped",
  nodes,
  edges,
  plotActive = false,
}: {
  controllerId?: string | null;
  playbackState?: "playing" | "paused" | "stopped";
  nodes?: EditorNode[] | null;
  edges?: EditorEdge[] | null;
  plotActive?: boolean;
}) {
  const { runtime } = useVizijRuntime();
  const previousSessionRef = useRef<{
    controllerId: string | null;
    playbackState: "playing" | "paused" | "stopped";
    spec: GraphSpec | null;
  }>({
    controllerId: null,
    playbackState: "stopped",
    spec: null,
  });
  const active =
    playbackState === "playing" &&
    Boolean(controllerId) &&
    Array.isArray(nodes) &&
    Array.isArray(edges);
  const spec = useMemo(
    () =>
      Array.isArray(nodes) && Array.isArray(edges)
        ? (buildGraphSpec(nodes, edges).spec as unknown as GraphSpec)
        : null,
    [edges, nodes],
  );

  useEffect(() => {
    const previous = previousSessionRef.current;
    const targetChanged =
      previous.controllerId !== null && previous.controllerId !== controllerId;
    const transitionedToStopped =
      previous.controllerId !== null &&
      previous.playbackState !== "stopped" &&
      playbackState === "stopped";
    if ((targetChanged || transitionedToStopped) && previous.spec && runtime) {
      const stoppedSpec = previous.spec;
      void (async () => {
        try {
          const keys = await outputKeys(stoppedSpec);
          if (keys.length > 0) {
            await runtime.invoke("reset_keys", { keys: { strs: keys } });
          }
        } catch (error) {
          console.warn("[motiongraph] resetting the program's outputs", error);
        }
      })();
    }
    previousSessionRef.current = { controllerId, playbackState, spec };
  }, [controllerId, playbackState, runtime, spec]);

  return (
    <>
      <InputValueBridge active={active} nodes={nodes ?? undefined} />
      <MotionGraphDriverBridge
        active={active}
        controllerId={controllerId ?? undefined}
        nodes={nodes ?? undefined}
        edges={edges ?? undefined}
      />
      <MotionGraphValueSampler active={active && plotActive} />
    </>
  );
}

export interface ViewerProps {
  rootId: string | null;
  /** The loaded face's bundle, into which the authored graphs go. */
  bundle: VizijBundleExtension | null;
  runtimeEnabled?: boolean;
  animationSourceActive?: boolean;
  animationRuntimeClip?: AnimationClipIR | null;
  animationTransportSessionKey?: number;
  motionGraphRuntimeNodes?: EditorNode[] | null;
  motionGraphRuntimeEdges?: EditorEdge[] | null;
  motionGraphPlaybackState?: "playing" | "paused" | "stopped";
  motionGraphRuntimeControllerId?: string | null;
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
  toneMapping?: ToneMappingMode;
  onImportClick: () => void;
  onLoadQuori: () => void;
  presetLoadOptions?: readonly FacePresetAssetOption[];
  onLoadPresetAsset?: (preset: FacePresetAssetOption) => void;
}

type FaceBounds = {
  center: { x: number; y: number };
  size: { x: number; y: number };
};

/**
 * The main viewport: where the main face draws on the page's canvas, with
 * the bridges that drive it from the document and the editors. Presses on
 * the face pass through to the canvas, which picks; the chips and buttons
 * over it keep theirs.
 */
export function Viewer({
  rootId,
  bundle,
  runtimeEnabled = true,
  animationSourceActive = true,
  animationRuntimeClip = null,
  animationTransportSessionKey = 0,
  motionGraphRuntimeNodes = null,
  motionGraphRuntimeEdges = null,
  motionGraphPlaybackState = "stopped",
  motionGraphRuntimeControllerId = null,
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
  toneMapping = "none",
  onImportClick,
  onLoadQuori,
  presetLoadOptions,
  onLoadPresetAsset,
}: ViewerProps) {
  const face = useOptionalVizijRuntime();
  const faceBoundsOverlayVisible = useWorkspaceStore(
    (state) => state.faceBoundsOverlayVisible,
  );
  const runtimeWarning = useGraphRuntime((state) => state.graphWarning);
  const runtimeError = useGraphRuntime((state) => state.graphError);
  const plotActive = useEditorStore((state) => state.plotActive);
  const managedStandardInputs = useBindingAuthoring(
    (state) => state.managedStandardInputs,
  );
  const applyStandardInputBatch = useBindingAuthoring(
    (state) => state.applyStandardInputBatch,
  );
  const stopAnimationTimeline = useAnimationStore((state) => state.stop);
  const authoredBounds = useGraphRuntime((state) => {
    if (!rootId) {
      return undefined;
    }
    const entry = state.world[rootId] as
      | { type?: string; rootBounds?: FaceBounds }
      | undefined;
    return entry?.type === "group" ? entry.rootBounds : undefined;
  });

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

  const handlePick = useCallback(
    ({ elementId }: Pick) => {
      if (elementId) {
        onSelectScene?.(elementId);
      } else {
        onClearSelection();
      }
    },
    [onClearSelection, onSelectScene],
  );

  const selection = useMemo(
    () => (showSelectionGlow && selectedSceneId ? [selectedSceneId] : []),
    [selectedSceneId, showSelectionGlow],
  );

  return (
    <main
      data-testid="main-viewer"
      className="h-full w-full relative overflow-hidden"
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
        {rootId && runtimeEnabled ? (
          face ? (
            <>
              {onRuntimeInputsReady ? (
                <RuntimeInputCatalogBridge
                  onRuntimeInputsReady={onRuntimeInputsReady}
                />
              ) : null}
              <RuntimeGraphBridge bundle={bundle} />
              <RuntimeHoldBridge />
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
                  showSafeArea={faceBoundsOverlayVisible}
                  selection={selection}
                  toneMapping={toneMapping}
                  bounds={authoredBounds}
                  onPick={handlePick}
                />
              </div>
              {face.error ? (
                <div
                  data-testid="main-runtime-error"
                  className="absolute inset-x-0 bottom-12 z-10 mx-auto w-fit max-w-lg rounded-md border border-red-800/60 bg-red-950/80 px-3 py-2 text-xs font-semibold text-red-200 shadow-lg"
                >
                  {face.error.message}
                </div>
              ) : null}
            </>
          ) : null
        ) : rootId ? (
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
            className="flex flex-col items-center h-full overflow-y-auto text-text-primary gap-5 p-6 text-center animate-in fade-in duration-700 pointer-events-auto"
          >
            <div className="flex flex-col gap-2">
              <p className="text-text-primary font-medium text-lg">
                See What Vizij Can Do
              </p>
              <p className="text-sm max-w-md mx-auto text-text-muted">
                Move your cursor over the face, tap an emotion, or make it speak
                — then load a Vizij asset (.glb) below to begin rigging and
                composing your own scene.
              </p>
            </div>
            <EmptyStateDemo />
            <div className="flex w-full max-w-3xl flex-col items-center gap-3 border-t border-border-default/40 pt-4">
              <p className="text-text-primary font-medium text-lg">
                Get Started
              </p>
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
