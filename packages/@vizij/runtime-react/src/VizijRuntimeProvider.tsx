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
  type CreateOrchOptions,
  type MergeStrategyOptions,
  type ValueJSON,
  type ShapeJSON,
} from "@vizij/orchestrator-react";
import {
  convertBundlePrograms,
  convertExtractedAnimations,
  deriveProgramInputSeedValues,
  deriveProgramResetValues,
  advanceClipTime,
  applyRuntimeGraphBundle,
  buildPoseWeightPathMap,
  buildRigInputPath,
  clampAnimationTime,
  diffAnimationAggregateValues,
  namespaceTypedPath,
  normalisePath,
  pickExtractedAnimations,
  prepareRuntimeRegistrationPlan,
  prepareRuntimeAssetBundle,
  resolveClipDurationSeconds,
  resolvePoseControlInputPath,
  resolveRuntimeUpdatePlan,
  sampleAnimationClipOutputValues,
  shouldUseLegacyPoseWeightFallback,
  stripNamespace,
  type RuntimeGraphBundle,
  type RuntimeProgramRegistrationSupportResult,
  type RuntimeUpdateTier,
} from "@vizij/studio-support";
import { valueAsNumber } from "@vizij/value-json";
import { type AnimatableValue, type RawValue } from "@vizij/utils";
import { VizijRuntimeContext } from "./context";
import {
  clearRuntimeControllers,
  registerRuntimeControllers,
  type RuntimeControllerHostError,
} from "./host/controllerRegistration";
import {
  advanceRuntimeExecution,
  clearStagedRuntimeInput,
  flushStagedRuntimeInput,
  stageRuntimeInput,
  type StagedRuntimeInputs,
} from "./host/executionLoop";
import { prepareRuntimeFrameWrites } from "./host/frameWrites";
import {
  clearRuntimeDebugState,
  setRuntimeDebugState,
} from "./memoryInvestigation";
import { resolveVizijOrchestratorInitInput } from "./orchestratorInit";
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
  buildAnimationControllerCommandPath,
  buildAnimationControllerPlayInputs,
  resolveAnimationTransportMode,
  resolveProviderAnimationBackend,
  type ResolvedAnimationTransportMode,
} from "./utils/animationTransport";

export {
  deriveProgramInputSeedValues,
  mergeAssetBundle,
  toStoredAnimationClip,
} from "@vizij/studio-support";

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
  time: number;
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
const DEV_MODE = (() => {
  const nodeEnv = (globalThis as { process?: { env?: { NODE_ENV?: string } } })
    .process?.env?.NODE_ENV;
  return typeof nodeEnv === "string" && nodeEnv === "development";
})();

function isRuntimeDebugEnabled(): boolean {
  if (DEV_MODE) {
    return true;
  }
  return Boolean(
    (globalThis as { __VIZIJ_RUNTIME_DEBUG__?: boolean })
      .__VIZIJ_RUNTIME_DEBUG__,
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
    orchestratorScope === "isolated" ||
    (!hasParentOrchestrator && orchestratorScope !== "shared");

  if (orchestratorScope === "shared" && !hasParentOrchestrator) {
    console.warn(
      '[vizij-runtime] orchestratorScope="shared" requires an OrchestratorProvider higher in the tree; falling back to an isolated provider.',
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
      prepareRuntimeAssetBundle(
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

  const {
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
  } = useOrchestrator();
  const frame = useOrchFrame();

  const namespace = namespaceProp ?? assetBundle.namespace ?? "default";
  const faceId =
    faceIdProp ??
    assetBundle.faceId ??
    assetBundle.pose?.config?.faceId ??
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
  const animationSystemActiveRef = useRef(true);
  const stagedInputsRef = useRef<StagedRuntimeInputs>(new Map());
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
      driveOrchestrator,
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
    driveOrchestrator,
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
    (error: RuntimeControllerHostError) => {
      pushError({
        ...error,
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
    });
    result.errors.forEach((error) => {
      pushHostError(error);
    });
    registeredGraphsRef.current = [];
    registeredAnimationsRef.current = [];
    animationControllerIdsRef.current.clear();
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
  }, [listControllers, removeAnimation, removeGraph, pushHostError]);

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
        let gltfAnimations: Parameters<typeof convertExtractedAnimations>[0];

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
      pushHostError(error);
    });

    rigInputMapRef.current = result.rigInputMap;
    rigPoseControlInputIdsRef.current = result.rigPoseControlInputIds;
    inputConstraintsRef.current = result.inputConstraints;
    setInputConstraints(result.inputConstraints);
    programRegistrationMapRef.current = result.programRegistrationMap;
    outputPathsRef.current = result.outputPaths;
    baseOutputPathsRef.current = result.baseOutputPaths;
    namespacedOutputPathsRef.current = result.namespacedOutputPaths;
    mergedGraphRef.current = result.mergedGraphId;
    registeredGraphsRef.current = result.graphIds;
    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] registered graph ids", result.graphIds);
    }

    registeredAnimationsRef.current = result.animationIds;
    animationControllerIdsRef.current = result.animationControllerIds;

    if (isRuntimeDebugEnabled()) {
      console.log("[vizij-runtime] controllers after register", {
        controllers: result.controllers,
        graphIds: result.graphIds,
        animationIds: result.animationIds,
      });
    }
    reportStatus((prev) => ({
      ...prev,
      ready: true,
      controllers: result.controllers,
      outputPaths: Array.from(outputPathsRef.current),
    }));
    onRegisterControllers?.(result.controllers);
  }, [
    assetBundle,
    animationTransport,
    clearControllers,
    faceId,
    listControllers,
    mergeStrategy,
    namespace,
    onRegisterControllers,
    pushError,
    pushHostError,
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
    if (!frame) {
      return;
    }
    const writes = frame.merged_writes ?? [];
    if (!writes.length) {
      return;
    }
    const setWorldValues = store.getState().setValues;
    const namespaceValue = status.namespace;
    const prepared = prepareRuntimeFrameWrites({
      writes,
      namespace: namespaceValue,
      namespacedOutputPaths: namespacedOutputPathsRef.current,
      baseOutputPaths: baseOutputPathsRef.current,
      rigInputPathMap: rigInputMapRef.current,
      rigPoseControlInputIds: rigPoseControlInputIdsRef.current,
      poseControlBridgeValues: poseControlBridgeValuesRef.current,
      currentValues: store.getState().values,
      transformOutputWrite,
    });
    prepared.poseControlInputs.forEach(({ path, value }) => {
      setInput(path, value);
    });
    if (prepared.rendererWrites.length > 0) {
      setWorldValues(prepared.rendererWrites);
    }
  }, [frame, setInput, status.namespace, store, transformOutputWrite]);

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
    [orchestratorSetInput, pushError, removeInput, stepRuntime],
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
        POSE_CONTROL_BRIDGE_EPSILON,
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
      clipOutputValuesRef.current.set(
        clip.id,
        buildClipOutputValues(clip, state),
      );
      syncClipOutputs(options);
    },
    [buildClipOutputValues, syncClipOutputs],
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
      const hostOwnsClipOutputs =
        animationTransportRef.current !== "orchestrator";
      const toDelete: string[] = [];
      clipPlaybackRef.current.forEach((state, key) => {
        const clip = resolveClipById(state.id);
        if (!clip) {
          toDelete.push(key);
          resolveClipPromise(state);
          return;
        }

        state.duration = resolveClipDurationSeconds(
          clip.clip as AnimationClipLike,
          state.duration,
        );

        const { time, completed } = advanceClipTime(
          {
            time: state.time,
            duration: state.duration,
            speed: state.speed,
            loop: state.loop,
            playing: state.playing,
          },
          dt,
        );
        state.time = clampAnimationTime(time, state.duration);

        if (hostOwnsClipOutputs && (state.playing || completed)) {
          writeClipOutputs(clip, state);
        }

        if (completed) {
          toDelete.push(key);
          resolveClipPromise(state);
        }
      });

      toDelete.forEach((key) => {
        clipPlaybackRef.current.delete(key);
        if (hostOwnsClipOutputs && animationSystemActiveRef.current) {
          clearClipOutputs(key);
        }
      });
    },
    [clearClipOutputs, resolveClipById, resolveClipPromise, writeClipOutputs],
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

  const playAnimation = useCallback(
    (id: string, options?: PlayAnimationOptions) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return Promise.reject(
          new Error(`Animation ${id} is not part of the current asset bundle.`),
        );
      }
      const { clip, state } = ensured;
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
      state.playing = true;

      const completion = ensureClipPromise(state);
      clipPlaybackRef.current.set(id, state);
      if (
        animationTransportRef.current === "orchestrator" &&
        animationControllerIdsRef.current.has(id)
      ) {
        const controllerId = animationControllerIdsRef.current.get(id)!;
        pulseAnimationControllerInputs(
          id,
          buildAnimationControllerPlayInputs(controllerId, {
            reset: shouldReset,
            loop: state.loop,
            speed: state.speed,
            weight: state.weight,
          }),
        );
      } else {
        writeClipOutputs(clip, state);
      }
      markActivity();
      return completion;
    },
    [
      ensureClipPlaybackState,
      ensureClipPromise,
      markActivity,
      pulseAnimationControllerInputs,
      resolveClipPromise,
      writeClipOutputs,
    ],
  );

  const pauseAnimation = useCallback(
    (id: string) => {
      const state = clipPlaybackRef.current.get(id);
      if (!state || !state.playing) {
        return;
      }
      state.playing = false;
      if (
        animationTransportRef.current === "orchestrator" &&
        animationControllerIdsRef.current.has(id)
      ) {
        pulseAnimationControllerCommands(id, [
          { action: "pause", value: { bool: true } },
        ]);
      }
      updateLoopMode();
    },
    [pulseAnimationControllerCommands, updateLoopMode],
  );

  const seekAnimation = useCallback(
    (id: string, timeSeconds: number) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return;
      }
      const { clip, state } = ensured;
      state.time = clampAnimationTime(timeSeconds, state.duration);
      clipPlaybackRef.current.set(id, state);
      if (
        animationTransportRef.current === "orchestrator" &&
        animationControllerIdsRef.current.has(id)
      ) {
        pulseAnimationControllerCommands(id, [
          { action: "seek", value: { float: state.time } },
        ]);
      } else {
        writeClipOutputs(clip, state, { immediate: true });
      }
    },
    [
      ensureClipPlaybackState,
      pulseAnimationControllerCommands,
      writeClipOutputs,
    ],
  );

  const setAnimationLoop = useCallback(
    (id: string, enabled: boolean) => {
      const ensured = ensureClipPlaybackState(id);
      if (!ensured) {
        return;
      }
      ensured.state.loop = Boolean(enabled);
      clipPlaybackRef.current.set(id, ensured.state);
      if (
        animationTransportRef.current === "orchestrator" &&
        animationControllerIdsRef.current.has(id)
      ) {
        pulseAnimationControllerCommands(id, [
          { action: "set_loop", value: enabled ? "loop" : "once" },
        ]);
      }
      updateLoopMode();
    },
    [ensureClipPlaybackState, pulseAnimationControllerCommands, updateLoopMode],
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

  const stopAnimation = useCallback(
    (id: string, options?: StopAnimationOptions) => {
      const state = clipPlaybackRef.current.get(id);
      if (state) {
        clipPlaybackRef.current.delete(id);
        state.playing = false;
        resolveClipPromise(state);
      }
      const orchestratorOwnsAnimation =
        animationTransportRef.current === "orchestrator" &&
        animationControllerIdsRef.current.has(id);
      if (orchestratorOwnsAnimation) {
        pulseAnimationControllerCommands(id, [
          { action: "stop", value: { bool: true } },
        ]);
      } else if (options?.clearOutputs !== false) {
        clearClipOutputs(id);
      }
      updateLoopMode();
    },
    [
      clearClipOutputs,
      pulseAnimationControllerCommands,
      resolveClipPromise,
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

      const registration = programRegistrationMapRef.current.get(program.id);
      if (!registration) {
        pushError({
          message: `Program ${id} is missing a usable graph payload.`,
          phase: "registration",
          timestamp: performance.now(),
        });
        return;
      }
      try {
        const nextControllerId = registerGraph(registration.config);
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
        deriveProgramResetValues({
          program,
          namespace: namespaceRef.current,
          inputConstraints: inputConstraintsRef.current,
        }).forEach(({ path, value }) => {
          setInput(path, { float: value });
        });
      }
      refreshControllerStatus();
      updateLoopMode();
    },
    [
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
      programPlaybackRef.current.clear();
      programControllerIdsRef.current.clear();
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
