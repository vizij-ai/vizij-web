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
import { getLookup, type AnimatableValue, type RawValue } from "@vizij/utils";
import { RUN_PERIOD_MS, isGoldenPath } from "./engine/aroraEngine";
import type { MergeStrategyOptions } from "./types";
import { VizijRuntimeContext } from "./context";
import {
  clearRuntimeDebugState,
  setRuntimeDebugState,
} from "./memoryInvestigation";
import type { RuntimeUpdateTier } from "./updatePolicy";
import type {
  VizijAssetBundle,
  VizijAnimationAsset,
  VizijRuntimeContextValue,
  VizijRuntimeProviderProps,
  VizijRuntimeStatus,
  RuntimeOutputWrite,
} from "./types";
import { resolvePoseControlInputPath } from "./utils/poseRuntime";
import { valueJSONToRaw } from "./utils/valueConversion";
import {
  FaceRuntime,
  POSE_CONTROL_BRIDGE_EPSILON,
  VISIBLE_IDLE_FPS,
  HIDDEN_IDLE_FPS,
  type LoopMode,
} from "./core/FaceRuntime";
import {
  findRootId,
  normalisePath,
  stripNamespace,
  now,
  inferImplicitPause,
  convertExtractedAnimations,
  pickExtractedAnimations,
  mergeAssetBundle,
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

/**
 * The React adapter over the headless FaceRuntime controller
 * (core/FaceRuntime.ts). The runtime owns all engine/transport truth; this
 * component owns what is genuinely React's: the render store, GLB asset
 * loading, the status/constraints state mirrors, the step-driver effects
 * (rAF/interval), and the memoized context value.
 */
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
  const runtimeRef = useRef<FaceRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new FaceRuntime();
  }
  const runtime = runtimeRef.current;

  const [assetBundleOverride, setAssetBundleOverride] =
    useState<VizijAssetBundle | null>(null);
  const [graphUpdateToken, setGraphUpdateToken] = useState(0);
  const effectiveAssetBundle = assetBundleOverride ?? initialAssetBundle;
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

  const assetBundle = useMemo(
    () =>
      mergeAssetBundle(
        effectiveAssetBundle,
        extractedBundle,
        extractedAnimations,
      ),
    [effectiveAssetBundle, extractedBundle, extractedAnimations],
  );

  const namespace = namespaceProp ?? assetBundle.namespace ?? "default";
  const faceId =
    faceIdProp ??
    assetBundle.faceId ??
    assetBundle.pose?.config?.faceId ??
    undefined;

  const [ready, setReady] = useState(false);
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
  const [inputConstraints, setInputConstraints] = useState<
    Record<string, { min?: number; max?: number; defaultValue?: number }>
  >({});
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
  const runtimeDebugInstanceIdRef = useRef(
    `vizij-runtime:${runtimeDebugInstanceSequence++}`,
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

  const requestLoopMode = useCallback((mode: LoopMode) => {
    if (!runtimeMountedRef.current) {
      return;
    }
    setLoopMode((prev) => (prev === mode ? prev : mode));
  }, []);

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

  // ---------------------------------------------------------------------------
  // Runtime wiring. These two effects are declared FIRST so they run before
  // every other effect in this component: the runtime's callback seams and
  // config mirror must be fresh before registration/asset effects consult it.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    runtime.callbacks.onStatusPatch = reportStatus;
    runtime.callbacks.onLoopModeChange = requestLoopMode;
    runtime.callbacks.onEngineReady = () => setReady(true);
    runtime.callbacks.onGraphBundleApplied = (bundle, plan) => {
      setAssetBundleOverride(bundle);
      if (plan.reregisterGraphs) {
        setGraphUpdateToken((prev) => prev + 1);
      }
    };
    runtime.callbacks.onInputConstraintsChange = setInputConstraints;
    runtime.callbacks.onRegisterControllers = onRegisterControllers;
    runtime.callbacks.setRendererValue = setRendererValue;
  });

  useEffect(() => {
    runtime.configure({
      namespace,
      faceId,
      autostart,
      driveRuntime,
      mergeStrategy,
      assetBundle,
    });
  });

  useEffect(() => {
    runtime.setUpdateTier(updateTier);
  }, [runtime, updateTier]);

  useEffect(() => {
    runtime.noteEffectiveAssetBundle(effectiveAssetBundle);
  }, [runtime, effectiveAssetBundle]);

  useEffect(() => {
    const plan = runtime.resolveBundlePlan(effectiveAssetBundle);
    if (plan?.reregisterGraphs) {
      setGraphUpdateToken((prev) => prev + 1);
    }
  }, [runtime, effectiveAssetBundle]);

  useEffect(() => {
    runtime.updateInputConstraints();
    // Intentionally no logging here to keep runtime console quiet.
  }, [runtime, assetBundle.rig, namespace]);

  useEffect(() => {
    runtime.updateLoopMode();
  }, [runtime, autostart]);

  // A driving provider hands its device to the device's own loop: it paces
  // itself (RUN_PERIOD_MS), and the JS loop below only pumps — tweens,
  // staged-input flush, change drain, completion settling. A non-driving
  // provider leaves the device manually stepped (step via forceRuntime).
  // Once under run() a device cannot be handed back: turning driveRuntime
  // off later only stops this provider's pump cadence from being the active
  // one.
  useEffect(() => {
    const slot = runtime.deviceSlot;
    slot.onRunEnded = (error: unknown) => {
      runtime.pushError({
        message: "The device's run loop ended: stepping failed",
        cause: error,
        phase: "engine",
        timestamp: performance.now(),
      });
    };
    if (driveRuntime) {
      slot.runPeriodMs = RUN_PERIOD_MS;
      slot.startRun();
    } else {
      slot.runPeriodMs = null;
    }
  }, [runtime, driveRuntime]);

  // ---------------------------------------------------------------------------
  // Debug telemetry (render-store aware, so it lives on the React side).
  // ---------------------------------------------------------------------------

  const publishRuntimeDebugState = useCallback(() => {
    const storeState = store.getState();
    const counts = runtime.getDebugCounts();
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
      ...counts,
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
    runtime,
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

  // ---------------------------------------------------------------------------
  // Status mirrors and engine bring-up.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    reportStatus((prev) => ({
      ...prev,
      namespace,
      faceId,
    }));
  }, [namespace, faceId, reportStatus]);

  const hasBundleAnimations = (assetBundle.animations?.length ?? 0) > 0;
  useEffect(() => {
    if (!hasBundleAnimations) {
      return;
    }
    runtime.ensureAnimationModuleLoaded();
  }, [runtime, hasBundleAnimations]);

  useEffect(() => {
    if (!ready && autoCreate) {
      runtime.initEngine().catch((err: unknown) => {
        runtime.pushError({
          message: "Failed to initialize the engine",
          cause: err,
          phase: "engine",
          timestamp: performance.now(),
        });
      });
    }
  }, [runtime, ready, autoCreate]);

  // ---------------------------------------------------------------------------
  // Asset loading (GLB → render store) — genuinely a render concern.
  // ---------------------------------------------------------------------------

  const glbAsset = effectiveAssetBundle.glb;
  const baseBundle: VizijBundleExtension | null =
    effectiveAssetBundle.bundle ?? null;

  useEffect(() => {
    let cancelled = false;
    const plan = runtime.pendingPlan;
    if (plan && !plan.reloadAssets && status.rootId !== null) {
      reportStatus((prev) =>
        prev.loading ? { ...prev, loading: false } : prev,
      );
      return () => {
        cancelled = true;
      };
    }
    runtime.resetErrors();
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
        if (runtime.pendingPlan?.reloadAssets) {
          runtime.pendingPlan = {
            ...runtime.pendingPlan,
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
        runtime.pushError({
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
    runtime,
    glbAsset,
    baseBundle,
    namespace,
    faceId,
    store,
    reportStatus,
    setExtractedBundle,
    setExtractedAnimations,
    status.rootId,
  ]);

  // ---------------------------------------------------------------------------
  // Controller registration + program sync (bodies live on the runtime).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    const plan = runtime.pendingPlan;
    if (plan && !plan.reregisterGraphs && runtime.hasRegisteredControllers()) {
      return;
    }
    runtime.registerControllers().catch((err: unknown) => {
      runtime.pushError({
        message: "Failed to register controllers",
        cause: err,
        phase: "registration",
        timestamp: performance.now(),
      });
    });
  }, [
    runtime,
    ready,
    status.loading,
    graphUpdateToken,
    assetBundle,
    namespace,
    mergeStrategy,
  ]);

  useEffect(() => {
    if (!ready || status.loading) {
      return;
    }
    runtime.syncProgramPlaybackControllers();
  }, [
    runtime,
    graphUpdateToken,
    ready,
    assetBundle,
    namespace,
    status.loading,
  ]);

  // ---------------------------------------------------------------------------
  // Applying drained engine changes to the render store. Bound as the
  // runtime's applyEngineChanges seam so stepRuntime can pull each tick's
  // changes straight through without a React render per step.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    runtime.callbacks.applyEngineChanges = (changes) => {
      const entries = Object.entries(changes);
      if (!entries.length) {
        return;
      }
      const setWorldValues = store.getState().setValues;
      const namespaceValue = status.namespace;
      const currentValues = store.getState().values;
      const {
        rigInputMap: rigInputPathMap,
        rigPoseControlInputIds,
        namespacedOutputPaths: namespacedOutputs,
        baseOutputPaths: baseOutputs,
        poseControlBridgeValues,
      } = runtime.getEngineChangeContext();
      const batched: Array<{ id: string; namespace: string; value: RawValue }> =
        [];
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
            const previousValue = poseControlBridgeValues.get(bridgeKey);
            if (
              previousValue === undefined ||
              Math.abs(previousValue - raw) > POSE_CONTROL_BRIDGE_EPSILON
            ) {
              poseControlBridgeValues.set(bridgeKey, raw);
              runtime.setInput(mappedInputPath, { float: raw });
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
  }, [runtime, status.namespace, store, transformOutputWrite]);

  // ---------------------------------------------------------------------------
  // The step drivers (rAF when active, interval when idle). The loop POLICY
  // (mode computation, activity tracking) lives on the runtime; these effects
  // are only the clock. NOTE: PR #75 revises this timing logic — keep the
  // structure verbatim so it rebases cleanly.
  // ---------------------------------------------------------------------------

  const step = useCallback(
    (dt: number, opts?: { forceRuntime?: boolean }) => {
      runtime.step(dt, opts);
    },
    [runtime],
  );

  const computeDesiredLoopMode = useCallback(
    () => runtime.computeDesiredLoopMode(),
    [runtime],
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
      runtime.disposeTransient();
    };
  }, [runtime]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const id = window.setInterval(() => {
      const stepHz = runtime.getAverageStepHz();
      reportStatus((prev) =>
        prev.stepHz === stepHz ? prev : { ...prev, stepHz },
      );
    }, 500);
    return () => window.clearInterval(id);
  }, [runtime, reportStatus]);

  // ---------------------------------------------------------------------------
  // The context value: status/bundle/constraints from React state, every
  // method a stable delegate onto the runtime.
  // ---------------------------------------------------------------------------

  const api = useMemo(
    () => ({
      setInput: runtime.setInput.bind(runtime),
      getValueSnapshot: runtime.getPathSnapshot.bind(runtime),
      getStoreSnapshot: runtime.getStoreSnapshot.bind(runtime),
      subscribeToStoreChanges: runtime.subscribeToStoreChanges.bind(runtime),
      subscribeToStep: runtime.subscribeToStep.bind(runtime),
      setGraphBundle: runtime.setGraphBundle.bind(runtime),
      stagePoseNeutral: runtime.stagePoseNeutral.bind(runtime),
      animateValue: runtime.animateValue.bind(runtime),
      cancelAnimation: runtime.cancelAnimation.bind(runtime),
      registerInputDriver: runtime.registerInputDriver.bind(runtime),
      playAnimation: runtime.playAnimation.bind(runtime),
      pauseAnimation: runtime.pauseAnimation.bind(runtime),
      seekAnimation: runtime.seekAnimation.bind(runtime),
      setAnimationLoop: runtime.setAnimationLoop.bind(runtime),
      getAnimationState: runtime.getAnimationState.bind(runtime),
      stopAnimation: runtime.stopAnimation.bind(runtime),
      playProgram: runtime.playProgram.bind(runtime),
      pauseProgram: runtime.pauseProgram.bind(runtime),
      stopProgram: runtime.stopProgram.bind(runtime),
      getProgramState: runtime.getProgramState.bind(runtime),
      setAnimationActive: runtime.setAnimationActive.bind(runtime),
      isAnimationActive: runtime.isAnimationActive.bind(runtime),
      step: runtime.step.bind(runtime),
    }),
    [runtime],
  );

  const contextValue: VizijRuntimeContextValue = useMemo(
    () => ({
      ...status,
      assetBundle,
      ...api,
      setValue: setRendererValue,
      inputConstraints,
    }),
    [status, assetBundle, api, setRendererValue, inputConstraints],
  );

  return (
    <VizijRuntimeContext.Provider value={contextValue}>
      {children}
    </VizijRuntimeContext.Provider>
  );
}
