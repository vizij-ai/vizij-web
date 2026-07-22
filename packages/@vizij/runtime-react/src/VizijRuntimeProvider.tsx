import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PropsWithChildren, ReactNode } from "react";
import {
  VizijContext,
  createVizijStore,
  type VizijStore,
  type VizijBundleExtension,
  loadGLTFWithBundle,
  loadGLTFFromBlobWithBundle,
} from "@vizij/render";
import { valueAsNumber, type ValueJSON } from "@vizij/value-json";
import { getLookup, type AnimatableValue, type RawValue } from "@vizij/utils";
import { loadAnimationModule } from "@vizij/animation-module";
import {
  DeviceSlot,
  RUN_PERIOD_MS,
  ensureWasmInit,
  isGoldenPath,
} from "./engine/aroraEngine";
import { composeGraphSpecs, type GraphSource } from "./utils/composeGraph";
import type {
  GraphRegistrationConfig,
  MergeStrategyOptions,
  ShapeJSON,
  AnimationRegistrationConfig,
  ControllerId,
} from "./types";
import { VizijRuntimeContext } from "./context";
import {
  clearRuntimeDebugState,
  setRuntimeDebugState,
} from "./memoryInvestigation";
import {
  applyRuntimeGraphBundle,
  resolveRuntimeUpdatePlan,
  type RuntimeGraphBundle,
  type RuntimeUpdateTier,
} from "./updatePolicy";
import type {
  AnimateValueOptions,
  AnimationPlaybackState,
  InputDriverFactory,
  InputDriverLifecycle,
  PlayAnimationOptions,
  ProgramPlaybackState,
  StopAnimationOptions,
  StopProgramOptions,
  RuntimeError,
  VizijAssetBundle,
  VizijAnimationAsset,
  VizijProgramAsset,
  AnimationClipLike,
  VizijRuntimeContextValue,
  VizijRuntimeProviderProps,
  VizijRuntimeStatus,
  RuntimeOutputWrite,
} from "./types";
import {
  collectInputPathMap,
  collectInputPaths,
  collectOutputPaths,
} from "./utils/graph";
import { buildPoseWeightPathMap, buildRigInputPath } from "./utils/posePaths";
import {
  resolvePoseControlInputPath,
  shouldUseLegacyPoseWeightFallback,
} from "./utils/poseRuntime";
import { resolveClipDurationSeconds } from "./utils/clipPlayback";
import {
  collectAnimationClipOutputPaths,
  resolveAnimationBridgeOutputPaths,
} from "./utils/animationBridge";
import { valueJSONToRaw } from "./utils/valueConversion";
import { AnimationModuleHost } from "./engine/animationModuleHost";
import type { DeviceModule } from "./engine/aroraEngine";
import {
  ANIMATION_PLAYERS_PATH,
  animationsGraphSource,
  decodePlayerStates,
  type StoredAnimationClipLike,
} from "./engine/animationModule";
import {
  isRuntimeDebugEnabled,
  resolveEasing,
  findRootId,
  normalisePath,
  extractInputConstraints,
  namespaceTypedPath,
  stripNamespace,
  namespaceControllerId,
  namespaceSubscriptions,
  namespaceGraphSpec,
  stripNulls,
  now,
  inferImplicitPause,
  resolveGraphSpec,
  convertExtractedAnimations,
  pickExtractedAnimations,
  convertBundlePrograms,
  deriveProgramInputSeedValues,
  mergeAssetBundle,
  toStoredAnimationClip,
  type ExtractedAnimationClip,
} from "./core/helpers";

// Re-exported for existing importers (tests, downstream helpers); the
// canonical home is ./core/helpers.
export {
  resolveConstraintDefault,
  deriveProgramInputSeedValues,
  mergeAssetBundle,
} from "./core/helpers";

type ProviderProps = PropsWithChildren<VizijRuntimeProviderProps>;

type AnimationState = {
  path: string;
  from: number;
  to: number;
  duration: number;
  elapsed: number;
  easing: (t: number) => number;
  resolve: () => void;
};

type ClipPlaybackState = {
  id: string;
  /** Clip-derived length in seconds; the device feedback refines it. */
  duration: number;
  speed: number;
  weight: number;
  loop: boolean;
  playing: boolean;
  resolve: (() => void) | null;
  completion: Promise<void> | null;
};

type ProgramTransportState = {
  id: string;
  state: ProgramPlaybackState["state"];
};

type LoopMode = "active" | "idle-visible" | "idle-hidden" | "stopped";

const ACTIVE_GRACE_MS = 250;
const VISIBLE_IDLE_FPS = 30;
const HIDDEN_IDLE_FPS = 1;

const DEFAULT_MERGE: MergeStrategyOptions = {
  outputs: "add",
  intermediate: "add",
};

const DEFAULT_DURATION = 0.35;
const POSE_CONTROL_BRIDGE_EPSILON = 1e-6;
let runtimeDebugInstanceSequence = 0;
export function VizijRuntimeProvider({
  assetBundle,
  children,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier = "auto",
  autoCreate = true,
  autostart = false,
  driveRuntime = true,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
  transformOutputWrite,
}: ProviderProps) {
  const storeRef = useRef<VizijStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createVizijStore();
  }

  // The engine is an Arora device owned by this provider; every provider is
  // isolated (its own device, its own store namespace).
  return (
    <VizijContext.Provider value={storeRef.current}>
      <VizijRuntimeProviderInner
        assetBundle={assetBundle}
        namespace={namespaceProp}
        faceId={faceIdProp}
        updateTier={updateTier}
        autoCreate={autoCreate}
        autostart={autostart}
        driveRuntime={driveRuntime}
        mergeStrategy={mergeStrategy}
        onRegisterControllers={onRegisterControllers}
        onStatusChange={onStatusChange}
        transformOutputWrite={transformOutputWrite}
        store={storeRef.current}
      >
        {children}
      </VizijRuntimeProviderInner>
    </VizijContext.Provider>
  );
}

type VizijRuntimeProviderInnerProps = {
  assetBundle: VizijAssetBundle;
  namespace?: string;
  faceId?: string;
  updateTier: RuntimeUpdateTier;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  transformOutputWrite?: (
    write: RuntimeOutputWrite,
  ) => RuntimeOutputWrite | null;
  store: VizijStore;
  children: ReactNode;
  autoCreate: boolean;
  autostart: boolean;
  driveRuntime: boolean;
};

function VizijRuntimeProviderInner({
  assetBundle: initialAssetBundle,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
  transformOutputWrite,
  store,
  children,
  autoCreate,
  autostart,
  driveRuntime,
}: VizijRuntimeProviderInnerProps) {
  const [assetBundleOverride, setAssetBundleOverride] =
    useState<VizijAssetBundle | null>(null);
  const [graphUpdateToken, setGraphUpdateToken] = useState(0);
  const effectiveAssetBundle = assetBundleOverride ?? initialAssetBundle;
  const latestEffectiveAssetBundleRef =
    useRef<VizijAssetBundle>(effectiveAssetBundle);
  const [extractedBundle, setExtractedBundle] =
    useState<VizijBundleExtension | null>(() => {
      if (effectiveAssetBundle.bundle) {
        return effectiveAssetBundle.bundle;
      }
      if (
        effectiveAssetBundle.glb.kind === "world" &&
        effectiveAssetBundle.glb.bundle
      ) {
        return effectiveAssetBundle.glb.bundle;
      }
      return null;
    });
  const [extractedAnimations, setExtractedAnimations] = useState<
    VizijAnimationAsset[]
  >([]);
  const previousBundleRef = useRef<VizijAssetBundle | null>(null);
  const suppressNextBundlePlanRef = useRef(false);
  const pendingPlanRef = useRef<ReturnType<
    typeof resolveRuntimeUpdatePlan
  > | null>(null);
  const updateTierRef = useRef<RuntimeUpdateTier>(updateTier);

  useEffect(() => {
    if (effectiveAssetBundle.bundle) {
      setExtractedBundle(effectiveAssetBundle.bundle);
      return;
    }
    if (effectiveAssetBundle.glb.kind === "world") {
      setExtractedBundle(effectiveAssetBundle.glb.bundle ?? null);
    } else {
      setExtractedBundle(null);
    }
  }, [effectiveAssetBundle]);

  useEffect(() => {
    updateTierRef.current = updateTier;
  }, [updateTier]);

  const assetBundle = useMemo(
    () =>
      mergeAssetBundle(
        effectiveAssetBundle,
        extractedBundle,
        extractedAnimations,
      ),
    [effectiveAssetBundle, extractedBundle, extractedAnimations],
  );

  useEffect(() => {
    latestEffectiveAssetBundleRef.current = effectiveAssetBundle;
  }, [effectiveAssetBundle]);

  useEffect(() => {
    if (suppressNextBundlePlanRef.current) {
      suppressNextBundlePlanRef.current = false;
      previousBundleRef.current = effectiveAssetBundle;
      return;
    }
    const plan = resolveRuntimeUpdatePlan(
      previousBundleRef.current,
      effectiveAssetBundle,
      updateTierRef.current,
    );
    pendingPlanRef.current = plan;
    previousBundleRef.current = effectiveAssetBundle;
    if (plan.reregisterGraphs) {
      setGraphUpdateToken((prev) => prev + 1);
    }
  }, [effectiveAssetBundle]);

  // The engine: one Arora device per provider, its behavior the composed
  // Vizij graph. The slot dedupes creation and carries the store across
  // graph recompositions (see engine/aroraEngine.ts).
  const deviceSlotRef = useRef<DeviceSlot | null>(null);
  if (!deviceSlotRef.current) {
    deviceSlotRef.current = new DeviceSlot();
  }
  const deviceSlot = deviceSlotRef.current;
  const [ready, setReady] = useState(false);
  /**
   * Specs currently composed into the device's ONE graph, in evaluation order.
   * Every (un)registration recomposes, swapping the device's graph in place.
   * Where each source comes from:
   *
   * - **rig** — the loaded asset bundle's rig graph (authored into the GLB):
   *   maps rig input paths to the face's morph/bone/material writes.
   * - **pose** — the bundle's pose-driver graph (`assetBundle.pose.graph`, or
   *   the `pose-driver`/`pose` graph picked from the bundle): turns high-level
   *   pose controls into rig-input writes. When both rig and pose are present
   *   they register as one merged source (`registerMergedGraph`).
   * - **one source per playing program** (`playProgram`): procedural graphs
   *   from the bundle's `programs`, plus the authoring motiongraph — the
   *   editor publishes its graph as a program so it evaluates on the device.
   * - **animations** — a single source (`animationsGraphSource`) registered
   *   whenever any clip is playing: an `ExternalFunction` node that steps the
   *   animation module every device tick off the golden `arora/dt`. Clips
   *   register into the module as data (via the call surface) with their
   *   final store keys resolved at load, the module samples them inside the
   *   device, and the source's path-less `output` node applies the sampled
   *   batch onto those keys — no JS touches the per-tick path (VIZ-61).
   */
  const graphSourcesRef = useRef<GraphSource[]>([]);

  const namespace = namespaceProp ?? assetBundle.namespace ?? "default";
  const faceId =
    faceIdProp ??
    assetBundle.faceId ??
    assetBundle.pose?.config?.faceId ??
    assetBundle.pose?.config?.faceId ??
    undefined;
  /** The current face id, readable from callbacks constructed once. */
  const faceIdRef = useRef<string | undefined>(faceId);
  faceIdRef.current = faceId;

  const [status, setStatus] = useState<VizijRuntimeStatus>({
    loading: true,
    ready: false,
    error: null,
    errors: [],
    namespace,
    faceId,
    rootId: null,
    outputPaths: [],
    stepHz: undefined,
    controllers: { graphs: [], anims: [] },
  });

  const runtimeDebugInstanceIdRef = useRef(
    `vizij-runtime:${runtimeDebugInstanceSequence++}`,
  );
  const errorsRef = useRef<RuntimeError[]>([]);
  // namespaced output paths exposed via status
  const outputPathsRef = useRef<Set<string>>(new Set());
  // base (unnamespaced) output paths used for renderer/world mapping
  const baseOutputPathsRef = useRef<Set<string>>(new Set());
  const namespacedOutputPathsRef = useRef<Set<string>>(new Set());
  const namespaceRef = useRef(namespace);
  const driveRuntimeRef = useRef(driveRuntime);
  const rigInputMapRef = useRef<Record<string, string>>({});
  const rigPoseControlInputIdsRef = useRef<Set<string>>(new Set());
  const registeredGraphsRef = useRef<string[]>([]);
  const registeredAnimationsRef = useRef<string[]>([]);
  const mergedGraphRef = useRef<string | null>(null);
  const poseControlBridgeValuesRef = useRef<Map<string, number>>(new Map());
  const poseWeightFallbackMap = useMemo(() => {
    const map = new Map<string, Record<string, number>>();
    const poseConfig = assetBundle.pose?.config;
    if (!poseConfig) {
      return map;
    }
    const posePaths = buildPoseWeightPathMap(
      poseConfig.poses ?? [],
      poseConfig.faceId ?? faceId ?? "face",
    );
    (poseConfig.poses ?? []).forEach((pose) => {
      const posePath = posePaths.get(pose.id);
      if (!posePath) {
        return;
      }
      const values = Object.fromEntries(
        Object.entries(pose.values ?? {}).filter(([, value]) =>
          Number.isFinite(value),
        ),
      ) as Record<string, number>;
      map.set(posePath, values);
    });
    return map;
  }, [assetBundle.pose?.config, faceId]);
  const useLegacyPoseWeightFallback = useMemo(
    () => shouldUseLegacyPoseWeightFallback(Boolean(assetBundle.pose?.graph)),
    [assetBundle.pose?.graph],
  );
  const resolvedProgramAssets = useMemo(
    () =>
      assetBundle.programs && assetBundle.programs.length > 0
        ? assetBundle.programs
        : convertBundlePrograms(assetBundle.bundle?.graphs),
    [assetBundle.bundle?.graphs, assetBundle.programs],
  );
  const [inputConstraints, setInputConstraints] = useState<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const inputConstraintsRef = useRef<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const avgStepDtRef = useRef<number | null>(null);
  const inputDriverIdsRef = useRef<Set<string>>(new Set());

  const animationTweensRef = useRef<Map<string, AnimationState>>(new Map());
  // Minimal per-clip transport state. The device OWNS clip sampling and time
  // (the animation module); this map exists for the control surface defaults,
  // loop-mode decisions, and the play() completion promise. The playhead and
  // real duration come from the module's player_states feedback
  // (ANIMATION_PLAYERS_PATH).
  const clipPlaybackRef = useRef<Map<string, ClipPlaybackState>>(new Map());
  const programPlaybackRef = useRef<Map<string, ProgramTransportState>>(
    new Map(),
  );
  const programControllerIdsRef = useRef<Map<string, string>>(new Map());
  // Device-side animation playback: the module's guest state as the runtime
  // sees it (loaded clips, players, instances). Lazily constructed once the
  // module artifact is available; reads the live device from the slot.
  const animationModuleRef = useRef<DeviceModule | null>(null);
  const animationHostRef = useRef<AnimationModuleHost | null>(null);
  // Whether the animations graph source is composed into the device.
  const animationsSourceRegisteredRef = useRef(false);
  // Capability-gap warnings already emitted (once each) — see warnAnimationGap.
  const animationGapWarnedRef = useRef<Set<string>>(new Set());
  const animationSystemActiveRef = useRef(true);
  const stagedInputsRef = useRef<
    Map<string, { value: ValueJSON; shape?: ShapeJSON }>
  >(new Map());
  const autostartRef = useRef(autostart);
  const lastActivityTimeRef = useRef<number>(now());
  const [loopMode, setLoopMode] = useState<LoopMode>("stopped");
  const loopModeRef = useRef<LoopMode>("stopped");
  useEffect(() => {
    loopModeRef.current = loopMode;
  }, [loopMode]);
  const runtimeMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      runtimeMountedRef.current = false;
    };
  }, []);

  const publishRuntimeDebugState = useCallback(() => {
    const storeState = store.getState();
    setRuntimeDebugState(runtimeDebugInstanceIdRef.current, {
      namespace,
      faceId: faceId ?? null,
      rootId: status.rootId,
      ready: status.ready,
      loading: status.loading,
      autostart,
      driveRuntime,
      loopMode,
      outputCount: status.outputPaths.length,
      graphControllerCount: status.controllers.graphs.length,
      animationControllerCount: status.controllers.anims.length,
      registeredGraphCount: registeredGraphsRef.current.length,
      registeredAnimationCount: registeredAnimationsRef.current.length,
      programControllerCount: programControllerIdsRef.current.size,
      animationTweenCount: animationTweensRef.current.size,
      clipPlaybackCount: clipPlaybackRef.current.size,
      programPlaybackCount: programPlaybackRef.current.size,
      stagedInputCount: stagedInputsRef.current.size,
      activeDriverCount: inputDriverIdsRef.current.size,
      worldEntryCount: Object.keys(storeState.world ?? {}).length,
      animatableCount: Object.keys(storeState.animatables ?? {}).length,
      valuesSize:
        storeState.values instanceof Map ? storeState.values.size : null,
      stepHz: status.stepHz ?? null,
    });
  }, [
    autostart,
    driveRuntime,
    faceId,
    loopMode,
    namespace,
    status.controllers.anims.length,
    status.controllers.graphs.length,
    status.loading,
    status.outputPaths.length,
    status.ready,
    status.rootId,
    status.stepHz,
    store,
  ]);

  useEffect(() => {
    publishRuntimeDebugState();
    const unsubscribe = store.subscribe(() => {
      publishRuntimeDebugState();
    });
    return () => {
      unsubscribe();
      clearRuntimeDebugState(runtimeDebugInstanceIdRef.current);
    };
  }, [publishRuntimeDebugState, store]);

  useEffect(() => {
    const rigAsset = assetBundle.rig;
    if (!rigAsset) {
      inputConstraintsRef.current = {};
      setInputConstraints({});
      return;
    }

    const rigSpec = resolveGraphSpec(
      rigAsset,
      `${rigAsset.id ?? "rig"} graph (constraints)`,
    );

    const constraints = extractInputConstraints(
      rigSpec as GraphRegistrationConfig["spec"],
      rigAsset.inputMetadata,
      namespace,
    );
    inputConstraintsRef.current = constraints;
    setInputConstraints(constraints);

    // Intentionally no logging here to keep runtime console quiet.
  }, [assetBundle.rig, namespace]);

  const requestLoopMode = useCallback((mode: LoopMode) => {
    if (!runtimeMountedRef.current) {
      return;
    }
    setLoopMode((prev) => (prev === mode ? prev : mode));
  }, []);

  const hasActiveAnimations = useCallback(() => {
    if (animationTweensRef.current.size > 0) {
      return true;
    }
    if (!animationSystemActiveRef.current) {
      for (const state of programPlaybackRef.current.values()) {
        if (state.state === "playing") {
          return true;
        }
      }
      return false;
    }
    for (const state of clipPlaybackRef.current.values()) {
      if (state.playing) {
        return true;
      }
    }
    for (const state of programPlaybackRef.current.values()) {
      if (state.state === "playing") {
        return true;
      }
    }
    return false;
  }, []);

  const computeDesiredLoopMode = useCallback((): LoopMode => {
    const hasAnimations = hasActiveAnimations();
    const recentlyActive =
      now() - lastActivityTimeRef.current <= ACTIVE_GRACE_MS;
    if (autostartRef.current && (hasAnimations || recentlyActive)) {
      return "active";
    }
    if (autostartRef.current) {
      return "idle-visible";
    }
    return "idle-hidden";
  }, [hasActiveAnimations]);

  const updateLoopMode = useCallback(() => {
    requestLoopMode(computeDesiredLoopMode());
  }, [computeDesiredLoopMode, requestLoopMode]);

  const markActivity = useCallback(() => {
    lastActivityTimeRef.current = now();
    updateLoopMode();
  }, [updateLoopMode]);

  const setInput = useCallback(
    (path: string, value: ValueJSON, shape?: ShapeJSON) => {
      const numericValue = valueAsNumber(value);
      const basePath = stripNamespace(
        normalisePath(path),
        namespaceRef.current,
      );
      const poseValues =
        useLegacyPoseWeightFallback && numericValue != null
          ? poseWeightFallbackMap.get(basePath)
          : undefined;
      if (poseValues && numericValue != null) {
        const poseFaceId = assetBundle.pose?.config?.faceId ?? faceId ?? "face";
        const rigMap = rigInputMapRef.current;
        Object.entries(poseValues).forEach(([inputId, poseValue]) => {
          if (!Number.isFinite(poseValue)) {
            return;
          }
          const controlPath =
            resolvePoseControlInputPath({
              inputId,
              basePath: buildRigInputPath(
                poseFaceId,
                `/pose/control/${inputId}`,
              ),
              rigInputPathMap: rigMap,
              hasNativePoseControlInput: true,
            }) ?? buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
          setInput(controlPath, { float: Number(poseValue) * numericValue });
        });
        return;
      }
      markActivity();
      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      if (
        isRuntimeDebugEnabled() &&
        (namespacedPath.includes("animation/authoring.timeline.main") ||
          namespacedPath.endsWith("/blink"))
      ) {
        console.log("[vizij-runtime] stage input", {
          path,
          namespacedPath,
          value,
        });
      }
      stagedInputsRef.current.set(namespacedPath, { value, shape });
    },
    [
      assetBundle.pose?.config?.faceId,
      faceId,
      markActivity,
      poseWeightFallbackMap,
      useLegacyPoseWeightFallback,
    ],
  );

  const reportStatus = useCallback(
    (updater: (prev: VizijRuntimeStatus) => VizijRuntimeStatus) => {
      setStatus((prev) => {
        const next = updater(prev);
        onStatusChange?.(next);
        return next;
      });
    },
    [onStatusChange],
  );

  const pushError = useCallback(
    (error: RuntimeError) => {
      errorsRef.current = [...errorsRef.current, error];
      reportStatus((prev) => ({
        ...prev,
        error,
        errors: errorsRef.current,
      }));
      console.warn("[vizij-runtime]", error.message, error.cause);
    },
    [reportStatus],
  );

  const resetErrors = useCallback(() => {
    errorsRef.current = [];
    reportStatus((prev) => ({
      ...prev,
      error: null,
      errors: [],
    }));
  }, [reportStatus]);

  useEffect(() => {
    autostartRef.current = autostart;
    updateLoopMode();
  }, [autostart, updateLoopMode]);

  // ---------------------------------------------------------------------------
  // The engine surface, device-backed. The call shapes (synchronous
  // registration returning ids, snapshot getters) are implemented over the
  // single Arora device: registered graphs accumulate as sources in
  // graphSourcesRef, and every registration change recomposes the one graph,
  // swapped into the running device in place (engine/aroraEngine.ts).
  // Animations tick INSIDE the device: the animation module samples the loaded
  // clips each step and the "animations" source drives it (see the
  // graphSourcesRef provenance note and engine/animationModule*.ts).
  // ---------------------------------------------------------------------------

  /** Writes made before the device is live, replayed when it boots. */
  const pendingWritesRef = useRef<Map<string, ValueJSON>>(new Map());

  /** The live device, or null before it boots. */
  const getDevice = useCallback(
    () => deviceSlot.current?.device ?? null,
    [deviceSlot],
  );

  /**
   * The animation module host, constructed once the module artifact has
   * loaded. Also arms the slot: every device this slot boots loads the
   * module, and a rebuilt device replays the host's setup calls (module
   * guest state does not survive a rebuild).
   */
  const ensureAnimationHost = useCallback((): AnimationModuleHost | null => {
    if (!animationModuleRef.current) {
      return null;
    }
    if (!animationHostRef.current) {
      // Clip conversion resolves each track's final store keys at LOAD time
      // (the same routing the JS pipeline used per tick), so the module's
      // outputs name the rig paths directly and the graph applies them.
      animationHostRef.current = new AnimationModuleHost(getDevice, (key) =>
        resolveAnimationBridgeOutputPaths(
          key,
          faceIdRef.current ?? undefined,
          rigInputMapRef.current,
        ),
      );
    }
    return animationHostRef.current;
  }, [getDevice]);
  /** Applies a step's drained store changes to the render store; bound below. */
  const applyEngineChangesRef = useRef<
    (changes: Record<string, ValueJSON | null>) => void
  >(() => {});

  const recomposeDevice = useCallback(() => {
    const spec = composeGraphSpecs(graphSourcesRef.current);
    deviceSlot
      .recompose(spec)
      .then((handle) => {
        if (pendingWritesRef.current.size > 0) {
          handle.device.writeValues(
            Object.fromEntries(pendingWritesRef.current),
          );
          pendingWritesRef.current.clear();
        }
      })
      .catch((err: unknown) => {
        pushError({
          message: "Failed to (re)compose the arora device",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
  }, [deviceSlot, pushError]);

  /** `ready` = wasm loaded; the device itself boots on first registration. */
  const initEngine = useCallback(async () => {
    await ensureWasmInit();
    setReady(true);
  }, []);

  // Load the animation module when the bundle carries animations, and arm the
  // device slot with it. The slot is told the load is in flight right away —
  // boots wait for it, so the device is always built WITH the module (a live
  // device cannot load one; a changed module set forces a rebuild).
  // `onDeviceStarted` replays the host's setup calls into a rebuilt device,
  // whose module guest state starts from scratch.
  const hasBundleAnimations = (assetBundle.animations?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasBundleAnimations || animationModuleRef.current) {
      return;
    }
    let cancelled = false;
    const loading = loadAnimationModule()
      .then((module) => {
        if (cancelled) {
          return;
        }
        animationModuleRef.current = module;
        deviceSlot.setModules([module]);
        deviceSlot.onDeviceStarted = (handle) => {
          animationHostRef.current?.replayInto(handle.device);
        };
        ensureAnimationHost();
      })
      .catch((err: unknown) => {
        pushError({
          message: "Failed to load the animation module",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
    deviceSlot.waitForModules(loading);
    return () => {
      cancelled = true;
    };
  }, [deviceSlot, ensureAnimationHost, hasBundleAnimations, pushError]);

  const removeGraph = useCallback(
    (id: ControllerId) => {
      graphSourcesRef.current = graphSourcesRef.current.filter(
        (s) => s.sourceId !== id && !s.sourceId.startsWith(`${id}#`),
      );
      recomposeDevice();
    },
    [recomposeDevice],
  );

  const registerGraph = useCallback(
    (cfg: GraphRegistrationConfig): string => {
      const id = cfg.id ?? `graph-${graphSourcesRef.current.length}`;
      graphSourcesRef.current = [
        ...graphSourcesRef.current.filter((s) => s.sourceId !== id),
        { sourceId: id, spec: cfg.spec ?? {} },
      ];
      recomposeDevice();
      return id;
    },
    [recomposeDevice],
  );

  /**
   * A merged registration becomes one source per member graph under the
   * merged id (`id#member`); composition is last-writer-wins, so `strategy`
   * is accepted but unused (see utils/composeGraph.ts).
   */
  const registerMergedGraph = useCallback(
    (cfg: {
      id?: string;
      graphs: GraphRegistrationConfig[];
      strategy?: MergeStrategyOptions;
    }): string => {
      const id = cfg.id ?? `merged-${graphSourcesRef.current.length}`;
      const members = cfg.graphs.map((graph, index) => ({
        sourceId: `${id}#${graph.id ?? index}`,
        spec: graph.spec ?? {},
      }));
      graphSourcesRef.current = [
        ...graphSourcesRef.current.filter(
          (s) => s.sourceId !== id && !s.sourceId.startsWith(`${id}#`),
        ),
        ...members,
      ];
      recomposeDevice();
      return id;
    },
    [recomposeDevice],
  );

  /**
   * Animations are device data: registration returns a stable id (the
   * clip's) and the clip's payload is handed to the module host in
   * `registerControllers` via `host.setClips`. The module — not JS — samples
   * the clip once it plays.
   */
  const registerAnimation = useCallback(
    (cfg: AnimationRegistrationConfig): string =>
      cfg.id ?? `animation-${registeredAnimationsRef.current.length}`,
    [],
  );

  const removeAnimation = useCallback((_id: ControllerId) => {}, []);

  /**
   * Compose (or drop) the single "animations" graph source, which makes the
   * animation module tick inside the device. Registered whenever any clip is
   * playing (the module has one engine, stepped whole), dropped when none is —
   * mirroring how a program source's lifecycle follows play/stop.
   */
  const setAnimationsSourceRegistered = useCallback(
    (registered: boolean) => {
      if (registered === animationsSourceRegisteredRef.current) {
        return;
      }
      animationsSourceRegisteredRef.current = registered;
      if (registered) {
        graphSourcesRef.current = [
          ...graphSourcesRef.current.filter(
            (s) => s.sourceId !== animationsGraphSource().sourceId,
          ),
          animationsGraphSource(),
        ];
      } else {
        graphSourcesRef.current = graphSourcesRef.current.filter(
          (s) => s.sourceId !== animationsGraphSource().sourceId,
        );
      }
      recomposeDevice();
    },
    [recomposeDevice],
  );

  const listControllers = useCallback(
    (): { graphs: ControllerId[]; anims: ControllerId[] } => ({
      graphs: [...registeredGraphsRef.current],
      anims: [...registeredAnimationsRef.current],
    }),
    [],
  );

  const deviceSetInput = useCallback(
    (path: string, value: ValueJSON, _shape?: ShapeJSON) => {
      const handle = deviceSlot.current;
      if (handle) {
        handle.device.setValue(path, value);
      } else {
        pendingWritesRef.current.set(path, value);
      }
    },
    [deviceSlot],
  );

  const getPathSnapshot = useCallback(
    (path: string): ValueJSON | undefined => {
      const handle = deviceSlot.current;
      if (!handle) {
        return pendingWritesRef.current.get(path);
      }
      return handle.device.readValues([path])[path] ?? undefined;
    },
    [deviceSlot],
  );

  // Whole-store snapshot (path → arora-serde Value, pass-through from the
  // device) for mirrors/bridges that forward every key — see the context doc.
  const getStoreSnapshot = useCallback(():
    | Record<string, unknown>
    | undefined => {
    const handle = deviceSlot.current;
    if (!handle) {
      return undefined;
    }
    return handle.device.snapshot() as Record<string, unknown>;
  }, [deviceSlot]);

  /** Listeners notified after each engine step's changes have been applied. */
  const stepListenersRef = useRef<Set<() => void>>(new Set());

  const subscribeToStep = useCallback((listener: () => void) => {
    const listeners = stepListenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  /**
   * One tick: pull the changed keys off the device and apply them to the
   * render store. A device under its own `run()` loop is already stepping —
   * only the drain happens here; a manually driven one is stepped first
   * (dt seconds → ms at exactly this boundary). The pull model renders only
   * what the changes touch — step-aligned consumers subscribe through
   * `subscribeToStep` and read the values they care about via
   * `getValueSnapshot`.
   */
  const stepRuntime = useCallback(
    (dt: number) => {
      const handle = deviceSlot.current;
      if (!handle) {
        return;
      }
      if (!handle.device.running) {
        handle.device.step(dt * 1000);
      }
      const changes = handle.device.drainChanges() as Record<
        string,
        ValueJSON | null
      >;
      applyEngineChangesRef.current(changes);
      // Fan this step's store changes to subscribers (e.g. the standalone's
      // native-store bridge): change-driven, so mirrors need no polling.
      if (storeChangeListenersRef.current.size > 0) {
        const paths = Object.keys(changes);
        if (paths.length > 0) {
          storeChangeListenersRef.current.forEach((listener) => {
            try {
              listener(changes);
            } catch (err) {
              console.error("[vizij-runtime] store-change listener error", err);
            }
          });
        }
      }
      stepListenersRef.current.forEach((listener) => {
        try {
          listener();
        } catch (err) {
          console.error("[vizij-runtime] step listener error", err);
        }
      });
    },
    [deviceSlot],
  );

  const storeChangeListenersRef = useRef(
    new Set<(changes: Record<string, unknown>) => void>(),
  );
  const subscribeToStoreChanges = useCallback(
    (listener: (changes: Record<string, unknown>) => void) => {
      const listeners = storeChangeListenersRef.current;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [],
  );

  const clearControllers = useCallback(() => {
    const existing = listControllers();
    existing.graphs.forEach((id: ControllerId) => {
      try {
        removeGraph(id);
      } catch (err: unknown) {
        pushError({
          message: `Failed to remove graph ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });
    existing.anims.forEach((id: ControllerId) => {
      try {
        removeAnimation(id);
      } catch (err: unknown) {
        pushError({
          message: `Failed to remove animation ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });
    registeredGraphsRef.current = [];
    registeredAnimationsRef.current = [];
    programControllerIdsRef.current.clear();
    mergedGraphRef.current = null;
    outputPathsRef.current = new Set();
    baseOutputPathsRef.current = new Set();
    namespacedOutputPathsRef.current = new Set();
    rigPoseControlInputIdsRef.current = new Set();
  }, [listControllers, removeAnimation, removeGraph, pushError]);

  useEffect(() => {
    namespaceRef.current = namespace;
    reportStatus((prev) => ({
      ...prev,
      namespace,
      faceId,
    }));
  }, [namespace, faceId, reportStatus]);

  useEffect(() => {
    driveRuntimeRef.current = driveRuntime;
  }, [driveRuntime]);

  // A driving provider hands its device to the device's own loop: it paces
  // itself (RUN_PERIOD_MS), and the JS loop below only pumps — tweens,
  // routing, staged-input flush, change drain. A non-driving provider leaves
  // the device manually stepped (step via forceRuntime). Once under run() a
  // device cannot be handed back: turning driveRuntime off later only stops
  // this provider's pump cadence from being the active one.
  useEffect(() => {
    deviceSlot.onRunEnded = (error: unknown) => {
      pushError({
        message: "The device's run loop ended: stepping failed",
        cause: error,
        phase: "engine",
        timestamp: performance.now(),
      });
    };
    if (driveRuntime) {
      deviceSlot.runPeriodMs = RUN_PERIOD_MS;
      deviceSlot.startRun();
    } else {
      deviceSlot.runPeriodMs = null;
    }
  }, [deviceSlot, driveRuntime, pushError]);

  const glbAsset = effectiveAssetBundle.glb;
  const baseBundle: VizijBundleExtension | null =
    effectiveAssetBundle.bundle ?? null;

  useEffect(() => {
    let cancelled = false;
    const plan = pendingPlanRef.current;
    if (plan && !plan.reloadAssets && status.rootId !== null) {
      reportStatus((prev) =>
        prev.loading ? { ...prev, loading: false } : prev,
      );
      return () => {
        cancelled = true;
      };
    }
    resetErrors();
    reportStatus((prev) => ({
      ...prev,
      loading: true,
      rootId: null,
      ready: false,
      outputPaths: [],
      controllers: { graphs: [], anims: [] },
    }));
    setExtractedAnimations([]);

    const loadAssets = async () => {
      try {
        let world: Record<string, any>;
        let animatables: Record<string, AnimatableValue>;
        let bundle: VizijBundleExtension | null = baseBundle;
        let gltfAnimations: ExtractedAnimationClip[] | undefined;

        if (glbAsset.kind === "url") {
          const loaded = await loadGLTFWithBundle(
            glbAsset.src,
            [namespace],
            glbAsset.aggressiveImport ?? false,
            glbAsset.rootBounds,
          );
          world = loaded.world as Record<string, any>;
          animatables = loaded.animatables;
          bundle = loaded.bundle ?? bundle;
          gltfAnimations = pickExtractedAnimations(loaded);
        } else if (glbAsset.kind === "blob") {
          const loaded = await loadGLTFFromBlobWithBundle(
            glbAsset.blob,
            [namespace],
            glbAsset.aggressiveImport ?? false,
            glbAsset.rootBounds,
          );
          world = loaded.world as Record<string, any>;
          animatables = loaded.animatables;
          bundle = loaded.bundle ?? bundle;
          gltfAnimations = pickExtractedAnimations(loaded);
        } else {
          world = glbAsset.world as Record<string, any>;
          animatables = glbAsset.animatables as Record<string, AnimatableValue>;
          bundle = glbAsset.bundle ?? bundle;
          gltfAnimations = undefined;
        }

        if (cancelled) {
          return;
        }

        setExtractedBundle(bundle ?? null);
        setExtractedAnimations(convertExtractedAnimations(gltfAnimations));

        const rootId = findRootId(world);
        store.getState().addWorldElements(world as any, animatables, true);

        // Clear the initial reloadAssets flag so the status.rootId dep
        // change doesn't re-trigger a full reload (infinite-loop guard).
        if (pendingPlanRef.current?.reloadAssets) {
          pendingPlanRef.current = {
            ...pendingPlanRef.current,
            reloadAssets: false,
          };
        }

        reportStatus((prev) => ({
          ...prev,
          loading: false,
          rootId,
          namespace,
          faceId,
        }));
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        pushError({
          message: "Failed to load Vizij assets",
          cause: err,
          phase: "assets",
          timestamp: performance.now(),
        });
        reportStatus((prev) => ({
          ...prev,
          loading: false,
        }));
      }
    };

    loadAssets();

    return () => {
      cancelled = true;
    };
  }, [
    glbAsset,
    baseBundle,
    namespace,
    faceId,
    store,
    pushError,
    reportStatus,
    resetErrors,
    setExtractedBundle,
    setExtractedAnimations,
    status.rootId,
  ]);

  useEffect(() => {
    if (!ready && autoCreate) {
      initEngine().catch((err: unknown) => {
        pushError({
          message: "Failed to initialize the engine",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
    }
  }, [ready, autoCreate, initEngine, pushError]);

  const registerControllers = useCallback(async () => {
    clearControllers();

    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registerControllers", {
        hasRig: Boolean(assetBundle.rig),
        hasPose: Boolean(assetBundle.pose?.graph),
        animationCount: assetBundle.animations?.length ?? 0,
        animationIds: (assetBundle.animations ?? []).map((anim) => anim.id),
        namespace,
      });
    }

    const baseOutputPaths = new Set<string>();
    const namespacedOutputPaths = new Set<string>();
    const recordOutputs = (paths: string[]) => {
      paths.forEach((path) => {
        const trimmed = path.trim();
        if (!trimmed) return;
        const basePath = stripNamespace(trimmed, namespace);
        baseOutputPaths.add(basePath);
        namespacedOutputPaths.add(namespaceTypedPath(trimmed, namespace));
      });
    };

    const graphConfigs: GraphRegistrationConfig[] = [];
    rigInputMapRef.current = {};
    rigPoseControlInputIdsRef.current = new Set();
    poseControlBridgeValuesRef.current.clear();

    const rigAsset = assetBundle.rig;
    if (rigAsset) {
      const rigSpec = resolveGraphSpec(
        rigAsset,
        `${rigAsset.id ?? "rig"} graph`,
      );
      if (!rigSpec) {
        pushError({
          message: "Rig graph is missing a usable spec or IR payload.",
          phase: "registration",
          timestamp: performance.now(),
        });
      } else {
        // Avoid logging here; browsers building DTS don't have `process` types.
        const rigOutputs = collectOutputPaths(rigSpec);
        const rigInputs = collectInputPaths(rigSpec);
        const rigPoseControlInputIds = new Set<string>();
        rigInputs.forEach((path) => {
          const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
            path.trim(),
          );
          const inputId = (poseControlMatch?.[1] ?? "").trim();
          if (inputId.length > 0) {
            rigPoseControlInputIds.add(inputId);
          }
        });
        rigInputMapRef.current = collectInputPathMap(rigSpec);
        rigPoseControlInputIdsRef.current = rigPoseControlInputIds;
        if (isRuntimeDebugEnabled()) {
          const blinkKeys = Object.keys(rigInputMapRef.current).filter((key) =>
            key.toLowerCase().includes("blink"),
          );
          const blinkMappings = blinkKeys
            .slice(0, 20)
            .map((key) => `${key} => ${rigInputMapRef.current[key] ?? "?"}`);
          console.log("[vizij-runtime] rig input map sample", {
            blink: rigInputMapRef.current["blink"] ?? null,
            blinkKeys: blinkKeys.slice(0, 12),
            blinkMappings: blinkMappings.join(" | "),
          });
        }
        recordOutputs(rigOutputs);

        const rigSubs = rigAsset.subscriptions ?? {
          inputs: rigInputs,
          outputs: rigOutputs,
        };

        // Source "rig": the bundle's rig graph (from the GLB) — rig input
        // paths → the face's morph/bone/material writes.
        graphConfigs.push({
          id: namespaceControllerId(rigAsset.id, namespace, "graph"),
          spec: stripNulls(namespaceGraphSpec(rigSpec, namespace)),
          subs: namespaceSubscriptions(rigSubs, namespace),
        });
      }
    }

    const poseGraphAsset = assetBundle.pose?.graph;
    if (poseGraphAsset) {
      const poseSpec = resolveGraphSpec(
        poseGraphAsset,
        `${poseGraphAsset.id ?? "pose"} graph`,
      );
      if (poseSpec) {
        const poseOutputs = collectOutputPaths(poseSpec);
        const poseInputs = collectInputPaths(poseSpec);
        recordOutputs(poseOutputs);

        const poseSubs = poseGraphAsset.subscriptions ?? {
          inputs: poseInputs,
          outputs: poseOutputs,
        };

        // Source "pose": the bundle's pose-driver graph — high-level pose
        // controls → rig-input writes (read back by the rig source above via
        // the shared store paths).
        graphConfigs.push({
          id: namespaceControllerId(poseGraphAsset.id, namespace, "graph"),
          spec: stripNulls(namespaceGraphSpec(poseSpec, namespace)),
          subs: namespaceSubscriptions(poseSubs, namespace),
        });
      } else {
        console.warn(
          "[vizij-runtime] Pose graph is missing a usable spec or IR payload; skipping registration.",
        );
      }
    }

    for (const animation of assetBundle.animations ?? []) {
      const bridgeOutputs = collectAnimationClipOutputPaths(
        animation.clip as AnimationClipLike,
        faceId ?? undefined,
        rigInputMapRef.current,
      );
      if (isRuntimeDebugEnabled()) {
        console.log("[vizij-runtime] animation output routing", {
          animationId: animation.id,
          bridgeOutputs,
          bridgeOutputsText: bridgeOutputs.join(" | "),
        });
      }
      recordOutputs(bridgeOutputs);
    }

    for (const program of resolvedProgramAssets) {
      const programSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph (outputs)`,
      );
      if (!programSpec) {
        continue;
      }
      recordOutputs(collectOutputPaths(programSpec));
    }

    outputPathsRef.current = namespacedOutputPaths;
    baseOutputPathsRef.current = baseOutputPaths;
    namespacedOutputPathsRef.current = namespacedOutputPaths;

    const graphIds: string[] = [];

    try {
      if (graphConfigs.length > 1) {
        const mergedId = registerMergedGraph({
          id:
            namespaceControllerId(
              mergedGraphRef.current ?? `merged-${namespace}`,
              namespace,
              "merged",
            ) ?? undefined,
          graphs: graphConfigs,
          strategy: mergeStrategy ?? DEFAULT_MERGE,
        });
        mergedGraphRef.current = mergedId;
        graphIds.push(mergedId);
      } else {
        graphConfigs.forEach((cfg) => {
          const id = registerGraph(cfg);
          graphIds.push(id);
        });
      }
    } catch (err: unknown) {
      pushError({
        message: "Failed to register rig graphs",
        cause: err,
        phase: "registration",
        timestamp: performance.now(),
      });
    }

    registeredGraphsRef.current = graphIds;
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registered graph ids", graphIds);
    }

    // Animations are device data: hand each clip's stored payload to the
    // module host (keyed by its bundle id, which the transport surface uses).
    // The module loads a clip lazily on first play — resolving its final
    // store keys at that moment — and samples it inside the device; the
    // graph applies the outputs. `registerAnimation` stays for API
    // compatibility but only mints ids.
    const animationIds: string[] = [];
    const hostClips: Array<{ id: string; stored: StoredAnimationClipLike }> =
      [];
    for (const anim of assetBundle.animations ?? []) {
      try {
        const stored =
          (anim.setup?.animation as StoredAnimationClipLike | undefined) ??
          toStoredAnimationClip(anim.id, anim.clip as AnimationClipLike);
        hostClips.push({ id: anim.id, stored });
        registerAnimation({ id: anim.id });
        animationIds.push(anim.id);
      } catch (err: unknown) {
        if (isRuntimeDebugEnabled()) {
          console.warn("[vizij-runtime] failed animation registration", {
            animationId: anim.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        pushError({
          message: `Failed to register animation ${anim.id}`,
          cause: err,
          phase: "animation",
          timestamp: performance.now(),
        });
      }
    }
    ensureAnimationHost()?.setClips(hostClips);

    registeredAnimationsRef.current = animationIds;

    if (assetBundle.initialInputs) {
      Object.entries(assetBundle.initialInputs).forEach(([path, value]) => {
        try {
          setInput(path, value);
        } catch (err: unknown) {
          pushError({
            message: `Failed to stage initial input ${path}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
      });
    }

    const controllers = listControllers();
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] controllers after register", {
        controllers,
        graphIds,
        animationIds,
      });
    }
    reportStatus((prev) => ({
      ...prev,
      ready: true,
      controllers,
      outputPaths: Array.from(outputPathsRef.current),
    }));
    onRegisterControllers?.(controllers);
  }, [
    assetBundle,
    clearControllers,
    ensureAnimationHost,
    listControllers,
    mergeStrategy,
    namespace,
    onRegisterControllers,
    pushError,
    registerAnimation,
    registerGraph,
    registerMergedGraph,
    reportStatus,
    resolvedProgramAssets,
    setInput,
  ]);

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    const plan = pendingPlanRef.current;
    const hasRegistered =
      registeredGraphsRef.current.length > 0 ||
      registeredAnimationsRef.current.length > 0 ||
      programControllerIdsRef.current.size > 0;
    if (plan && !plan.reregisterGraphs && hasRegistered) {
      return;
    }
    registerControllers().catch((err: unknown) => {
      pushError({
        message: "Failed to register controllers",
        cause: err,
        phase: "registration",
        timestamp: performance.now(),
      });
    });
  }, [ready, status.loading, graphUpdateToken, registerControllers, pushError]);

  useEffect(() => {
    // Bound into a ref so stepRuntime (defined above) can pull each tick's
    // drained store changes straight through without a React render per step.
    applyEngineChangesRef.current = (changes) => {
      const entries = Object.entries(changes);
      if (!entries.length) {
        return;
      }
      const setWorldValues = store.getState().setValues;
      const namespaceValue = status.namespace;
      const currentValues = store.getState().values;
      const rigInputPathMap = rigInputMapRef.current;
      const rigPoseControlInputIds = rigPoseControlInputIdsRef.current;
      const batched: Array<{ id: string; namespace: string; value: RawValue }> =
        [];
      const namespacedOutputs = namespacedOutputPathsRef.current;
      const baseOutputs = baseOutputPathsRef.current;
      entries.forEach(([changedPath, changedValue]) => {
        // Cleared keys don't render; the runtime's clock keys never do.
        if (changedValue === null || isGoldenPath(changedPath)) {
          return;
        }
        const path = normalisePath(changedPath);
        const basePath = stripNamespace(path, namespaceValue);
        const isTrackedOutput =
          namespacedOutputs.has(path) || baseOutputs.has(basePath);
        if (!isTrackedOutput) {
          return;
        }
        const raw = valueJSONToRaw(changedValue);
        if (raw === undefined) {
          return;
        }
        const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
          basePath,
        );
        if (
          poseControlMatch &&
          typeof raw === "number" &&
          Number.isFinite(raw)
        ) {
          const inputId = (poseControlMatch[1] ?? "").trim();
          const hasNativePoseControlInput =
            inputId.length > 0 && rigPoseControlInputIds.has(inputId);
          // Merged graphs do not automatically recycle pose-driver outputs into
          // sibling rig inputs, so native pose-control channels still need to be
          // restaged as runtime inputs on the next frame. Prefer explicit rig
          // input mappings first, then fall back to the native pose-control path.
          const mappedInputPath =
            inputId.length === 0
              ? undefined
              : resolvePoseControlInputPath({
                  inputId,
                  basePath,
                  rigInputPathMap,
                  hasNativePoseControlInput,
                });
          if (mappedInputPath) {
            const bridgeKey = `${namespaceValue}:${mappedInputPath}`;
            const previousValue =
              poseControlBridgeValuesRef.current.get(bridgeKey);
            if (
              previousValue === undefined ||
              Math.abs(previousValue - raw) > POSE_CONTROL_BRIDGE_EPSILON
            ) {
              poseControlBridgeValuesRef.current.set(bridgeKey, raw);
              setInput(mappedInputPath, { float: raw });
            }
          }
        }
        const targetPath = baseOutputs.has(basePath) ? basePath : path;
        const currentValue = currentValues.get(
          getLookup(namespaceValue, targetPath),
        );
        const nextWrite = transformOutputWrite
          ? transformOutputWrite({
              id: targetPath,
              namespace: namespaceValue,
              value: raw,
              currentValue,
            })
          : {
              id: targetPath,
              namespace: namespaceValue,
              value: raw,
            };
        if (nextWrite) {
          batched.push(nextWrite);
        }
      });
      if (batched.length > 0) {
        setWorldValues(batched);
      }
    };
  }, [status.namespace, store, transformOutputWrite]);

  const stagePoseNeutral = useCallback(
    (force = false) => {
      const neutral = assetBundle.pose?.config?.neutralInputs ?? {};
      const rigMap = rigInputMapRef.current;
      const staged = new Set<string>();
      Object.entries(neutral).forEach(([id, value]) => {
        const path = rigMap[id];
        if (!path) {
          return;
        }
        const include = assetBundle.pose?.stageNeutralFilter;
        if (include && !include(id, path)) {
          return;
        }
        setInput(path, { float: Number.isFinite(value) ? value : 0 });
        staged.add(path);
      });
      if (force) {
        Object.entries(rigMap).forEach(([id, path]) => {
          if (staged.has(path)) {
            return;
          }
          const include = assetBundle.pose?.stageNeutralFilter;
          if (include && !include(id, path)) {
            return;
          }
          setInput(path, { float: 0 });
        });
      }
    },
    [assetBundle.pose?.config?.neutralInputs, setInput],
  );

  const setRendererValue = useCallback(
    (
      id: string,
      ns: string,
      value: RawValue | ((prev: RawValue | undefined) => RawValue | undefined),
    ) => {
      store.getState().setValue(id, ns, value);
    },
    [store],
  );

  const cancelAnimation = useCallback((path: string) => {
    if (animationTweensRef.current.has(path)) {
      const entry = animationTweensRef.current.get(path);
      animationTweensRef.current.delete(path);
      entry?.resolve();
    }
  }, []);

  const advanceAnimationTweens = useCallback(
    (dt: number) => {
      if (animationTweensRef.current.size === 0) {
        return;
      }
      const map = animationTweensRef.current;
      const toDelete: string[] = [];
      map.forEach((state, key) => {
        state.elapsed += dt;
        const progress =
          state.duration === 0
            ? 1
            : Math.min(state.elapsed / state.duration, 1);
        const eased = state.easing(progress);
        const value = state.from + (state.to - state.from) * eased;
        setInput(state.path, { float: value });
        if (progress >= 1) {
          toDelete.push(key);
          state.resolve();
        }
      });
      toDelete.forEach((key) => map.delete(key));
    },
    [setInput],
  );

  const resolveClipById = useCallback(
    (id: string): VizijAnimationAsset | undefined => {
      return assetBundle.animations?.find((anim) => anim.id === id);
    },
    [assetBundle.animations],
  );

  const resolveClipPromise = useCallback((state: ClipPlaybackState) => {
    state.resolve?.();
    state.resolve = null;
    state.completion = null;
  }, []);

  const ensureClipPromise = useCallback((state: ClipPlaybackState) => {
    if (state.completion) {
      return state.completion;
    }
    const completion = new Promise<void>((resolve) => {
      state.resolve = resolve;
    });
    state.completion = completion;
    return completion;
  }, []);

  /**
   * Control-surface defaults for a clip: duration seeds from the clip until
   * the device feedback refines it; loop defaults to the module's Loop.
   */
  const ensureClipState = useCallback(
    (
      id: string,
    ): { clip: VizijAnimationAsset; state: ClipPlaybackState } | null => {
      const clip = resolveClipById(id);
      if (!clip) {
        return null;
      }
      const duration = resolveClipDurationSeconds(
        clip.clip as AnimationClipLike,
      );
      const existing = clipPlaybackRef.current.get(id);
      if (existing) {
        existing.duration = duration;
        return { clip, state: existing };
      }
      const state: ClipPlaybackState = {
        id,
        duration,
        speed: 1,
        weight: 1,
        loop: true,
        playing: false,
        resolve: null,
        completion: null,
      };
      clipPlaybackRef.current.set(id, state);
      return { clip, state };
    },
    [resolveClipById],
  );

  const animateValue = useCallback(
    (
      path: string,
      target: ValueJSON,
      options?: AnimateValueOptions,
    ): Promise<void> => {
      const targetValue = valueAsNumber(target);
      const basePath = stripNamespace(
        normalisePath(path),
        namespaceRef.current,
      );
      const poseValues =
        useLegacyPoseWeightFallback && targetValue != null
          ? poseWeightFallbackMap.get(basePath)
          : undefined;
      if (poseValues && targetValue != null) {
        const poseFaceId = assetBundle.pose?.config?.faceId ?? faceId ?? "face";
        const rigMap = rigInputMapRef.current;
        return Promise.all(
          Object.entries(poseValues).flatMap(([inputId, poseValue]) => {
            if (!Number.isFinite(poseValue)) {
              return [];
            }
            const controlPath =
              resolvePoseControlInputPath({
                inputId,
                basePath: buildRigInputPath(
                  poseFaceId,
                  `/pose/control/${inputId}`,
                ),
                rigInputPathMap: rigMap,
                hasNativePoseControlInput: true,
              }) ?? buildRigInputPath(poseFaceId, `/pose/control/${inputId}`);
            return [
              animateValue(
                controlPath,
                { float: Number(poseValue) * targetValue },
                options,
              ),
            ];
          }),
        ).then(() => undefined);
      }
      const easing = resolveEasing(options?.easing);
      const duration = Math.max(0, options?.duration ?? DEFAULT_DURATION);
      cancelAnimation(path);

      const namespacedPath = namespaceTypedPath(path, namespaceRef.current);
      const current = getPathSnapshot(namespacedPath);
      const fromValue = valueAsNumber(current);
      const toValue = valueAsNumber(target);

      if (fromValue == null || toValue == null || duration === 0) {
        setInput(path, target);
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        animationTweensRef.current.set(path, {
          // Keep the raw path here so tween updates go through setInput() once
          // and pick up the active namespace exactly once.
          path,
          from: fromValue,
          to: toValue,
          duration,
          elapsed: 0,
          easing,
          resolve,
        });
        markActivity();
      });
    },
    [
      assetBundle.pose?.config?.faceId,
      cancelAnimation,
      faceId,
      getPathSnapshot,
      markActivity,
      poseWeightFallbackMap,
      setInput,
      useLegacyPoseWeightFallback,
    ],
  );

  /**
   * Warn once per capability the 0.1.0 animation module does not implement, so
   * a caller that relies on it sees the gap instead of a silent divergence
   * between what it asked for and what the device plays.
   */
  const warnAnimationGap = useCallback((key: string, message: string) => {
    if (animationGapWarnedRef.current.has(key)) {
      return;
    }
    animationGapWarnedRef.current.add(key);
    console.warn(`[vizij-runtime] ${message}`);
  }, []);

  /**
   * Sync the animations graph source to whether any clip is playing (the
   * module has one engine, stepped whole) and refresh the loop mode.
   */
  const syncAnimationsSource = useCallback(() => {
    const host = animationHostRef.current;
    setAnimationsSourceRegistered(host ? host.hasPlaying() : false);
    updateLoopMode();
  }, [setAnimationsSourceRegistered, updateLoopMode]);

  /**
   * The module's live `[PlayerState]` feedback, read from the device store
   * (the animations source writes it each tick). Empty before the first
   * fed tick or without a device.
   */
  const readPlayerStates = useCallback(() => {
    const device = deviceSlot.current?.device;
    if (!device) {
      return [] as ReturnType<typeof decodePlayerStates>;
    }
    const raw = device.readValues([ANIMATION_PLAYERS_PATH])[
      ANIMATION_PLAYERS_PATH
    ];
    return decodePlayerStates(raw);
  }, [deviceSlot]);

  /**
   * Resolve play() completions off the device feedback: a non-looping clip
   * completes when its player reports the playhead at the clip end (Once
   * clamps there) or stopped. Runs each pump step; reads the feedback only
   * while a non-looping completion is pending.
   */
  const settleFinishedClips = useCallback(() => {
    let pending = false;
    clipPlaybackRef.current.forEach((state) => {
      if (state.completion && !state.loop) {
        pending = true;
      }
    });
    const host = animationHostRef.current;
    if (!pending || !host) {
      return;
    }
    const states = readPlayerStates();
    if (states.length === 0) {
      return;
    }
    clipPlaybackRef.current.forEach((state, id) => {
      if (!state.completion || state.loop) {
        return;
      }
      const playerId = host.playerIdOf(id);
      if (playerId === null) {
        return;
      }
      const feedback = states.find((entry) => entry.player === playerId);
      if (!feedback) {
        return;
      }
      const duration =
        feedback.duration > 0 ? feedback.duration : state.duration;
      const atEnd = duration > 0 && feedback.time >= duration - 1e-3;
      if (feedback.state === "stopped" || atEnd) {
        state.playing = false;
        resolveClipPromise(state);
        host.pause(id);
        syncAnimationsSource();
      }
    });
  }, [readPlayerStates, resolveClipPromise, syncAnimationsSource]);

  const playAnimation = useCallback(
    (id: string, options?: PlayAnimationOptions) => {
      const ensured = ensureClipState(id);
      if (!ensured) {
        return Promise.reject(
          new Error(`Animation ${id} is not part of the current asset bundle.`),
        );
      }
      const { state } = ensured;
      const host = ensureAnimationHost();

      state.speed = options?.speed ?? state.speed;
      state.weight = options?.weight ?? state.weight;
      state.playing = true;
      const completion = ensureClipPromise(state);
      clipPlaybackRef.current.set(id, state);

      if (host) {
        // Transport rides the 0.2.0 module: reset is a real seek, and
        // speed/loop/weight apply to the live player (or at load, for a clip
        // entering the module now).
        if (options?.reset === true) {
          host.seek(id, 0);
        }
        host.setSpeed(id, state.speed);
        host.setWeight(id, state.weight);
        host.setLoop(id, state.loop ? "loop" : "once");
        void host.play(id).catch((err: unknown) => {
          pushError({
            message: `Failed to start animation ${id} on the device`,
            cause: err,
            phase: "animation",
            timestamp: performance.now(),
          });
        });
      } else {
        warnAnimationGap(
          "module-not-ready",
          "playAnimation called before the animation module finished loading; playback starts once it is ready.",
        );
      }
      syncAnimationsSource();
      markActivity();
      return completion;
    },
    [
      ensureAnimationHost,
      ensureClipPromise,
      ensureClipState,
      markActivity,
      pushError,
      syncAnimationsSource,
      warnAnimationGap,
    ],
  );

  const pauseAnimation = useCallback(
    (id: string) => {
      const state = clipPlaybackRef.current.get(id);
      if (!state || !state.playing) {
        return;
      }
      state.playing = false;
      // A real pause: the player holds its playhead. When no clip is left
      // playing the source unregisters too, freezing the last written pose.
      animationHostRef.current?.pause(id);
      syncAnimationsSource();
    },
    [syncAnimationsSource],
  );

  const seekAnimation = useCallback((id: string, timeSeconds: number) => {
    if (!clipPlaybackRef.current.has(id)) {
      return;
    }
    animationHostRef.current?.seek(id, Math.max(0, timeSeconds));
  }, []);

  const setAnimationLoop = useCallback(
    (id: string, enabled: boolean) => {
      const ensured = ensureClipState(id);
      if (!ensured) {
        return;
      }
      ensured.state.loop = Boolean(enabled);
      animationHostRef.current?.setLoop(id, enabled ? "loop" : "once");
      updateLoopMode();
    },
    [ensureClipState, updateLoopMode],
  );

  const getAnimationState = useCallback(
    (id: string): AnimationPlaybackState | null => {
      const state = clipPlaybackRef.current.get(id);
      if (!state) {
        return null;
      }
      // The playhead, duration, and speed come from the module's
      // player_states feedback; the clip-derived duration and the commanded
      // state stand in until the first fed tick.
      const playerId = animationHostRef.current?.playerIdOf(id) ?? null;
      const feedback =
        playerId !== null
          ? readPlayerStates().find((entry) => entry.player === playerId)
          : undefined;
      return {
        time: feedback?.time ?? 0,
        duration:
          feedback && feedback.duration > 0
            ? feedback.duration
            : state.duration,
        playing: feedback ? feedback.state === "playing" : state.playing,
        loop: state.loop,
        speed: feedback?.speed ?? state.speed,
      };
    },
    [readPlayerStates],
  );

  const stopAnimation = useCallback(
    (id: string, options?: StopAnimationOptions) => {
      const state = clipPlaybackRef.current.get(id);
      if (state) {
        clipPlaybackRef.current.delete(id);
        state.playing = false;
        resolveClipPromise(state);
      }
      const host = animationHostRef.current;
      if (options?.clearOutputs === false) {
        // Hold the pose where it is; the playhead resets on the next play.
        host?.pause(id);
        syncAnimationsSource();
      } else {
        // Reset the player: the next module step emits the clip's t=0 pose
        // (its authored rest). The source stays composed for that one step —
        // it unregisters after the step that lands the reset.
        host?.stop(id);
        const unsubscribe = subscribeToStep(() => {
          unsubscribe();
          syncAnimationsSource();
        });
      }
    },
    [resolveClipPromise, subscribeToStep, syncAnimationsSource],
  );

  const refreshControllerStatus = useCallback(() => {
    const controllers = listControllers();
    reportStatus((prev) => ({
      ...prev,
      controllers,
      outputPaths: Array.from(outputPathsRef.current),
    }));
    onRegisterControllers?.(controllers);
  }, [listControllers, onRegisterControllers, reportStatus]);

  const resolveProgramById = useCallback(
    (id: string): VizijProgramAsset | undefined => {
      return resolvedProgramAssets.find((program) => program.id === id);
    },
    [resolvedProgramAssets],
  );

  const buildProgramRegistrationConfig = useCallback(
    (program: VizijProgramAsset): GraphRegistrationConfig | null => {
      const graphSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph`,
      );
      if (!graphSpec) {
        return null;
      }
      const outputs = collectOutputPaths(graphSpec);
      const inputs = collectInputPaths(graphSpec);
      const subs = program.graph.subscriptions ?? {
        inputs,
        outputs,
      };
      return {
        id: namespaceControllerId(program.id, namespace, "graph"),
        spec: stripNulls(namespaceGraphSpec(graphSpec, namespace)),
        subs: namespaceSubscriptions(subs, namespace),
      };
    },
    [namespace],
  );

  const deriveProgramResetValues = useCallback(
    (program: VizijProgramAsset): Array<{ path: string; value: number }> => {
      if (program.resetValues) {
        return Object.entries(program.resetValues)
          .filter(([, value]) => Number.isFinite(value))
          .map(([path, value]) => ({ path, value }));
      }

      const graphSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph (reset)`,
      );
      if (!graphSpec) {
        return [];
      }

      return collectOutputPaths(graphSpec)
        .filter((path) => path.trim().length > 0)
        .map((path) => {
          const defaultValue =
            inputConstraintsRef.current[path]?.defaultValue ?? 0;
          return {
            path,
            value:
              Number.isFinite(defaultValue) && defaultValue != null
                ? defaultValue
                : 0,
          };
        });
    },
    [],
  );

  const syncProgramPlaybackControllers = useCallback(() => {
    if (!ready) {
      return;
    }

    const availableProgramIds = new Set(
      resolvedProgramAssets.map((program) => program.id),
    );

    Array.from(programPlaybackRef.current.keys()).forEach((id) => {
      if (availableProgramIds.has(id)) {
        return;
      }
      programPlaybackRef.current.delete(id);
      const controllerId = programControllerIdsRef.current.get(id);
      if (controllerId) {
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message: `Failed to remove program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(id);
      }
    });

    programPlaybackRef.current.forEach((state, id) => {
      const program = resolveProgramById(id);
      const controllerId = programControllerIdsRef.current.get(id);

      if (!program) {
        return;
      }

      if (state.state !== "playing") {
        if (!controllerId) {
          return;
        }
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message: `Failed to pause program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(id);
        return;
      }

      if (controllerId) {
        return;
      }

      // Source per playing program: bundle `programs` (procedural graphs
      // started via the transport) and the authoring motiongraph, which
      // publishes the editor's graph as a program.
      const config = buildProgramRegistrationConfig(program);
      if (!config) {
        pushError({
          message: `Program ${id} is missing a usable graph payload.`,
          phase: "registration",
          timestamp: performance.now(),
        });
        return;
      }
      try {
        const nextControllerId = registerGraph(config);
        programControllerIdsRef.current.set(id, nextControllerId);
      } catch (err: unknown) {
        pushError({
          message: `Failed to register program ${id}`,
          cause: err,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });

    refreshControllerStatus();
  }, [
    buildProgramRegistrationConfig,
    pushError,
    ready,
    refreshControllerStatus,
    registerGraph,
    removeGraph,
    resolvedProgramAssets,
    resolveProgramById,
  ]);

  const playProgram = useCallback(
    (id: string) => {
      const program = resolveProgramById(id);
      if (!program) {
        throw new Error(
          `Program ${id} is not part of the current asset bundle.`,
        );
      }
      deriveProgramInputSeedValues({
        program,
        namespace,
        inputConstraints: inputConstraintsRef.current,
        getPathSnapshot,
        stagedInputs: stagedInputsRef.current,
      }).forEach(({ path, value }) => {
        setInput(path, value);
      });
      programPlaybackRef.current.set(id, {
        id,
        state: "playing",
      });
      syncProgramPlaybackControllers();
      markActivity();
    },
    [
      getPathSnapshot,
      markActivity,
      namespace,
      resolveProgramById,
      setInput,
      syncProgramPlaybackControllers,
    ],
  );

  const pauseProgram = useCallback(
    (id: string) => {
      if (!resolveProgramById(id)) {
        return;
      }
      programPlaybackRef.current.set(id, {
        id,
        state: "paused",
      });
      syncProgramPlaybackControllers();
      updateLoopMode();
    },
    [resolveProgramById, syncProgramPlaybackControllers, updateLoopMode],
  );

  const stopProgram = useCallback(
    (id: string, options?: StopProgramOptions) => {
      const program = resolveProgramById(id);
      const controllerId = programControllerIdsRef.current.get(id);
      if (controllerId) {
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message: `Failed to stop program ${id}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(id);
      }
      programPlaybackRef.current.set(id, {
        id,
        state: "stopped",
      });
      if (program && options?.resetOutputs !== false) {
        deriveProgramResetValues(program).forEach(({ path, value }) => {
          setInput(path, { float: value });
        });
      }
      refreshControllerStatus();
      updateLoopMode();
    },
    [
      deriveProgramResetValues,
      pushError,
      refreshControllerStatus,
      removeGraph,
      resolveProgramById,
      setInput,
      updateLoopMode,
    ],
  );

  const getProgramState = useCallback(
    (id: string): ProgramPlaybackState | null => {
      const state = programPlaybackRef.current.get(id);
      if (!state) {
        return null;
      }
      return { state: state.state };
    },
    [],
  );

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    syncProgramPlaybackControllers();
  }, [
    graphUpdateToken,
    ready,
    resolvedProgramAssets,
    status.loading,
    syncProgramPlaybackControllers,
  ]);

  const setAnimationActive = useCallback(
    (active: boolean) => {
      const next = Boolean(active);
      if (animationSystemActiveRef.current === next) {
        return;
      }
      animationSystemActiveRef.current = next;
      if (!next) {
        clipPlaybackRef.current.forEach((state) => {
          state.playing = false;
        });
      }
      updateLoopMode();
    },
    [updateLoopMode],
  );

  const isAnimationActive = useCallback(
    () => animationSystemActiveRef.current,
    [],
  );

  const registerInputDriver = useCallback(
    (id: string, factory: InputDriverFactory): InputDriverLifecycle => {
      inputDriverIdsRef.current.add(id);
      const driver = factory({
        setInput,
        setRendererValue,
        namespace,
        faceId,
      });
      const wrapped: InputDriverLifecycle = {
        start: () => {
          try {
            driver.start();
          } catch (err: unknown) {
            pushError({
              message: `Input driver ${id} failed to start`,
              cause: err,
              phase: "driver",
              timestamp: performance.now(),
            });
          }
        },
        stop: () => {
          try {
            driver.stop();
          } catch (err: unknown) {
            pushError({
              message: `Input driver ${id} failed to stop`,
              cause: err,
              phase: "driver",
              timestamp: performance.now(),
            });
          }
        },
        dispose: () => {
          try {
            driver.dispose();
          } catch (err: unknown) {
            pushError({
              message: `Input driver ${id} failed to dispose`,
              cause: err,
              phase: "driver",
              timestamp: performance.now(),
            });
          } finally {
            inputDriverIdsRef.current.delete(id);
          }
        },
      };
      return wrapped;
    },
    [faceId, namespace, pushError, setInput, setRendererValue],
  );

  const flushStagedInputs = useCallback(() => {
    if (stagedInputsRef.current.size === 0) {
      return;
    }
    stagedInputsRef.current.forEach(({ value, shape }, path) => {
      deviceSetInput(path, value, shape);
    });
    stagedInputsRef.current.clear();
  }, [deviceSetInput]);

  const step = useCallback(
    (dt: number, opts?: { forceRuntime?: boolean }) => {
      if (dt > 0 && Number.isFinite(dt)) {
        const prev = avgStepDtRef.current ?? dt;
        const alpha = 0.1;
        avgStepDtRef.current = prev * (1 - alpha) + dt * alpha;
      }
      // Imperative value tweens (animateValue) stay JS-side — they are UI
      // value easings, not clips. Clip playback ticks INSIDE the device and
      // the graph applies the module's outputs onto the rig keys itself; the
      // pump advances tweens, flushes staged inputs, and settles play()
      // completions off the device feedback.
      advanceAnimationTweens(dt);
      flushStagedInputs();
      if (driveRuntimeRef.current || opts?.forceRuntime) {
        stepRuntime(dt);
      }
      settleFinishedClips();
    },
    [
      advanceAnimationTweens,
      flushStagedInputs,
      settleFinishedClips,
      stepRuntime,
    ],
  );

  useEffect(() => {
    if (loopMode !== "active") {
      return;
    }
    let rafId: number | null = null;
    let lastTime: number | null = null;
    const tick = (timestamp: number) => {
      if (loopModeRef.current !== "active") {
        return;
      }
      if (lastTime == null) {
        lastTime = timestamp;
      }
      // dt is measured between consecutive frames; an implausible gap
      // means the host suspended the loop (see IMPLICIT_PAUSE_GAP_S).
      const dt = inferImplicitPause(Math.max(0, (timestamp - lastTime) / 1000));
      lastTime = timestamp;
      step(dt || 0);
      requestLoopMode(computeDesiredLoopMode());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [loopMode, computeDesiredLoopMode, requestLoopMode, step]);

  useEffect(() => {
    if (loopMode !== "idle-visible" && loopMode !== "idle-hidden") {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }
    const fps =
      loopMode === "idle-visible" ? VISIBLE_IDLE_FPS : HIDDEN_IDLE_FPS;
    if (fps <= 0) {
      return;
    }
    let lastTime = now();
    const interval = 1000 / fps;
    const tick = () => {
      if (
        loopModeRef.current !== "idle-visible" &&
        loopModeRef.current !== "idle-hidden"
      ) {
        return;
      }
      const current = now();
      // dt is measured between consecutive ticks; an implausible gap
      // means the host suspended the loop (see IMPLICIT_PAUSE_GAP_S).
      const dt = inferImplicitPause(Math.max(0, (current - lastTime) / 1000));
      lastTime = current;
      step(dt || 0);
      requestLoopMode(computeDesiredLoopMode());
    };
    const intervalId = window.setInterval(tick, interval);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [loopMode, computeDesiredLoopMode, requestLoopMode, step]);

  useEffect(() => {
    return () => {
      animationTweensRef.current.clear();
      clipPlaybackRef.current.clear();
      programPlaybackRef.current.clear();
      programControllerIdsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const id = window.setInterval(() => {
      const avg = avgStepDtRef.current;
      const stepHz =
        avg && Number.isFinite(avg) && avg > 0 ? 1 / avg : undefined;
      reportStatus((prev) =>
        prev.stepHz === stepHz ? prev : { ...prev, stepHz },
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [reportStatus]);

  const setGraphBundle = useCallback(
    (bundle: RuntimeGraphBundle, options?: { tier?: RuntimeUpdateTier }) => {
      const baseAssetBundle = latestEffectiveAssetBundleRef.current;
      const nextAssetBundle = applyRuntimeGraphBundle(baseAssetBundle, bundle);

      const plan = resolveRuntimeUpdatePlan(
        baseAssetBundle,
        nextAssetBundle,
        options?.tier ?? updateTierRef.current,
      );
      pendingPlanRef.current = plan;
      previousBundleRef.current = nextAssetBundle;
      latestEffectiveAssetBundleRef.current = nextAssetBundle;
      suppressNextBundlePlanRef.current = true;
      setAssetBundleOverride(nextAssetBundle);
      if (plan.reregisterGraphs) {
        setGraphUpdateToken((prev) => prev + 1);
      }
      if (plan.reloadAssets) {
        reportStatus((prev) => ({
          ...prev,
          loading: true,
          ready: false,
        }));
      } else {
        reportStatus((prev) => ({
          ...prev,
          loading: false,
        }));
      }
    },
    [reportStatus],
  );

  const contextValue: VizijRuntimeContextValue = useMemo(
    () => ({
      ...status,
      assetBundle,
      setInput,
      getValueSnapshot: getPathSnapshot,
      getStoreSnapshot,
      subscribeToStoreChanges,
      subscribeToStep,
      setGraphBundle,
      setValue: setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      pauseAnimation,
      seekAnimation,
      setAnimationLoop,
      getAnimationState,
      stopAnimation,
      playProgram,
      pauseProgram,
      stopProgram,
      getProgramState,
      setAnimationActive,
      isAnimationActive,
      step,
      inputConstraints,
    }),
    [
      status,
      assetBundle,
      setInput,
      getPathSnapshot,
      getStoreSnapshot,
      subscribeToStoreChanges,
      subscribeToStep,
      setGraphBundle,
      setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      pauseAnimation,
      seekAnimation,
      setAnimationLoop,
      getAnimationState,
      stopAnimation,
      playProgram,
      pauseProgram,
      stopProgram,
      getProgramState,
      setAnimationActive,
      isAnimationActive,
      step,
      inputConstraints,
    ],
  );

  return (
    <VizijRuntimeContext.Provider value={contextValue}>
      {children}
    </VizijRuntimeContext.Provider>
  );
}
