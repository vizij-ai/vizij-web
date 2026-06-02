import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren, ReactNode } from "react";
import {
  VizijContext,
  createVizijStore,
  type VizijStore,
  type VizijBundleExtension,
  loadGLTFWithBundle,
  loadGLTFFromBlobWithBundle,
} from "@vizij/render";
import {
  OrchestratorProvider,
  OrchestratorContext,
  useOrchestrator,
  useOrchFrame,
  resolveVizijOrchestratorInitInput,
  type CreateOrchOptions,
  type MergeStrategyOptions,
  type ValueJSON,
  type ShapeJSON,
} from "@vizij/orchestrator-react";
import {
  collectOutputPaths,
  deriveProgramInputSeedValues,
  deriveProgramResetValues,
  buildAnimationControllerCommandPath,
  buildAnimationControllerPauseInputs,
  buildAnimationControllerPlayInputs,
  buildAnimationControllerStopInputs,
  buildLegacyPoseWeightFallbackMap,
  clampAnimationTime,
  diffAnimationAggregateValues,
  hasRuntimeGraphBundlePendingRevision,
  namespaceTypedPath,
  normalisePath,
  planRuntimeProgramRegistrationAcknowledgementQueue,
  planRuntimeProgramControllerSync,
  planRuntimeGraphBundleApplication,
  prepareRuntimeLoadedAssetPayload,
  prepareRuntimeRegistrationPlan,
  prepareRuntimeAssetView,
  queueRuntimeGraphBundlePendingUpdate,
  removeRuntimeGraphBundlePendingUpdates,
  resolveRuntimeGraphBundleAppliedUpdates,
  resolveClipDurationSeconds,
  resolveAnimationTransportMode,
  resolveGraphSpec,
  resolveInitialRuntimeExtractedBundle,
  resolveLegacyPoseWeightControlWrites,
  resolveRuntimeGraphBundleErrorSources,
  resolveRuntimeUpdatePlan,
  sampleAnimationClipOutputValues,
  shouldUseLegacyPoseWeightFallback,
  shouldAcknowledgeRuntimeGraphBundleImmediately,
  stripNamespace,
  type RuntimeGraphBundle,
  type RuntimeProgramRegistrationSupportResult,
  type RuntimeUpdateTier,
  type RuntimeGraphBundlePendingUpdate,
  type ResolvedAnimationTransportMode,
} from "@vizij/studio-support";
import { valueAsNumber } from "@vizij/value-json";
import { getLookup, type AnimatableValue, type RawValue } from "@vizij/utils";
import { VizijRuntimeContext } from "./context";
import {
  advanceRuntimeExecution,
  clearStagedRuntimeInput,
  flushStagedRuntimeInput,
  flushStagedRuntimeInputs,
  stageRuntimeInput,
  type StagedRuntimeInputs,
} from "./host/executionLoop";
import {
  applyRuntimeControllerRegistrationResult,
  clearRuntimeControllers,
  registerRuntimeControllers,
  type RuntimeControllerHostError,
} from "./host/controllerRegistration";
import { prepareRuntimeFrameWrites } from "./host/frameWrites";
import {
  createHostAnimationFallbackPlayback,
  type HostAnimationFallbackClipState,
} from "./host/hostAnimationFallback";
import {
  clearRuntimeDebugState,
  isRuntimeDebugStateEnabled,
  setRuntimeDebugState,
} from "./memoryInvestigation";
import type {
  AnimateValueOptions,
  AnimationPlaybackState,
  InputDriverFactory,
  InputDriverLifecycle,
  PlayAnimationOptions,
  ProgramPlaybackState,
  RuntimeGraphBundleAppliedEvent,
  RuntimeGraphBundleUpdateSource,
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
import { resolveProviderAnimationBackend } from "./utils/animationTransport";

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

type ClipPlaybackState = HostAnimationFallbackClipState;

type RuntimeDebugFrameWriteSample = {
  path: string;
  value: ValueJSON;
};

type RuntimeDebugRendererWriteSample = {
  id: string;
  value: RawValue;
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

let runtimeDebugInstanceSequence = 0;

function isRuntimeDebugEnabled(): boolean {
  const globalObj = globalThis as {
    __VIZIJ_RUNTIME_DEBUG__?: boolean;
    __VIZIJ_MEMORY_INVESTIGATION__?: { enabled?: boolean };
  };
  return Boolean(
    globalObj.__VIZIJ_RUNTIME_DEBUG__ ||
      globalObj.__VIZIJ_MEMORY_INVESTIGATION__?.enabled,
  );
}

const EASINGS: Record<string, (t: number) => number> = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: (t: number) =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};

function resolveEasing(easing?: AnimateValueOptions["easing"]) {
  if (typeof easing === "function") {
    return easing;
  }
  if (typeof easing === "string" && easing in EASINGS) {
    return EASINGS[easing];
  }
  return EASINGS.linear;
}

function findRootId(world: Record<string, any>): string | null {
  let fallback: string | null = null;
  for (const entry of Object.values(world)) {
    if (!entry || typeof entry !== "object" || entry.type !== "group") {
      continue;
    }
    if (entry.rootBounds && entry.id) {
      return entry.id as string;
    }
    if (!fallback && entry.id) {
      fallback = entry.id as string;
    }
  }
  return fallback;
}

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

export function VizijRuntimeProvider({
  assetBundle,
  children,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier = "auto",
  autoCreate = true,
  createOptions,
  orchestratorInitInput,
  autostart = false,
  driveOrchestrator = true,
  mergeStrategy,
  orchestratorBackend,
  onRegisterControllers,
  onRuntimeGraphBundleApplied,
  onStatusChange,
  transformOutputWrite,
  orchestratorScope = "auto",
  animationTransport = "auto",
}: ProviderProps) {
  const storeRef = useRef<VizijStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createVizijStore();
  }

  const parentOrchestrator = useContext(OrchestratorContext);
  const hasParentOrchestrator = Boolean(parentOrchestrator);
  const shouldProvideOrchestrator =
    orchestratorScope === "isolated" || !hasParentOrchestrator;

  if (orchestratorScope === "shared" && !hasParentOrchestrator) {
    throw new Error(
      '[vizij-runtime] orchestratorScope="shared" requires an OrchestratorProvider higher in the tree.',
    );
  }

  const animationTransportBackend = resolveProviderAnimationBackend({
    providerBackend: orchestratorBackend,
    parentBackend: parentOrchestrator?.backend,
    providesOrchestrator: shouldProvideOrchestrator,
  });

  const runtimeTree = (
    <VizijContext.Provider value={storeRef.current}>
      <VizijRuntimeProviderInner
        assetBundle={assetBundle}
        namespace={namespaceProp}
        faceId={faceIdProp}
        updateTier={updateTier}
        autoCreate={autoCreate}
        autostart={autostart}
        driveOrchestrator={driveOrchestrator}
        animationTransport={resolveAnimationTransportMode(
          animationTransport,
          animationTransportBackend,
        )}
        createOptions={createOptions}
        mergeStrategy={mergeStrategy}
        onRegisterControllers={onRegisterControllers}
        onRuntimeGraphBundleApplied={onRuntimeGraphBundleApplied}
        onStatusChange={onStatusChange}
        transformOutputWrite={transformOutputWrite}
        store={storeRef.current}
      >
        {children}
      </VizijRuntimeProviderInner>
    </VizijContext.Provider>
  );

  if (!shouldProvideOrchestrator) {
    return runtimeTree;
  }

  return (
    <OrchestratorProvider
      autoCreate={autoCreate}
      createOptions={createOptions}
      backend={orchestratorBackend}
      initInput={resolveVizijOrchestratorInitInput(
        orchestratorBackend,
        orchestratorInitInput,
      )}
      autostart={false}
    >
      {runtimeTree}
    </OrchestratorProvider>
  );
}

type VizijRuntimeProviderInnerProps = {
  assetBundle: VizijAssetBundle;
  namespace?: string;
  faceId?: string;
  updateTier: RuntimeUpdateTier;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onRuntimeGraphBundleApplied?: (event: RuntimeGraphBundleAppliedEvent) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  transformOutputWrite?: (
    write: RuntimeOutputWrite,
  ) => RuntimeOutputWrite | null;
  store: VizijStore;
  children: ReactNode;
  autoCreate: boolean;
  autostart: boolean;
  createOptions?: CreateOrchOptions;
  driveOrchestrator: boolean;
  animationTransport: ResolvedAnimationTransportMode;
};

function VizijRuntimeProviderInner({
  assetBundle: initialAssetBundle,
  namespace: namespaceProp,
  faceId: faceIdProp,
  updateTier,
  mergeStrategy,
  onRegisterControllers,
  onRuntimeGraphBundleApplied,
  onStatusChange,
  transformOutputWrite,
  store,
  children,
  autoCreate,
  autostart,
  createOptions,
  driveOrchestrator,
  animationTransport,
}: VizijRuntimeProviderInnerProps) {
  const [assetBundleOverride, setAssetBundleOverride] =
    useState<VizijAssetBundle | null>(null);
  const initialAssetBundleRef = useRef(initialAssetBundle);
  const [graphUpdateToken, setGraphUpdateToken] = useState(0);
  const [programRegistrationToken, setProgramRegistrationToken] = useState(0);
  const effectiveAssetBundle = assetBundleOverride ?? initialAssetBundle;
  const latestEffectiveAssetBundleRef =
    useRef<VizijAssetBundle>(effectiveAssetBundle);
  const [extractedBundle, setExtractedBundle] =
    useState<VizijBundleExtension | null>(() => {
      return resolveInitialRuntimeExtractedBundle(effectiveAssetBundle);
    });
  const extractedBundleRef = useRef<VizijBundleExtension | null>(
    extractedBundle,
  );
  const [extractedAnimations, setExtractedAnimations] = useState<
    VizijAnimationAsset[]
  >([]);
  const previousBundleRef = useRef<VizijAssetBundle | null>(null);
  const suppressNextBundlePlanRef = useRef(false);
  const pendingPlanRef = useRef<ReturnType<
    typeof resolveRuntimeUpdatePlan
  > | null>(null);
  const graphBundleUpdateRevisionRef = useRef(0);
  const pendingGraphBundleUpdatesRef = useRef<
    RuntimeGraphBundlePendingUpdate[]
  >([]);
  const pendingProgramRegistrationUpdatesRef = useRef<
    Map<string, RuntimeGraphBundlePendingUpdate>
  >(new Map());
  const updateTierRef = useRef<RuntimeUpdateTier>(updateTier);

  useEffect(() => {
    setExtractedBundle(
      resolveInitialRuntimeExtractedBundle(effectiveAssetBundle),
    );
  }, [effectiveAssetBundle]);

  useEffect(() => {
    updateTierRef.current = updateTier;
  }, [updateTier]);

  const runtimeAssetView = useMemo(
    () =>
      prepareRuntimeAssetView(
        effectiveAssetBundle,
        extractedBundle,
        extractedAnimations,
      ),
    [effectiveAssetBundle, extractedBundle, extractedAnimations],
  );
  const assetBundle = runtimeAssetView.assetBundle;
  const resolvedProgramAssets = runtimeAssetView.programs;
  const sourceAssetBundle = useMemo(
    () => ({
      glb: effectiveAssetBundle.glb,
      bundle: effectiveAssetBundle.bundle ?? null,
    }),
    [effectiveAssetBundle.bundle, effectiveAssetBundle.glb],
  );

  useEffect(() => {
    extractedBundleRef.current = extractedBundle;
  }, [extractedBundle]);

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

  const {
    backend,
    ready,
    createOrchestrator,
    registerGraph,
    registerMergedGraph,
    registerAnimation,
    removeGraph,
    removeAnimation,
    removeInput,
    listControllers,
    setInput: orchestratorSetInput,
    getPathSnapshot,
    step: stepRuntime,
    getDebugInfo,
  } = useOrchestrator();
  const frame = useOrchFrame();

  const namespace = namespaceProp ?? assetBundle.namespace ?? "default";
  const faceId =
    faceIdProp ??
    assetBundle.faceId ??
    assetBundle.pose?.config?.faceId ??
    undefined;

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
  const driveOrchestratorRef = useRef(driveOrchestrator);
  const animationTransportRef =
    useRef<ResolvedAnimationTransportMode>(animationTransport);
  const rigInputMapRef = useRef<Record<string, string>>({});
  const rigPoseControlInputIdsRef = useRef<Set<string>>(new Set());
  const registeredGraphsRef = useRef<string[]>([]);
  const registeredAnimationsRef = useRef<string[]>([]);
  const animationControllerIdsRef = useRef<Map<string, string>>(new Map());
  const animationOutputPathsRef = useRef<Map<string, string[]>>(new Map());
  const mergedGraphRef = useRef<string | null>(null);
  const poseControlBridgeValuesRef = useRef<Map<string, number>>(new Map());
  const poseWeightFallbackMap = useMemo(
    () =>
      buildLegacyPoseWeightFallbackMap({
        poseConfig: assetBundle.pose?.config,
        faceId,
      }),
    [assetBundle.pose?.config, faceId],
  );
  const useLegacyPoseWeightFallback = useMemo(
    () => shouldUseLegacyPoseWeightFallback(Boolean(assetBundle.pose?.graph)),
    [assetBundle.pose?.graph],
  );
  const [inputConstraints, setInputConstraints] = useState<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const inputConstraintsRef = useRef<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
  const avgStepDtRef = useRef<number | null>(null);
  const inputDriverIdsRef = useRef<Set<string>>(new Set());
  const frameCountRef = useRef(0);
  const frameWriteCountRef = useRef(0);
  const rendererWriteCountRef = useRef(0);
  const lastFrameWriteCountRef = useRef(0);
  const lastRendererWriteCountRef = useRef(0);
  const lastFrameWritePathsRef = useRef<string[]>([]);
  const lastRendererWriteIdsRef = useRef<string[]>([]);
  const lastFrameWriteSamplesRef = useRef<RuntimeDebugFrameWriteSample[]>([]);
  const lastRendererWriteSamplesRef = useRef<RuntimeDebugRendererWriteSample[]>(
    [],
  );
  const hostAnimationSampleCountRef = useRef(0);
  const orchestratorAnimationCommandCountRef = useRef(0);
  const orchestratorAnimationFallbackCountRef = useRef(0);
  const lastAnimationCommandPathsRef = useRef<string[]>([]);
  const lastHostAnimationSampleIdRef = useRef<string | null>(null);

  const animationTweensRef = useRef<Map<string, AnimationState>>(new Map());
  const clipPlaybackRef = useRef<Map<string, ClipPlaybackState>>(new Map());
  const programPlaybackRef = useRef<Map<string, ProgramTransportState>>(
    new Map(),
  );
  const programRegistrationMapRef = useRef<
    Map<string, RuntimeProgramRegistrationSupportResult>
  >(new Map());
  const programControllerIdsRef = useRef<Map<string, string>>(new Map());
  const clipOutputValuesRef = useRef<Map<string, Map<string, number>>>(
    new Map(),
  );
  const clipAggregateValuesRef = useRef<Map<string, number>>(new Map());
  const animationRendererBaselinesRef = useRef<
    Map<string, Map<string, RawValue>>
  >(new Map());
  const animationInputBaselinesRef = useRef<
    Map<string, Map<string, ValueJSON>>
  >(new Map());
  const programInputBaselinesRef = useRef<Map<string, Map<string, ValueJSON>>>(
    new Map(),
  );
  const programRendererBaselinesRef = useRef<
    Map<string, Map<string, RawValue>>
  >(new Map());
  const ignoredAnimationOutputPathsRef = useRef<Set<string>>(new Set());
  const lastAnimationBaselineDebugRef = useRef({
    capturedId: null as string | null,
    capturedCount: 0,
    capturedPaths: [] as string[],
    restoredId: null as string | null,
    restoredCount: 0,
    restoredPaths: [] as string[],
    capturedInputId: null as string | null,
    capturedInputCount: 0,
    capturedInputPaths: [] as string[],
    restoredInputId: null as string | null,
    restoredInputCount: 0,
    restoredInputPaths: [] as string[],
  });
  const animationSystemActiveRef = useRef(true);
  const stagedInputsRef = useRef<StagedRuntimeInputs>(new Map());
  const autostartRef = useRef(autostart);
  const lastActivityTimeRef = useRef<number>(now());
  const [loopMode, setLoopMode] = useState<LoopMode>("stopped");
  const loopModeRef = useRef<LoopMode>("stopped");
  const [animationRegistrationToken, setAnimationRegistrationToken] =
    useState(0);
  const resetTransientRuntimeState = useCallback(() => {
    animationTweensRef.current.forEach((state) => state.resolve());
    animationTweensRef.current.clear();
    clipPlaybackRef.current.forEach((state) => {
      state.playing = false;
      state.resolve?.();
      state.resolve = null;
      state.completion = null;
    });
    clipPlaybackRef.current.clear();
    programPlaybackRef.current.clear();
    pendingProgramRegistrationUpdatesRef.current.clear();
    stagedInputsRef.current.clear();
    clipOutputValuesRef.current.clear();
    clipAggregateValuesRef.current.clear();
    animationRendererBaselinesRef.current.clear();
    animationInputBaselinesRef.current.clear();
    programInputBaselinesRef.current.clear();
    programRendererBaselinesRef.current.clear();
    ignoredAnimationOutputPathsRef.current.clear();
    loopModeRef.current = "stopped";
    setLoopMode("stopped");
  }, []);

  useEffect(() => {
    if (initialAssetBundleRef.current === initialAssetBundle) {
      return;
    }
    initialAssetBundleRef.current = initialAssetBundle;
    pendingGraphBundleUpdatesRef.current = [];
    pendingProgramRegistrationUpdatesRef.current.clear();
    resetTransientRuntimeState();
    setAssetBundleOverride(null);
  }, [initialAssetBundle, resetTransientRuntimeState]);

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
    if (!isRuntimeDebugStateEnabled()) {
      return;
    }
    const storeState = store.getState();
    const orchestratorDebugInfo = getDebugInfo?.();
    setRuntimeDebugState(runtimeDebugInstanceIdRef.current, {
      namespace,
      faceId: faceId ?? null,
      rootId: status.rootId,
      ready: status.ready,
      loading: status.loading,
      orchestratorBackend: backend,
      orchestratorReady: ready,
      aroraWebDebugInstanceId:
        orchestratorDebugInfo?.aroraWebInstanceId ?? null,
      autostart,
      driveOrchestrator,
      loopMode,
      animationTransport,
      outputCount: status.outputPaths.length,
      graphControllerCount: status.controllers.graphs.length,
      animationControllerCount: status.controllers.anims.length,
      registeredGraphCount: registeredGraphsRef.current.length,
      registeredAnimationCount: registeredAnimationsRef.current.length,
      programControllerCount: programControllerIdsRef.current.size,
      animationTweenCount: animationTweensRef.current.size,
      animationSystemActive: animationSystemActiveRef.current,
      playingClipIds: Array.from(clipPlaybackRef.current.values())
        .filter((state) => state.playing)
        .map((state) => state.id),
      clipPlaybackCount: clipPlaybackRef.current.size,
      programPlaybackCount: programPlaybackRef.current.size,
      stagedInputCount: stagedInputsRef.current.size,
      activeDriverCount: inputDriverIdsRef.current.size,
      worldEntryCount: Object.keys(storeState.world ?? {}).length,
      animatableCount: Object.keys(storeState.animatables ?? {}).length,
      valuesSize:
        storeState.values instanceof Map ? storeState.values.size : null,
      stepHz: status.stepHz ?? null,
      frameCount: frameCountRef.current,
      frameWriteCount: frameWriteCountRef.current,
      rendererWriteCount: rendererWriteCountRef.current,
      lastFrameWriteCount: lastFrameWriteCountRef.current,
      lastRendererWriteCount: lastRendererWriteCountRef.current,
      lastFrameWritePaths: lastFrameWritePathsRef.current,
      lastRendererWriteIds: lastRendererWriteIdsRef.current,
      lastFrameWriteSamples: lastFrameWriteSamplesRef.current,
      lastRendererWriteSamples: lastRendererWriteSamplesRef.current,
      hostAnimationSampleCount: hostAnimationSampleCountRef.current,
      orchestratorAnimationCommandCount:
        orchestratorAnimationCommandCountRef.current,
      orchestratorAnimationFallbackCount:
        orchestratorAnimationFallbackCountRef.current,
      lastAnimationCommandPaths: lastAnimationCommandPathsRef.current,
      lastHostAnimationSampleId: lastHostAnimationSampleIdRef.current,
      animationOutputPaths: Object.fromEntries(animationOutputPathsRef.current),
      animationBaseline: lastAnimationBaselineDebugRef.current,
      ignoredAnimationOutputPathCount:
        ignoredAnimationOutputPathsRef.current.size,
      errorCount: status.errors.length,
      latestErrorMessage: status.error?.message ?? null,
      latestErrorPhase: status.error?.phase ?? null,
    });
  }, [
    autostart,
    animationTransport,
    backend,
    driveOrchestrator,
    faceId,
    getDebugInfo,
    loopMode,
    namespace,
    ready,
    status.controllers.anims.length,
    status.controllers.graphs.length,
    status.error?.message,
    status.error?.phase,
    status.errors.length,
    status.loading,
    status.outputPaths.length,
    status.ready,
    status.rootId,
    status.stepHz,
    store,
  ]);

  useEffect(() => {
    if (!isRuntimeDebugStateEnabled()) {
      return;
    }
    publishRuntimeDebugState();
    const unsubscribe = store.subscribe(() => {
      publishRuntimeDebugState();
    });
    return () => {
      unsubscribe();
      clearRuntimeDebugState(runtimeDebugInstanceIdRef.current);
    };
  }, [publishRuntimeDebugState, store]);

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
      const poseControlWrites = resolveLegacyPoseWeightControlWrites({
        enabled: useLegacyPoseWeightFallback,
        poseWeightPath: basePath,
        poseWeightValue: numericValue,
        poseWeightFallbackMap,
        faceId: assetBundle.pose?.config?.faceId ?? faceId ?? "face",
        rigInputPathMap: rigInputMapRef.current,
      });
      if (poseControlWrites.length > 0) {
        poseControlWrites.forEach((write) => {
          setInput(write.path, { float: write.value });
        });
        return;
      }
      markActivity();
      const namespacedPath = stageRuntimeInput({
        stagedInputs: stagedInputsRef.current,
        namespace: namespaceRef.current,
        path,
        value,
        shape,
      });
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
    },
    [
      assetBundle.pose?.config?.faceId,
      faceId,
      markActivity,
      poseWeightFallbackMap,
      useLegacyPoseWeightFallback,
    ],
  );

  const flushStagedInputsToRuntime = useCallback((): number => {
    const flushedInputCount = flushStagedRuntimeInputs({
      stagedInputs: stagedInputsRef.current,
      setInput: orchestratorSetInput,
    });
    if (flushedInputCount > 0) {
      stepRuntime(0);
    }
    return flushedInputCount;
  }, [orchestratorSetInput, stepRuntime]);

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

  const pushHostError = useCallback(
    (
      error: RuntimeControllerHostError,
      sources?: RuntimeGraphBundleUpdateSource[],
    ) => {
      pushError({
        ...error,
        sources,
        timestamp: performance.now(),
      });
    },
    [pushError],
  );

  const resetErrors = useCallback(() => {
    errorsRef.current = [];
    reportStatus((prev) => ({
      ...prev,
      error: null,
      errors: [],
    }));
  }, [reportStatus]);

  const notifyGraphBundleApplied = useCallback(
    (
      controllers: { graphs: string[]; anims: string[] },
      updates: readonly RuntimeGraphBundlePendingUpdate[] = pendingGraphBundleUpdatesRef.current,
      options: { includeDeferredProgramUpdates?: boolean } = {},
      registration: {
        outputPaths: string[];
        animationOutputPaths: Record<string, string[]>;
      } = {
        outputPaths: Array.from(outputPathsRef.current),
        animationOutputPaths: Object.fromEntries(
          animationOutputPathsRef.current,
        ),
      },
    ) => {
      const appliedUpdates = resolveRuntimeGraphBundleAppliedUpdates(
        updates,
        options,
      ).filter((update) => {
        let accepted = true;
        let requiredRouteCount: number | null = null;
        if (
          update.source.key !== "animation" ||
          !update.source.requiresOutputRoutes
        ) {
          accepted = true;
        } else {
          const animationId = update.source.animationId?.trim();
          if (animationId) {
            requiredRouteCount =
              registration.animationOutputPaths[animationId]?.length ?? 0;
            accepted = requiredRouteCount > 0;
          }
        }
        if (isRuntimeDebugEnabled() && update.source.key === "animation") {
          console.log("[vizij-runtime] graph bundle animation ack gate", {
            source: update.source,
            accepted,
            requiredRouteCount,
            animationOutputPaths: registration.animationOutputPaths,
          });
        }
        return accepted;
      });
      if (appliedUpdates.length === 0) {
        return;
      }
      pendingGraphBundleUpdatesRef.current =
        removeRuntimeGraphBundlePendingUpdates(
          pendingGraphBundleUpdatesRef.current,
          appliedUpdates,
        );
      appliedUpdates.forEach((update) => {
        onRuntimeGraphBundleApplied?.({
          revision: update.revision,
          source: update.source,
          controllers,
          outputPaths: registration.outputPaths,
          animationOutputPaths: registration.animationOutputPaths,
          reregistered: update.reregistered,
          reloadedAssets: update.reloadedAssets,
        });
      });
    },
    [onRuntimeGraphBundleApplied],
  );

  useEffect(() => {
    autostartRef.current = autostart;
    updateLoopMode();
  }, [autostart, updateLoopMode]);

  const clearControllers = useCallback(() => {
    const result = clearRuntimeControllers({
      host: {
        listControllers,
        removeGraph,
        removeAnimation,
      },
      namespace,
      graphIds: [
        ...registeredGraphsRef.current,
        ...programControllerIdsRef.current.values(),
      ],
      animationIds: registeredAnimationsRef.current,
    });
    result.errors.forEach((error) => {
      pushHostError(
        error,
        resolveRuntimeGraphBundleErrorSources(
          error,
          pendingGraphBundleUpdatesRef.current,
        ),
      );
    });
    registeredGraphsRef.current = [];
    registeredAnimationsRef.current = [];
    animationControllerIdsRef.current.clear();
    animationOutputPathsRef.current.clear();
    ignoredAnimationOutputPathsRef.current.clear();
    programRegistrationMapRef.current.clear();
    programControllerIdsRef.current.clear();
    mergedGraphRef.current = null;
    outputPathsRef.current = new Set();
    baseOutputPathsRef.current = new Set();
    namespacedOutputPathsRef.current = new Set();
    inputConstraintsRef.current = {};
    setInputConstraints({});
    rigPoseControlInputIdsRef.current = new Set();
    clipOutputValuesRef.current.clear();
    clipAggregateValuesRef.current.clear();
    animationInputBaselinesRef.current.clear();
    programInputBaselinesRef.current.clear();
    programRendererBaselinesRef.current.clear();
    stagedInputsRef.current.clear();
    frameCountRef.current = 0;
    frameWriteCountRef.current = 0;
    rendererWriteCountRef.current = 0;
    lastFrameWriteCountRef.current = 0;
    lastRendererWriteCountRef.current = 0;
    lastFrameWritePathsRef.current = [];
    lastRendererWriteIdsRef.current = [];
    lastFrameWriteSamplesRef.current = [];
    lastRendererWriteSamplesRef.current = [];
    hostAnimationSampleCountRef.current = 0;
    orchestratorAnimationCommandCountRef.current = 0;
    orchestratorAnimationFallbackCountRef.current = 0;
    lastAnimationCommandPathsRef.current = [];
    lastHostAnimationSampleIdRef.current = null;
  }, [listControllers, namespace, removeAnimation, removeGraph, pushHostError]);

  useEffect(() => {
    namespaceRef.current = namespace;
    reportStatus((prev) => ({
      ...prev,
      namespace,
      faceId,
    }));
  }, [namespace, faceId, reportStatus]);

  useEffect(() => {
    driveOrchestratorRef.current = driveOrchestrator;
  }, [driveOrchestrator]);

  useEffect(() => {
    animationTransportRef.current = animationTransport;
  }, [animationTransport]);

  const addAnimationOutputRoutesToSet = useCallback(
    (target: Set<string>, paths: Iterable<string>) => {
      Array.from(paths).forEach((rawPath) => {
        const normalizedPath = normalisePath(rawPath);
        if (!normalizedPath) {
          return;
        }
        const basePath = stripNamespace(normalizedPath, namespaceRef.current);
        target.add(normalizedPath);
        if (basePath) {
          target.add(basePath);
          target.add(namespaceTypedPath(basePath, namespaceRef.current));
        }
      });
    },
    [],
  );

  const muteAnimationOutputRoutes = useCallback(
    (id: string) => {
      const paths = animationOutputPathsRef.current.get(id);
      if (!paths || paths.length === 0) {
        return;
      }
      const next = new Set(ignoredAnimationOutputPathsRef.current);
      addAnimationOutputRoutesToSet(next, paths);
      ignoredAnimationOutputPathsRef.current = next;
    },
    [addAnimationOutputRoutesToSet],
  );

  const unmuteAnimationOutputRoutes = useCallback(
    (id: string) => {
      const paths = animationOutputPathsRef.current.get(id);
      if (!paths || paths.length === 0) {
        return;
      }
      const removed = new Set<string>();
      addAnimationOutputRoutesToSet(removed, paths);
      ignoredAnimationOutputPathsRef.current = new Set(
        Array.from(ignoredAnimationOutputPathsRef.current).filter(
          (path) => !removed.has(path),
        ),
      );
    },
    [addAnimationOutputRoutesToSet],
  );

  const syncMutedAnimationOutputRoutes = useCallback(() => {
    const next = new Set<string>();
    animationOutputPathsRef.current.forEach((paths, id) => {
      if (clipPlaybackRef.current.has(id)) {
        return;
      }
      addAnimationOutputRoutesToSet(next, paths);
    });
    ignoredAnimationOutputPathsRef.current = next;
  }, [addAnimationOutputRoutesToSet]);

  const muteAllAnimationOutputRoutes = useCallback(() => {
    const next = new Set<string>();
    animationOutputPathsRef.current.forEach((paths) => {
      addAnimationOutputRoutesToSet(next, paths);
    });
    ignoredAnimationOutputPathsRef.current = next;
  }, [addAnimationOutputRoutesToSet]);

  const glbAsset = effectiveAssetBundle.glb;

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
    clearControllers();
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
        let loadedAsset: Parameters<typeof prepareRuntimeLoadedAssetPayload>[1];

        if (glbAsset.kind === "url") {
          loadedAsset = await loadGLTFWithBundle(
            glbAsset.src,
            [namespace],
            glbAsset.aggressiveImport ?? false,
            glbAsset.rootBounds,
          );
        } else if (glbAsset.kind === "blob") {
          loadedAsset = await loadGLTFFromBlobWithBundle(
            glbAsset.blob,
            [namespace],
            glbAsset.aggressiveImport ?? false,
            glbAsset.rootBounds,
          );
        } else {
          loadedAsset = null;
        }

        if (cancelled) {
          return;
        }

        const loadedPayload = prepareRuntimeLoadedAssetPayload(
          sourceAssetBundle,
          loadedAsset,
        );
        setExtractedBundle(loadedPayload.bundle);
        setExtractedAnimations(loadedPayload.animations);

        const rootId = findRootId(loadedPayload.world as Record<string, any>);
        store
          .getState()
          .addWorldElements(
            loadedPayload.world as any,
            loadedPayload.animatables as Record<string, AnimatableValue>,
            true,
          );

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
        pendingGraphBundleUpdatesRef.current = [];
        pendingProgramRegistrationUpdatesRef.current.clear();
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
    sourceAssetBundle,
    namespace,
    faceId,
    store,
    pushError,
    reportStatus,
    resetErrors,
    clearControllers,
    setExtractedBundle,
    setExtractedAnimations,
    status.rootId,
  ]);

  useEffect(() => {
    if (!ready && autoCreate) {
      createOrchestrator(createOptions).catch((err: unknown) => {
        pushError({
          message: "Failed to create orchestrator runtime",
          cause: err,
          phase: "orchestrator",
          timestamp: performance.now(),
        });
      });
    }
  }, [ready, autoCreate, createOptions, createOrchestrator, pushError]);

  const registerControllers = useCallback(async () => {
    clearControllers();

    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registerControllers", {
        hasRig: Boolean(assetBundle.rig),
        hasPose: Boolean(assetBundle.pose?.graph),
        animationCount: assetBundle.animations?.length ?? 0,
        animationIds: (assetBundle.animations ?? []).map((anim) => anim.id),
        animationTransport,
        namespace,
      });
    }

    rigInputMapRef.current = {};
    rigPoseControlInputIdsRef.current = new Set();
    poseControlBridgeValuesRef.current.clear();

    const plan = prepareRuntimeRegistrationPlan({
      assetBundle,
      namespace,
      faceId: faceId ?? undefined,
      programs: resolvedProgramAssets,
    });

    const errorDiagnostics = plan.diagnostics.filter(
      (diagnostic) => diagnostic.level === "error",
    );

    plan.diagnostics.forEach((diagnostic) => {
      if (diagnostic.level === "error") {
        pushError({
          message: diagnostic.message,
          phase: "registration",
          timestamp: performance.now(),
        });
        return;
      }

      if (diagnostic.target === "pose" || isRuntimeDebugEnabled()) {
        console.warn("[vizij-runtime]", diagnostic.message);
      }
    });

    if (isRuntimeDebugEnabled()) {
      const blinkKeys = Object.keys(plan.rigInputMap).filter((key) =>
        key.toLowerCase().includes("blink"),
      );
      const blinkMappings = blinkKeys
        .slice(0, 20)
        .map((key) => `${key} => ${plan.rigInputMap[key] ?? "?"}`);
      console.log("[vizij-runtime] rig input map sample", {
        blink: plan.rigInputMap["blink"] ?? null,
        blinkKeys: blinkKeys.slice(0, 12),
        blinkMappings: blinkMappings.join(" | "),
      });
      plan.animationRegistrations.forEach((registration) => {
        console.log("[vizij-runtime] animation output routing", {
          animationId: registration.assetId,
          bridgeOutputs: registration.outputPaths,
          bridgeOutputsText: registration.outputPaths.join(" | "),
        });
      });
    }

    const result = registerRuntimeControllers({
      host: {
        registerGraph,
        registerMergedGraph,
        registerAnimation,
        setInput,
        listControllers,
      },
      plan,
      namespace,
      mergeStrategy,
      defaultMergeStrategy: DEFAULT_MERGE,
      animationTransport,
      initialInputs: assetBundle.initialInputs,
      previousMergedGraphId: mergedGraphRef.current,
    });
    result.errors.forEach((error) => {
      if (isRuntimeDebugEnabled() && error.phase === "animation") {
        console.warn("[vizij-runtime] failed animation registration", {
          message: error.message,
          error:
            error.cause instanceof Error
              ? error.cause.message
              : String(error.cause),
        });
      }
      pushHostError(
        error,
        resolveRuntimeGraphBundleErrorSources(
          error,
          pendingGraphBundleUpdatesRef.current,
        ),
      );
    });

    const appliedRegistration = applyRuntimeControllerRegistrationResult(
      result,
      {
        rigInputMapRef,
        rigPoseControlInputIdsRef,
        inputConstraintsRef,
        setInputConstraints,
        programRegistrationMapRef,
        bumpProgramRegistrationToken: () => {
          setProgramRegistrationToken((prev) => prev + 1);
        },
        outputPathsRef,
        baseOutputPathsRef,
        namespacedOutputPathsRef,
        mergedGraphRef,
        registeredGraphsRef,
        registeredAnimationsRef,
        animationControllerIdsRef,
        animationOutputPathsRef,
      },
    );
    syncMutedAnimationOutputRoutes();
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registered graph ids", result.graphIds);
    }

    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] controllers after register", {
        controllers: result.controllers,
        graphIds: result.graphIds,
        animationIds: result.animationIds,
      });
    }
    const runtimeReady =
      errorDiagnostics.length === 0 && result.errors.length === 0;
    reportStatus((prev) => ({
      ...prev,
      ready: runtimeReady,
      loading: false,
      controllers: result.controllers,
      outputPaths: runtimeReady ? appliedRegistration.outputPaths : [],
    }));
    if (runtimeReady) {
      onRegisterControllers?.(result.controllers);
      setAnimationRegistrationToken((prev) => prev + 1);
      notifyGraphBundleApplied(
        result.controllers,
        pendingGraphBundleUpdatesRef.current,
        {},
        appliedRegistration,
      );
    } else {
      pendingGraphBundleUpdatesRef.current = [];
      pendingProgramRegistrationUpdatesRef.current.clear();
    }
  }, [
    assetBundle,
    animationTransport,
    clearControllers,
    faceId,
    listControllers,
    mergeStrategy,
    namespace,
    notifyGraphBundleApplied,
    onRegisterControllers,
    pushError,
    pushHostError,
    registerAnimation,
    registerGraph,
    registerMergedGraph,
    reportStatus,
    resolvedProgramAssets,
    setInput,
    syncMutedAnimationOutputRoutes,
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

  const resolveNeutralRuntimeInputValue = useCallback(
    (
      path: string,
      inputId?: string | null,
      options?: { includeNeutralInputs?: boolean },
    ): ValueJSON => {
      const normalizedPath = stripNamespace(
        normalisePath(path),
        namespaceRef.current,
      );
      const namespacedPath = namespaceTypedPath(
        normalizedPath,
        namespaceRef.current,
      );
      const resolvedInputId =
        inputId ??
        Object.entries(rigInputMapRef.current).find(([, mappedPath]) => {
          const normalizedMappedPath = stripNamespace(
            normalisePath(mappedPath),
            namespaceRef.current,
          );
          return normalizedMappedPath === normalizedPath;
        })?.[0] ??
        null;
      const neutral =
        options?.includeNeutralInputs !== false && resolvedInputId != null
          ? assetBundle.pose?.config?.neutralInputs?.[resolvedInputId]
          : undefined;
      if (typeof neutral === "number" && Number.isFinite(neutral)) {
        return { float: neutral };
      }
      const constraint =
        (resolvedInputId != null
          ? inputConstraintsRef.current[resolvedInputId]
          : undefined) ??
        inputConstraintsRef.current[normalizedPath] ??
        inputConstraintsRef.current[namespacedPath];
      const defaultValue = constraint?.defaultValue;
      if (typeof defaultValue === "number" && Number.isFinite(defaultValue)) {
        return { float: defaultValue };
      }
      return {
        float: 0,
      };
    },
    [
      assetBundle.faceId,
      assetBundle.pose?.config?.faceId,
      assetBundle.pose?.config?.neutralInputs,
      faceId,
    ],
  );

  const resolveCurrentRuntimeInputValue = useCallback(
    (path: string, options?: { includeNeutralInputs?: boolean }): ValueJSON => {
      const normalizedPath = stripNamespace(
        normalisePath(path),
        namespaceRef.current,
      );
      const namespacedPath = namespaceTypedPath(
        normalizedPath,
        namespaceRef.current,
      );
      return (
        getPathSnapshot(namespacedPath) ??
        getPathSnapshot(normalizedPath) ??
        resolveNeutralRuntimeInputValue(normalizedPath, null, options)
      );
    },
    [getPathSnapshot, resolveNeutralRuntimeInputValue],
  );

  const captureAnimationInputBaselineForPaths = useCallback(
    (id: string, paths: Iterable<string>) => {
      const baseline =
        animationInputBaselinesRef.current.get(id) ??
        new Map<string, ValueJSON>();
      Array.from(paths).forEach((path) => {
        const normalizedPath = stripNamespace(
          normalisePath(path),
          namespaceRef.current,
        );
        if (!normalizedPath || baseline.has(normalizedPath)) {
          return;
        }
        baseline.set(
          normalizedPath,
          resolveCurrentRuntimeInputValue(normalizedPath, {
            includeNeutralInputs: false,
          }),
        );
      });
      if (baseline.size === 0) {
        return;
      }
      animationInputBaselinesRef.current.set(id, baseline);
      lastAnimationBaselineDebugRef.current = {
        ...lastAnimationBaselineDebugRef.current,
        capturedInputId: id,
        capturedInputCount: baseline.size,
        capturedInputPaths: Array.from(baseline.keys()).slice(0, 20),
      };
      publishRuntimeDebugState();
    },
    [publishRuntimeDebugState, resolveCurrentRuntimeInputValue],
  );

  const captureAnimationInputBaselines = useCallback(
    (inputs: Array<{ path: string; value: ValueJSON }>) => {
      const activeClipIds = Array.from(clipPlaybackRef.current.values())
        .filter((state) => state.playing)
        .map((state) => state.id);
      if (activeClipIds.length === 0 || inputs.length === 0) {
        return;
      }
      activeClipIds.forEach((id) => {
        const baseline =
          animationInputBaselinesRef.current.get(id) ??
          new Map<string, ValueJSON>();
        inputs.forEach(({ path }) => {
          const normalizedPath = stripNamespace(
            normalisePath(path),
            namespaceRef.current,
          );
          if (!normalizedPath || baseline.has(normalizedPath)) {
            return;
          }
          baseline.set(
            normalizedPath,
            resolveCurrentRuntimeInputValue(normalizedPath, {
              includeNeutralInputs: false,
            }),
          );
        });
        if (baseline.size > 0) {
          animationInputBaselinesRef.current.set(id, baseline);
        }
        lastAnimationBaselineDebugRef.current = {
          ...lastAnimationBaselineDebugRef.current,
          capturedInputId: id,
          capturedInputCount: baseline.size,
          capturedInputPaths: Array.from(baseline.keys()).slice(0, 20),
        };
      });
      publishRuntimeDebugState();
    },
    [publishRuntimeDebugState, resolveCurrentRuntimeInputValue],
  );

  const captureAnimationRendererBaselineForPaths = useCallback(
    (id: string, paths: Iterable<string>) => {
      const baseline =
        animationRendererBaselinesRef.current.get(id) ??
        new Map<string, RawValue>();
      const { animatables, values } = store.getState();
      const namespace = namespaceRef.current;
      Array.from(paths).forEach((path) => {
        const normalizedPath = normalisePath(path);
        const basePath = stripNamespace(normalizedPath, namespace);
        const targetId =
          (basePath && animatables[basePath] ? basePath : null) ??
          (normalizedPath && animatables[normalizedPath]
            ? normalizedPath
            : null);
        if (!targetId || baseline.has(targetId)) {
          return;
        }
        const currentValue =
          values.get(getLookup(namespace, targetId)) ??
          animatables[targetId]?.default;
        if (currentValue !== undefined) {
          baseline.set(targetId, currentValue);
        }
      });
      if (baseline.size === 0) {
        return;
      }
      animationRendererBaselinesRef.current.set(id, baseline);
      lastAnimationBaselineDebugRef.current = {
        ...lastAnimationBaselineDebugRef.current,
        capturedId: id,
        capturedCount: baseline.size,
        capturedPaths: Array.from(baseline.keys()).slice(0, 20),
      };
      publishRuntimeDebugState();
    },
    [publishRuntimeDebugState, store],
  );

  const captureAnimationRendererWriteBaselines = useCallback(
    (rendererWrites: RuntimeOutputWrite[]) => {
      const activeClipIds = Array.from(clipPlaybackRef.current.values())
        .filter((state) => state.playing)
        .map((state) => state.id);
      if (activeClipIds.length === 0 || rendererWrites.length === 0) {
        return;
      }
      const animatables = store.getState().animatables;
      activeClipIds.forEach((id) => {
        const baseline =
          animationRendererBaselinesRef.current.get(id) ??
          new Map<string, RawValue>();
        rendererWrites.forEach((write) => {
          if (baseline.has(write.id)) {
            return;
          }
          const fallbackValue = animatables[write.id]?.default;
          const value = write.currentValue ?? fallbackValue;
          if (value !== undefined) {
            baseline.set(write.id, value);
          }
        });
        if (baseline.size > 0) {
          animationRendererBaselinesRef.current.set(id, baseline);
        }
        lastAnimationBaselineDebugRef.current = {
          ...lastAnimationBaselineDebugRef.current,
          capturedId: id,
          capturedCount: baseline.size,
          capturedPaths: Array.from(baseline.keys()).slice(0, 20),
        };
      });
      publishRuntimeDebugState();
    },
    [publishRuntimeDebugState, store],
  );

  const captureProgramRendererWriteBaselines = useCallback(
    (rendererWrites: RuntimeOutputWrite[]) => {
      const activeProgramIds = Array.from(programPlaybackRef.current.values())
        .filter((state) => state.state === "playing")
        .map((state) => state.id);
      if (activeProgramIds.length === 0 || rendererWrites.length === 0) {
        return;
      }
      const animatables = store.getState().animatables;
      activeProgramIds.forEach((id) => {
        const baseline =
          programRendererBaselinesRef.current.get(id) ??
          new Map<string, RawValue>();
        rendererWrites.forEach((write) => {
          if (baseline.has(write.id)) {
            return;
          }
          const fallbackValue = animatables[write.id]?.default;
          const value = write.currentValue ?? fallbackValue;
          if (value !== undefined) {
            baseline.set(write.id, value);
          }
        });
        if (baseline.size > 0) {
          programRendererBaselinesRef.current.set(id, baseline);
        }
      });
    },
    [store],
  );

  const captureProgramInputWriteBaselines = useCallback(
    (inputs: Array<{ path: string; value: ValueJSON }>) => {
      const activeProgramIds = Array.from(programPlaybackRef.current.values())
        .filter((state) => state.state === "playing")
        .map((state) => state.id);
      if (activeProgramIds.length === 0 || inputs.length === 0) {
        return;
      }
      activeProgramIds.forEach((id) => {
        const baseline =
          programInputBaselinesRef.current.get(id) ??
          new Map<string, ValueJSON>();
        inputs.forEach(({ path }) => {
          const normalizedPath = stripNamespace(
            normalisePath(path),
            namespaceRef.current,
          );
          if (!normalizedPath || baseline.has(normalizedPath)) {
            return;
          }
          baseline.set(
            normalizedPath,
            resolveCurrentRuntimeInputValue(normalizedPath, {
              includeNeutralInputs: false,
            }),
          );
        });
        if (baseline.size > 0) {
          programInputBaselinesRef.current.set(id, baseline);
        }
      });
    },
    [resolveCurrentRuntimeInputValue],
  );

  useEffect(() => {
    if (!frame) {
      return;
    }
    const writes = frame.merged_writes ?? [];
    frameCountRef.current += 1;
    lastFrameWriteCountRef.current = writes.length;
    frameWriteCountRef.current += writes.length;
    lastFrameWritePathsRef.current = writes
      .map((write) => write.path)
      .filter((path): path is string => typeof path === "string")
      .slice(0, 20);
    lastFrameWriteSamplesRef.current = writes
      .map((write) => ({ path: write.path, value: write.value }))
      .filter(
        (write): write is RuntimeDebugFrameWriteSample =>
          typeof write.path === "string",
      )
      .slice(0, 20);
    if (!writes.length) {
      lastRendererWriteCountRef.current = 0;
      lastRendererWriteIdsRef.current = [];
      lastRendererWriteSamplesRef.current = [];
      publishRuntimeDebugState();
      return;
    }
    const setWorldValues = store.getState().setValues;
    const namespaceValue = status.namespace;
    const rendererTargetIds = new Set(
      Object.keys(store.getState().animatables),
    );
    const prepared = prepareRuntimeFrameWrites({
      writes,
      namespace: namespaceValue,
      namespacedOutputPaths: namespacedOutputPathsRef.current,
      baseOutputPaths: baseOutputPathsRef.current,
      ignoredOutputPaths: ignoredAnimationOutputPathsRef.current,
      rendererTargetIds,
      rigInputPathMap: rigInputMapRef.current,
      rigPoseControlInputIds: rigPoseControlInputIdsRef.current,
      poseControlBridgeValues: poseControlBridgeValuesRef.current,
      currentValues: store.getState().values,
      transformOutputWrite,
    });
    captureAnimationInputBaselines(prepared.poseControlInputs);
    captureProgramInputWriteBaselines(prepared.poseControlInputs);
    prepared.poseControlInputs.forEach(({ path, value }) => {
      setInput(path, value);
    });
    lastRendererWriteCountRef.current = prepared.rendererWrites.length;
    rendererWriteCountRef.current += prepared.rendererWrites.length;
    lastRendererWriteIdsRef.current = prepared.rendererWrites
      .map((write) => write.id)
      .slice(0, 20);
    lastRendererWriteSamplesRef.current = prepared.rendererWrites
      .map((write) => ({ id: write.id, value: write.value }))
      .slice(0, 20);
    if (prepared.rendererWrites.length > 0) {
      captureAnimationRendererWriteBaselines(prepared.rendererWrites);
      captureProgramRendererWriteBaselines(prepared.rendererWrites);
      setWorldValues(prepared.rendererWrites);
    }
    publishRuntimeDebugState();
  }, [
    frame,
    captureAnimationInputBaselines,
    captureAnimationRendererWriteBaselines,
    captureProgramInputWriteBaselines,
    captureProgramRendererWriteBaselines,
    publishRuntimeDebugState,
    setInput,
    status.namespace,
    store,
    transformOutputWrite,
  ]);

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
          setInput(path, resolveNeutralRuntimeInputValue(path, id));
        });
      }
      if (force || staged.size > 0) {
        poseControlBridgeValuesRef.current.clear();
      }
    },
    [
      assetBundle.pose?.config?.neutralInputs,
      assetBundle.pose?.stageNeutralFilter,
      resolveNeutralRuntimeInputValue,
      setInput,
    ],
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

  const restoreAnimationRendererBaseline = useCallback(
    (id: string): boolean => {
      const baseline = animationRendererBaselinesRef.current.get(id);
      if (!baseline || baseline.size === 0) {
        animationRendererBaselinesRef.current.delete(id);
        return false;
      }
      const namespace = namespaceRef.current;
      store.getState().setValues(
        Array.from(baseline.entries()).map(([path, value]) => ({
          id: path,
          namespace,
          value,
        })),
      );
      animationRendererBaselinesRef.current.delete(id);
      lastAnimationBaselineDebugRef.current = {
        ...lastAnimationBaselineDebugRef.current,
        restoredId: id,
        restoredCount: baseline.size,
        restoredPaths: Array.from(baseline.keys()).slice(0, 20),
      };
      publishRuntimeDebugState();
      return true;
    },
    [publishRuntimeDebugState, store],
  );

  const restoreAnimationInputBaseline = useCallback(
    (id: string): boolean => {
      const baseline = animationInputBaselinesRef.current.get(id);
      if (!baseline || baseline.size === 0) {
        animationInputBaselinesRef.current.delete(id);
        return false;
      }
      baseline.forEach((value, path) => {
        setInput(path, value);
      });
      flushStagedInputsToRuntime();
      poseControlBridgeValuesRef.current.clear();
      animationInputBaselinesRef.current.delete(id);
      lastAnimationBaselineDebugRef.current = {
        ...lastAnimationBaselineDebugRef.current,
        restoredInputId: id,
        restoredInputCount: baseline.size,
        restoredInputPaths: Array.from(baseline.keys()).slice(0, 20),
      };
      publishRuntimeDebugState();
      return true;
    },
    [flushStagedInputsToRuntime, publishRuntimeDebugState, setInput],
  );

  const captureProgramInputBaseline = useCallback(
    (program: VizijProgramAsset) => {
      const id = program.id;
      if (!id) {
        return;
      }
      const baseline =
        programInputBaselinesRef.current.get(id) ??
        new Map<string, ValueJSON>();
      deriveProgramResetValues({
        program,
        namespace: namespaceRef.current,
        inputConstraints: inputConstraintsRef.current,
      }).forEach(({ path }) => {
        const normalizedPath = stripNamespace(
          normalisePath(path),
          namespaceRef.current,
        );
        if (!normalizedPath || baseline.has(normalizedPath)) {
          return;
        }
        baseline.set(
          normalizedPath,
          resolveCurrentRuntimeInputValue(normalizedPath, {
            includeNeutralInputs: false,
          }),
        );
      });
      if (baseline.size > 0) {
        programInputBaselinesRef.current.set(id, baseline);
      }
    },
    [resolveCurrentRuntimeInputValue],
  );

  const resolveProgramStopResetValues = useCallback(
    (program: VizijProgramAsset): Array<{ path: string; value: number }> => {
      const namespace = namespaceRef.current;
      const values = new Map<string, number>();
      const addResetValue = (path: string, value: number) => {
        const normalizedPath = stripNamespace(normalisePath(path), namespace);
        if (!normalizedPath || values.has(normalizedPath)) {
          return;
        }
        values.set(normalizedPath, Number.isFinite(value) ? value : 0);
      };

      deriveProgramResetValues({
        program,
        namespace,
        inputConstraints: inputConstraintsRef.current,
      }).forEach(({ path, value }) => addResetValue(path, value));

      const graphSpec = resolveGraphSpec(
        program.graph,
        `${program.id ?? "program"} graph (stop reset)`,
      );
      if (graphSpec) {
        collectOutputPaths(graphSpec).forEach((path) => {
          const neutralValue = valueAsNumber(
            resolveNeutralRuntimeInputValue(path),
          );
          addResetValue(path, neutralValue ?? 0);
        });
      }

      return Array.from(values.entries()).map(([path, value]) => ({
        path,
        value,
      }));
    },
    [resolveNeutralRuntimeInputValue],
  );

  const restoreProgramInputBaseline = useCallback(
    (id: string): boolean => {
      const baseline = programInputBaselinesRef.current.get(id);
      if (!baseline || baseline.size === 0) {
        programInputBaselinesRef.current.delete(id);
        return false;
      }
      baseline.forEach((value, path) => {
        setInput(path, value);
      });
      flushStagedInputsToRuntime();
      poseControlBridgeValuesRef.current.clear();
      programInputBaselinesRef.current.delete(id);
      return true;
    },
    [flushStagedInputsToRuntime, setInput],
  );

  const restoreProgramRendererBaseline = useCallback(
    (id: string): boolean => {
      const baseline = programRendererBaselinesRef.current.get(id);
      if (!baseline || baseline.size === 0) {
        programRendererBaselinesRef.current.delete(id);
        return false;
      }
      const namespace = namespaceRef.current;
      store.getState().setValues(
        Array.from(baseline.entries()).map(([path, value]) => ({
          id: path,
          namespace,
          value,
        })),
      );
      programRendererBaselinesRef.current.delete(id);
      return true;
    },
    [store],
  );

  const applyProgramRendererStopValues = useCallback(
    (
      program: VizijProgramAsset,
      restoredTargetIds: ReadonlySet<string>,
    ): boolean => {
      const { animatables } = store.getState();
      const namespace = namespaceRef.current;
      const writes = resolveProgramStopResetValues(program).flatMap(
        ({ path, value }) => {
          const normalizedPath = normalisePath(path);
          const basePath = stripNamespace(normalizedPath, namespace);
          const targetId =
            (basePath && animatables[basePath] ? basePath : null) ??
            (normalizedPath && animatables[normalizedPath]
              ? normalizedPath
              : null);
          if (!targetId || restoredTargetIds.has(targetId)) {
            return [];
          }
          return [
            {
              id: targetId,
              namespace,
              value: animatables[targetId]?.default ?? value,
            },
          ];
        },
      );
      if (writes.length === 0) {
        return false;
      }
      store.getState().setValues(writes);
      return true;
    },
    [resolveProgramStopResetValues, store],
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

  const setAnimationInput = useCallback(
    (path: string, value: number, options?: { immediate?: boolean }) => {
      setInput(path, { float: value });
      if (!options?.immediate) {
        return;
      }
      flushStagedRuntimeInput({
        stagedInputs: stagedInputsRef.current,
        namespace: namespaceRef.current,
        path,
        fallbackValue: { float: value },
        setInput: orchestratorSetInput,
      });
    },
    [orchestratorSetInput, setInput],
  );

  const clearAnimationInput = useCallback(
    (path: string) => {
      clearStagedRuntimeInput({
        stagedInputs: stagedInputsRef.current,
        namespace: namespaceRef.current,
        path,
        removeInput,
      });
    },
    [removeInput],
  );

  const pulseAnimationControllerInputs = useCallback(
    (
      id: string,
      inputs: Array<{ path: string; value: ValueJSON }>,
    ): boolean => {
      const controllerId = animationControllerIdsRef.current.get(id);
      if (!controllerId || inputs.length === 0) {
        return false;
      }
      try {
        inputs.forEach(({ path, value }) => {
          orchestratorSetInput(path, value);
        });
        stepRuntime(0);
        orchestratorAnimationCommandCountRef.current += inputs.length;
        lastAnimationCommandPathsRef.current = inputs
          .map(({ path }) => path)
          .slice(0, 20);
        publishRuntimeDebugState();
      } catch (err: unknown) {
        pushError({
          message: `Failed to stage animation command for ${id}`,
          cause: err,
          phase: "animation",
          timestamp: performance.now(),
        });
        return false;
      } finally {
        inputs.forEach(({ path }) => {
          try {
            removeInput(path);
          } catch {
            // Best-effort cleanup; the command step above is the source of truth.
          }
        });
      }
      return true;
    },
    [
      orchestratorSetInput,
      publishRuntimeDebugState,
      pushError,
      removeInput,
      stepRuntime,
    ],
  );

  const pulseAnimationControllerCommands = useCallback(
    (
      id: string,
      commands: Array<{ action: string; value: ValueJSON }>,
    ): boolean => {
      const controllerId = animationControllerIdsRef.current.get(id);
      if (!controllerId) {
        return false;
      }
      return pulseAnimationControllerInputs(
        id,
        commands.map(({ action, value }) => ({
          path: buildAnimationControllerCommandPath(controllerId, action),
          value,
        })),
      );
    },
    [pulseAnimationControllerInputs],
  );

  const buildClipOutputValues = useCallback(
    (
      clip: VizijAnimationAsset,
      state: ClipPlaybackState,
    ): Map<string, number> =>
      sampleAnimationClipOutputValues(
        clip.clip as AnimationClipLike,
        state.time,
        state.weight,
        faceId ?? undefined,
        rigInputMapRef.current,
      ),
    [faceId],
  );

  const computeClipAggregateValues = useCallback((): Map<string, number> => {
    const aggregate = new Map<string, number>();
    clipOutputValuesRef.current.forEach((outputValues) => {
      outputValues.forEach((value, path) => {
        aggregate.set(path, (aggregate.get(path) ?? 0) + value);
      });
    });
    return aggregate;
  }, []);

  const stageClipAggregateValues = useCallback(
    (nextAggregate: Map<string, number>, options?: { immediate?: boolean }) => {
      diffAnimationAggregateValues(
        clipAggregateValuesRef.current,
        nextAggregate,
      ).forEach((operation) => {
        if (operation.kind === "clear") {
          clearAnimationInput(operation.path);
          return;
        }
        setAnimationInput(operation.path, operation.value, options);
      });

      clipAggregateValuesRef.current = nextAggregate;
    },
    [clearAnimationInput, setAnimationInput],
  );

  const syncClipOutputs = useCallback(
    (options?: { immediate?: boolean }) => {
      stageClipAggregateValues(computeClipAggregateValues(), options);
    },
    [computeClipAggregateValues, stageClipAggregateValues],
  );

  const writeClipOutputs = useCallback(
    (
      clip: VizijAnimationAsset,
      state: ClipPlaybackState,
      options?: { immediate?: boolean },
    ) => {
      if (!animationSystemActiveRef.current) {
        return;
      }
      const outputValues = buildClipOutputValues(clip, state);
      hostAnimationSampleCountRef.current += 1;
      lastHostAnimationSampleIdRef.current = clip.id;
      clipOutputValuesRef.current.set(clip.id, outputValues);
      syncClipOutputs(options);
      publishRuntimeDebugState();
    },
    [buildClipOutputValues, publishRuntimeDebugState, syncClipOutputs],
  );

  const clearClipOutputs = useCallback(
    (clipId: string, options?: { immediate?: boolean }) => {
      if (!clipOutputValuesRef.current.has(clipId)) {
        return;
      }
      clipOutputValuesRef.current.delete(clipId);
      syncClipOutputs(options);
    },
    [syncClipOutputs],
  );

  const hostAnimationFallback = useMemo(
    () =>
      createHostAnimationFallbackPlayback<VizijAnimationAsset>({
        resolveClipById,
        resolveClipPromise,
        writeClipOutputs,
        clearClipOutputs,
        resolveClipDuration: (clip, fallbackDuration) =>
          resolveClipDurationSeconds(
            clip.clip as AnimationClipLike,
            fallbackDuration,
          ),
      }),
    [clearClipOutputs, resolveClipById, resolveClipPromise, writeClipOutputs],
  );

  const createClipPlaybackState = useCallback(
    (clip: VizijAnimationAsset): ClipPlaybackState => {
      const duration = resolveClipDurationSeconds(
        clip.clip as AnimationClipLike,
      );
      return {
        id: clip.id,
        time: 0,
        duration,
        speed: 1,
        weight: Number.isFinite(clip.weight) ? Number(clip.weight) : 1,
        loop: false,
        playing: false,
        resolve: null,
        completion: null,
      };
    },
    [],
  );

  const ensureClipPlaybackState = useCallback(
    (
      id: string,
    ): { clip: VizijAnimationAsset; state: ClipPlaybackState } | null => {
      const clip = resolveClipById(id);
      if (!clip) {
        return null;
      }
      const existing = clipPlaybackRef.current.get(id);
      if (existing) {
        existing.duration = resolveClipDurationSeconds(
          clip.clip as AnimationClipLike,
          existing.duration,
        );
        existing.time = clampAnimationTime(existing.time, existing.duration);
        return { clip, state: existing };
      }
      const next = createClipPlaybackState(clip);
      clipPlaybackRef.current.set(id, next);
      return { clip, state: next };
    },
    [createClipPlaybackState, resolveClipById],
  );

  const advanceClipPlayback = useCallback(
    (dt: number) => {
      if (clipPlaybackRef.current.size === 0) {
        return;
      }
      hostAnimationFallback.advance({
        states: clipPlaybackRef.current,
        dt,
        hostOwnsClipOutputs: animationTransportRef.current !== "orchestrator",
        animationSystemActive: animationSystemActiveRef.current,
      });
    },
    [hostAnimationFallback],
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
      const poseControlWrites = resolveLegacyPoseWeightControlWrites({
        enabled: useLegacyPoseWeightFallback,
        poseWeightPath: basePath,
        poseWeightValue: targetValue,
        poseWeightFallbackMap,
        faceId: assetBundle.pose?.config?.faceId ?? faceId ?? "face",
        rigInputPathMap: rigInputMapRef.current,
      });
      if (poseControlWrites.length > 0) {
        return Promise.all(
          poseControlWrites.map((write) => {
            return animateValue(write.path, { float: write.value }, options);
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

  const recordOrchestratorAnimationFallback = useCallback(
    (id: string) => {
      if (animationTransportRef.current !== "orchestrator") {
        return;
      }
      orchestratorAnimationFallbackCountRef.current += 1;
      lastHostAnimationSampleIdRef.current = id;
      publishRuntimeDebugState();
    },
    [publishRuntimeDebugState],
  );

  const pushMissingAnimationControllerError = useCallback(
    (id: string, action: string): Error => {
      const error = new Error(
        `Cannot ${action} animation ${id} through orchestrator transport because no animation controller was registered.`,
      );
      pushError({
        message: error.message,
        cause: error,
        phase: "animation",
        timestamp: performance.now(),
      });
      return error;
    },
    [pushError],
  );

  const requireAnimationControllerId = useCallback(
    (id: string, action: string): string | null => {
      if (animationTransportRef.current !== "orchestrator") {
        return null;
      }
      const controllerId = animationControllerIdsRef.current.get(id);
      if (!controllerId) {
        pushMissingAnimationControllerError(id, action);
        return null;
      }
      return controllerId;
    },
    [pushMissingAnimationControllerError],
  );

  const playAnimation = useCallback(
    (id: string, options?: PlayAnimationOptions) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return Promise.reject(
          new Error(`Animation ${id} is not part of the current asset bundle.`),
        );
      }
      const { clip, state } = ensured;
      const orchestratorControllerId =
        animationTransportRef.current === "orchestrator"
          ? requireAnimationControllerId(id, "play")
          : null;
      if (
        animationTransportRef.current === "orchestrator" &&
        !orchestratorControllerId
      ) {
        return Promise.reject(
          new Error(
            `Cannot play animation ${id} through orchestrator transport because no animation controller was registered.`,
          ),
        );
      }
      const shouldReset = options?.reset === true;
      if (shouldReset) {
        resolveClipPromise(state);
        state.time = 0;
      }
      const speed = options?.speed ?? state.speed ?? 1;
      const weight = options?.weight ?? state.weight ?? clip.weight ?? 1;
      state.speed = Number.isFinite(speed) && speed > 0 ? speed : 1;
      state.weight = Number.isFinite(weight) ? Number(weight) : 1;
      state.duration = resolveClipDurationSeconds(
        clip.clip as AnimationClipLike,
        state.duration,
      );
      state.time = clampAnimationTime(state.time, state.duration);
      const animationOutputPaths =
        animationOutputPathsRef.current.get(id) ?? [];
      captureAnimationInputBaselineForPaths(id, animationOutputPaths);
      captureAnimationRendererBaselineForPaths(id, animationOutputPaths);
      animationSystemActiveRef.current = true;
      unmuteAnimationOutputRoutes(id);

      if (orchestratorControllerId) {
        const commandAccepted = pulseAnimationControllerInputs(
          id,
          buildAnimationControllerPlayInputs(orchestratorControllerId, {
            reset: shouldReset,
            loop: state.loop,
            speed: state.speed,
            weight: state.weight,
          }),
        );
        if (!commandAccepted) {
          state.playing = false;
          clipPlaybackRef.current.set(id, state);
          return Promise.reject(
            new Error(
              `Cannot play animation ${id} through orchestrator transport because no animation controller was registered or commandable.`,
            ),
          );
        }
      } else {
        recordOrchestratorAnimationFallback(id);
        writeClipOutputs(clip, state);
      }
      state.playing = true;

      const completion = ensureClipPromise(state);
      clipPlaybackRef.current.set(id, state);
      markActivity();
      return completion;
    },
    [
      ensureClipPlaybackState,
      ensureClipPromise,
      captureAnimationInputBaselineForPaths,
      captureAnimationRendererBaselineForPaths,
      markActivity,
      pulseAnimationControllerInputs,
      recordOrchestratorAnimationFallback,
      requireAnimationControllerId,
      resolveClipPromise,
      unmuteAnimationOutputRoutes,
      writeClipOutputs,
    ],
  );

  useEffect(() => {
    if (
      animationRegistrationToken === 0 ||
      animationTransportRef.current !== "orchestrator"
    ) {
      return;
    }
    clipPlaybackRef.current.forEach((state, id) => {
      if (!state.playing) {
        return;
      }
      const controllerId = animationControllerIdsRef.current.get(id);
      if (!controllerId) {
        return;
      }
      pulseAnimationControllerInputs(id, [
        {
          path: buildAnimationControllerCommandPath(controllerId, "seek"),
          value: { float: state.time },
        },
        ...buildAnimationControllerPlayInputs(controllerId, {
          reset: false,
          loop: state.loop,
          speed: state.speed,
          weight: state.weight,
        }),
      ]);
      markActivity();
    });
  }, [
    animationRegistrationToken,
    markActivity,
    pulseAnimationControllerInputs,
  ]);

  const pauseAnimation = useCallback(
    (id: string) => {
      const state = clipPlaybackRef.current.get(id);
      if (!state || !state.playing) {
        return;
      }
      state.playing = false;
      if (animationTransportRef.current === "orchestrator") {
        const controllerId = requireAnimationControllerId(id, "pause");
        if (!controllerId) {
          return;
        }
        pulseAnimationControllerInputs(
          id,
          buildAnimationControllerPauseInputs(controllerId),
        );
      }
      updateLoopMode();
    },
    [
      pulseAnimationControllerInputs,
      requireAnimationControllerId,
      updateLoopMode,
    ],
  );

  const seekAnimation = useCallback(
    (id: string, timeSeconds: number) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return;
      }
      const { clip, state } = ensured;
      if (animationTransportRef.current === "orchestrator") {
        if (!requireAnimationControllerId(id, "seek")) {
          return;
        }
      }
      state.time = clampAnimationTime(timeSeconds, state.duration);
      clipPlaybackRef.current.set(id, state);
      if (animationTransportRef.current === "orchestrator") {
        pulseAnimationControllerCommands(id, [
          { action: "seek", value: { float: state.time } },
        ]);
      } else {
        recordOrchestratorAnimationFallback(id);
        writeClipOutputs(clip, state, { immediate: true });
      }
    },
    [
      ensureClipPlaybackState,
      pulseAnimationControllerCommands,
      recordOrchestratorAnimationFallback,
      requireAnimationControllerId,
      writeClipOutputs,
    ],
  );

  const setAnimationLoop = useCallback(
    (id: string, enabled: boolean) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return;
      }
      if (animationTransportRef.current === "orchestrator") {
        if (!requireAnimationControllerId(id, "set loop for")) {
          return;
        }
      }
      ensured.state.loop = Boolean(enabled);
      clipPlaybackRef.current.set(id, ensured.state);
      if (animationTransportRef.current === "orchestrator") {
        pulseAnimationControllerCommands(id, [
          { action: "set_loop", value: enabled ? "loop" : "once" },
        ]);
      }
      updateLoopMode();
    },
    [
      ensureClipPlaybackState,
      pulseAnimationControllerCommands,
      requireAnimationControllerId,
      updateLoopMode,
    ],
  );

  const getAnimationState = useCallback(
    (id: string): AnimationPlaybackState | null => {
      const state = clipPlaybackRef.current.get(id);
      if (!state) {
        return null;
      }
      return {
        time: state.time,
        duration: state.duration,
        playing: state.playing,
        loop: state.loop,
        speed: state.speed,
      };
    },
    [],
  );

  const hasAnimationController = useCallback(
    (id: string): boolean => animationControllerIdsRef.current.has(id),
    [],
  );

  const getAnimationOutputPaths = useCallback((id: string): string[] => {
    return [...(animationOutputPathsRef.current.get(id) ?? [])];
  }, []);

  const stopAnimation = useCallback(
    (id: string, options?: StopAnimationOptions) => {
      const shouldClearOutputs = options?.clearOutputs !== false;
      const state = clipPlaybackRef.current.get(id);
      const hadPlaybackState = Boolean(state);
      const hadClipOutputs = clipOutputValuesRef.current.has(id);
      if (state) {
        clipPlaybackRef.current.delete(id);
        state.playing = false;
        resolveClipPromise(state);
      }
      if (animationTransportRef.current === "orchestrator") {
        const controllerId = requireAnimationControllerId(id, "stop");
        if (!controllerId) {
          updateLoopMode();
          if (shouldClearOutputs) {
            muteAnimationOutputRoutes(id);
          }
          const restoredBaseline = shouldClearOutputs
            ? restoreAnimationRendererBaseline(id)
            : false;
          const restoredInputBaseline = shouldClearOutputs
            ? restoreAnimationInputBaseline(id)
            : false;
          if (
            shouldClearOutputs &&
            !restoredBaseline &&
            !restoredInputBaseline &&
            (hadPlaybackState || hadClipOutputs)
          ) {
            stagePoseNeutral(true);
          }
          return;
        }
        if (shouldClearOutputs) {
          muteAnimationOutputRoutes(id);
        }
        pulseAnimationControllerInputs(
          id,
          buildAnimationControllerStopInputs(controllerId),
        );
        if (shouldClearOutputs) {
          clearClipOutputs(id, { immediate: true });
        }
      } else {
        if (shouldClearOutputs) {
          recordOrchestratorAnimationFallback(id);
          muteAnimationOutputRoutes(id);
          clearClipOutputs(id);
        }
      }
      updateLoopMode();
      const restoredBaseline = shouldClearOutputs
        ? restoreAnimationRendererBaseline(id)
        : false;
      const restoredInputBaseline = shouldClearOutputs
        ? restoreAnimationInputBaseline(id)
        : false;
      if (
        shouldClearOutputs &&
        !restoredBaseline &&
        !restoredInputBaseline &&
        (hadPlaybackState || hadClipOutputs)
      ) {
        stagePoseNeutral(true);
      }
    },
    [
      clearClipOutputs,
      muteAnimationOutputRoutes,
      pulseAnimationControllerInputs,
      recordOrchestratorAnimationFallback,
      requireAnimationControllerId,
      restoreAnimationInputBaseline,
      restoreAnimationRendererBaseline,
      resolveClipPromise,
      stagePoseNeutral,
      updateLoopMode,
    ],
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

  const syncProgramPlaybackControllers = useCallback(() => {
    if (!ready) {
      return;
    }

    const syncPlan = planRuntimeProgramControllerSync({
      playbackStates: programPlaybackRef.current.values(),
      availableProgramIds: resolvedProgramAssets.map((program) => program.id),
      activeControllerIds: programControllerIdsRef.current,
      registrationByProgramId: programRegistrationMapRef.current,
    });

    syncPlan.stalePlaybackIds.forEach((id) => {
      programPlaybackRef.current.delete(id);
    });

    syncPlan.controllerRemovals.forEach(
      ({ programId, controllerId, reason }) => {
        try {
          removeGraph(controllerId);
        } catch (err: unknown) {
          pushError({
            message:
              reason === "inactive"
                ? `Failed to pause program ${programId}`
                : `Failed to remove program ${programId}`,
            cause: err,
            phase: "registration",
            timestamp: performance.now(),
          });
        }
        programControllerIdsRef.current.delete(programId);
      },
    );

    syncPlan.waitingProgramIds.forEach((id) => {
      if (isRuntimeDebugEnabled()) {
        console.warn(
          `[vizij-runtime] Program ${id} playback is waiting for prepared graph registration.`,
        );
      }
    });

    syncPlan.controllerRegistrations.forEach(({ programId, registration }) => {
      try {
        const nextControllerId = registerGraph(registration.config);
        programControllerIdsRef.current.set(programId, nextControllerId);
        const pendingProgramUpdate =
          pendingProgramRegistrationUpdatesRef.current.get(programId);
        if (pendingProgramUpdate) {
          pendingProgramRegistrationUpdatesRef.current.delete(programId);
          notifyGraphBundleApplied(listControllers(), [pendingProgramUpdate], {
            includeDeferredProgramUpdates: true,
          });
        }
      } catch (err: unknown) {
        const pendingProgramUpdate =
          pendingProgramRegistrationUpdatesRef.current.get(programId);
        pushError({
          message: `Failed to register program ${programId}`,
          cause: err,
          sources: pendingProgramUpdate
            ? [{ ...pendingProgramUpdate.source }]
            : undefined,
          phase: "registration",
          timestamp: performance.now(),
        });
      }
    });

    refreshControllerStatus();
  }, [
    pushError,
    ready,
    refreshControllerStatus,
    registerGraph,
    listControllers,
    notifyGraphBundleApplied,
    removeGraph,
    resolvedProgramAssets,
  ]);

  const playProgram = useCallback(
    (id: string) => {
      const program = resolveProgramById(id);
      if (!program) {
        throw new Error(
          `Program ${id} is not part of the current asset bundle.`,
        );
      }
      captureProgramInputBaseline(program);
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
      captureProgramInputBaseline,
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
      programPlaybackRef.current.delete(id);
      if (program && options?.resetOutputs !== false) {
        const restoredRendererTargetIds = new Set(
          programRendererBaselinesRef.current.get(id)?.keys() ?? [],
        );
        const restoredRendererBaseline = restoreProgramRendererBaseline(id);
        const restoredInputBaseline = restoreProgramInputBaseline(id);
        const appliedRendererStopValues = applyProgramRendererStopValues(
          program,
          restoredRendererTargetIds,
        );
        if (!restoredInputBaseline) {
          resolveProgramStopResetValues(program).forEach(({ path, value }) => {
            setInput(path, { float: value });
          });
        }
        stagePoseNeutral(true);
        flushStagedInputsToRuntime();
        if (
          !restoredRendererBaseline &&
          !appliedRendererStopValues &&
          !restoredInputBaseline
        ) {
          poseControlBridgeValuesRef.current.clear();
        }
      } else {
        programInputBaselinesRef.current.delete(id);
        programRendererBaselinesRef.current.delete(id);
      }
      refreshControllerStatus();
      updateLoopMode();
      publishRuntimeDebugState();
    },
    [
      publishRuntimeDebugState,
      applyProgramRendererStopValues,
      pushError,
      refreshControllerStatus,
      removeGraph,
      resolveProgramById,
      resolveProgramStopResetValues,
      restoreProgramInputBaseline,
      restoreProgramRendererBaseline,
      setInput,
      flushStagedInputsToRuntime,
      stagePoseNeutral,
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
    programRegistrationToken,
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
        muteAllAnimationOutputRoutes();
      }
      updateLoopMode();
    },
    [muteAllAnimationOutputRoutes, updateLoopMode],
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

  const advanceAnimations = useCallback(
    (dt: number) => {
      advanceAnimationTweens(dt);
      advanceClipPlayback(dt);
    },
    [advanceAnimationTweens, advanceClipPlayback],
  );

  const step = useCallback(
    (dt: number, opts?: { forceRuntime?: boolean }) => {
      const result = advanceRuntimeExecution({
        dt,
        previousAverageDt: avgStepDtRef.current,
        driveRuntime: driveOrchestratorRef.current,
        forceRuntime: opts?.forceRuntime,
        stagedInputs: stagedInputsRef.current,
        advanceHostAnimations: advanceAnimations,
        setInput: orchestratorSetInput,
        stepRuntime,
      });
      avgStepDtRef.current = result.averageDt;
    },
    [advanceAnimations, orchestratorSetInput, stepRuntime],
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
      const dt = Math.max(0, (timestamp - lastTime) / 1000);
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
      const dt = Math.max(0, (current - lastTime) / 1000);
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
      animationControllerIdsRef.current.clear();
      animationOutputPathsRef.current.clear();
      ignoredAnimationOutputPathsRef.current.clear();
      animationInputBaselinesRef.current.clear();
      programInputBaselinesRef.current.clear();
      programRendererBaselinesRef.current.clear();
      programPlaybackRef.current.clear();
      programControllerIdsRef.current.clear();
      stagedInputsRef.current.clear();
      clipOutputValuesRef.current.clear();
      clipAggregateValuesRef.current.clear();
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
    (
      bundle: RuntimeGraphBundle,
      options?: {
        tier?: RuntimeUpdateTier;
        source?: RuntimeGraphBundleUpdateSource;
      },
    ) => {
      const application = planRuntimeGraphBundleApplication({
        baseAssetBundle: latestEffectiveAssetBundleRef.current,
        extractedBundle: extractedBundleRef.current,
        graphBundle: bundle,
        tier: options?.tier ?? updateTierRef.current,
        source: options?.source,
        revision: options?.source
          ? ++graphBundleUpdateRevisionRef.current
          : undefined,
      });
      const { nextAssetBundle, updatePlan: plan, pendingUpdate } = application;
      pendingGraphBundleUpdatesRef.current =
        queueRuntimeGraphBundlePendingUpdate(
          pendingGraphBundleUpdatesRef.current,
          pendingUpdate,
        );
      pendingProgramRegistrationUpdatesRef.current =
        planRuntimeProgramRegistrationAcknowledgementQueue(
          pendingProgramRegistrationUpdatesRef.current,
          pendingUpdate,
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
      if (
        pendingUpdate &&
        shouldAcknowledgeRuntimeGraphBundleImmediately({
          plan,
          pendingUpdate,
        })
      ) {
        void Promise.resolve().then(() => {
          if (
            !hasRuntimeGraphBundlePendingRevision(
              pendingGraphBundleUpdatesRef.current,
              pendingUpdate.revision,
            )
          ) {
            return;
          }
          notifyGraphBundleApplied(listControllers(), [pendingUpdate]);
        });
      }
    },
    [listControllers, notifyGraphBundleApplied, reportStatus],
  );

  const contextValue: VizijRuntimeContextValue = useMemo(
    () => ({
      ...status,
      assetBundle,
      setInput,
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
      hasAnimationController,
      getAnimationOutputPaths,
      getAnimationState,
      stopAnimation,
      playProgram,
      pauseProgram,
      stopProgram,
      getProgramState,
      setAnimationActive,
      isAnimationActive,
      step,
      advanceAnimations,
      inputConstraints,
    }),
    [
      status,
      assetBundle,
      setInput,
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
      hasAnimationController,
      getAnimationOutputPaths,
      getAnimationState,
      stopAnimation,
      playProgram,
      pauseProgram,
      stopProgram,
      getProgramState,
      setAnimationActive,
      isAnimationActive,
      step,
      advanceAnimations,
      inputConstraints,
    ],
  );

  return (
    <VizijRuntimeContext.Provider value={contextValue}>
      {children}
    </VizijRuntimeContext.Provider>
  );
}
