import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import { VizijContext, createVizijStore, type VizijStore } from "@vizij/render";
import {
  OrchestratorProvider,
  useOrchestrator,
  useOrchFrame,
  type GraphRegistrationConfig,
  type MergeStrategyOptions,
  type ValueJSON,
  type AnimationRegistrationConfig,
} from "@vizij/orchestrator-react";
import { valueAsNumber } from "@vizij/value-json";
import type { AnimatableValue, RawValue } from "@vizij/utils";
import { VizijRuntimeContext } from "./context";
import type {
  AnimateValueOptions,
  InputDriverFactory,
  InputDriverLifecycle,
  PlayAnimationOptions,
  RuntimeError,
  VizijAssetBundle,
  AnimationClipLike,
  AnimationTrackLike,
  VizijRuntimeContextValue,
  VizijRuntimeProviderProps,
  VizijRuntimeStatus,
} from "./types";
import {
  collectInputPathMap,
  collectInputPaths,
  collectOutputPaths,
} from "./utils/graph";
import { valueJSONToRaw } from "./utils/valueConversion";
import { loadGLTF, loadGLTFFromBlob } from "@vizij/render";

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
  resolve: () => void;
};

const DEFAULT_MERGE: MergeStrategyOptions = {
  outputs: "add",
  intermediate: "add",
};

const DEFAULT_DURATION = 0.35;

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
  for (const entry of Object.values(world)) {
    if (
      entry &&
      typeof entry === "object" &&
      entry.type === "group" &&
      entry.rootBounds &&
      entry.id
    ) {
      return entry.id as string;
    }
  }
  return null;
}

function normalisePath(path: string): string {
  if (!path) {
    return path;
  }
  return path.startsWith("debug/") ? path.slice("debug/".length) : path;
}

export function VizijRuntimeProvider({
  assetBundle,
  children,
  namespace: namespaceProp,
  faceId: faceIdProp,
  autoCreate = true,
  createOptions,
  autostart = false,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
}: ProviderProps) {
  const storeRef = useRef<VizijStore>();
  if (!storeRef.current) {
    storeRef.current = createVizijStore();
  }

  return (
    <VizijContext.Provider value={storeRef.current}>
      <OrchestratorProvider
        autoCreate={autoCreate}
        createOptions={createOptions}
        autostart={autostart}
      >
        <VizijRuntimeProviderInner
          assetBundle={assetBundle}
          namespace={namespaceProp}
          faceId={faceIdProp}
          autoCreate={autoCreate}
          mergeStrategy={mergeStrategy}
          onRegisterControllers={onRegisterControllers}
          onStatusChange={onStatusChange}
          store={storeRef.current}
        >
          {children}
        </VizijRuntimeProviderInner>
      </OrchestratorProvider>
    </VizijContext.Provider>
  );
}

type VizijRuntimeProviderInnerProps = {
  assetBundle: VizijAssetBundle;
  namespace?: string;
  faceId?: string;
  mergeStrategy?: MergeStrategyOptions;
  onRegisterControllers?: (ids: { graphs: string[]; anims: string[] }) => void;
  onStatusChange?: (status: VizijRuntimeStatus) => void;
  store: VizijStore;
  children: ReactNode;
  autoCreate: boolean;
};

function VizijRuntimeProviderInner({
  assetBundle,
  namespace: namespaceProp,
  faceId: faceIdProp,
  mergeStrategy,
  onRegisterControllers,
  onStatusChange,
  store,
  children,
  autoCreate,
}: VizijRuntimeProviderInnerProps) {
  const {
    ready,
    createOrchestrator,
    registerGraph,
    registerMergedGraph,
    registerAnimation,
    removeGraph,
    removeAnimation,
    listControllers,
    setInput,
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
    controllers: { graphs: [], anims: [] },
  });

  const errorsRef = useRef<RuntimeError[]>([]);
  const outputPathsRef = useRef<Set<string>>(new Set());
  const rigInputMapRef = useRef<Record<string, string>>({});
  const registeredGraphsRef = useRef<string[]>([]);
  const registeredAnimationsRef = useRef<string[]>([]);
  const mergedGraphRef = useRef<string | null>(null);

  const animationTweensRef = useRef<Map<string, AnimationState>>(new Map());
  const clipPlaybackRef = useRef<Map<string, ClipPlaybackState>>(new Map());
  const rafHandleRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

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

  const clearControllers = useCallback(() => {
    const existing = listControllers();
    existing.graphs.forEach((id) => {
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
    existing.anims.forEach((id) => {
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
    mergedGraphRef.current = null;
  }, [listControllers, removeAnimation, removeGraph, pushError]);

  useEffect(() => {
    reportStatus((prev) => ({
      ...prev,
      namespace,
      faceId,
    }));
  }, [namespace, faceId, reportStatus]);

  useEffect(() => {
    let cancelled = false;
    resetErrors();
    reportStatus((prev) => ({
      ...prev,
      loading: true,
      rootId: null,
      ready: false,
      outputPaths: [],
      controllers: { graphs: [], anims: [] },
    }));

    const loadAssets = async () => {
      try {
        let world: Record<string, any>;
        let animatables: Record<string, AnimatableValue>;

        if (assetBundle.glb.kind === "url") {
          [world, animatables] = await loadGLTF(
            assetBundle.glb.src,
            [namespace],
            assetBundle.glb.aggressiveImport ?? false,
            assetBundle.glb.rootBounds,
          );
        } else if (assetBundle.glb.kind === "blob") {
          [world, animatables] = await loadGLTFFromBlob(
            assetBundle.glb.blob,
            [namespace],
            assetBundle.glb.aggressiveImport ?? false,
            assetBundle.glb.rootBounds,
          );
        } else {
          world = assetBundle.glb.world as Record<string, any>;
          animatables = assetBundle.glb.animatables;
        }

        if (cancelled) {
          return;
        }

        const rootId = findRootId(world);
        store.getState().addWorldElements(world as any, animatables, true);

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
    assetBundle,
    namespace,
    faceId,
    store,
    pushError,
    reportStatus,
    resetErrors,
  ]);

  useEffect(() => {
    if (!ready && autoCreate) {
      createOrchestrator().catch((err) => {
        pushError({
          message: "Failed to create orchestrator runtime",
          cause: err,
          phase: "orchestrator",
          timestamp: performance.now(),
        });
      });
    }
  }, [ready, autoCreate, createOrchestrator, pushError]);

  const registerControllers = useCallback(async () => {
    const normalize = (spec: GraphRegistrationConfig["spec"]) => spec;

    const rigSpec = normalize(assetBundle.rig.spec);
    const rigOutputs = collectOutputPaths(rigSpec);
    const rigInputs = collectInputPaths(rigSpec);
    rigInputMapRef.current = collectInputPathMap(rigSpec);
    outputPathsRef.current = new Set(rigOutputs);

    const rigConfig: GraphRegistrationConfig = {
      id: assetBundle.rig.id,
      spec: rigSpec,
      subs: assetBundle.rig.subscriptions ?? {
        inputs: rigInputs,
        outputs: rigOutputs,
      },
    };

    const graphConfigs: GraphRegistrationConfig[] = [rigConfig];

    if (assetBundle.pose?.graph) {
      const poseSpec = normalize(assetBundle.pose.graph.spec);
      const poseOutputs = collectOutputPaths(poseSpec);
      const poseInputs = collectInputPaths(poseSpec);
      graphConfigs.push({
        id: assetBundle.pose.graph.id,
        spec: poseSpec,
        subs: assetBundle.pose.graph.subscriptions ?? {
          inputs: poseInputs,
          outputs: poseOutputs,
        },
      });
    }

    clearControllers();

    const graphIds: string[] = [];

    try {
      if (graphConfigs.length > 1) {
        const mergedId = registerMergedGraph({
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

    const animationIds: string[] = [];
    for (const anim of assetBundle.animations ?? []) {
      try {
        const config: AnimationRegistrationConfig = {
          id: anim.id,
          setup: {
            animation: anim.clip,
            ...(anim.setup ?? {}),
          } as AnimationRegistrationConfig["setup"],
        };
        const id = registerAnimation(config);
        animationIds.push(id);
      } catch (err: unknown) {
        pushError({
          message: `Failed to register animation ${anim.id}`,
          cause: err,
          phase: "animation",
          timestamp: performance.now(),
        });
      }
    }

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
    listControllers,
    mergeStrategy,
    onRegisterControllers,
    pushError,
    registerAnimation,
    registerGraph,
    registerMergedGraph,
    reportStatus,
    setInput,
  ]);

  useEffect(() => {
    if (!ready || status.loading) {
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
  }, [ready, status.loading, registerControllers, pushError]);

  useEffect(() => {
    if (!frame) {
      return;
    }
    const writes = frame.merged_writes ?? [];
    if (!writes.length) {
      return;
    }
    const setWorldValue = store.getState().setValue;
    const namespaceValue = status.namespace;
    writes.forEach((write) => {
      const path = normalisePath(write.path);
      if (!outputPathsRef.current.has(path)) {
        return;
      }
      const raw = valueJSONToRaw(write.value);
      if (raw === undefined) {
        return;
      }
      setWorldValue(path, namespaceValue, raw);
    });
  }, [frame, status.namespace, store]);

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

  const scheduleLoop = useCallback(() => {
    if (rafHandleRef.current !== null) {
      return;
    }
    const tick = (timestamp: number) => {
      if (lastFrameTimeRef.current == null) {
        lastFrameTimeRef.current = timestamp;
      }
      const dt = Math.max(0, (timestamp - lastFrameTimeRef.current) / 1000);
      lastFrameTimeRef.current = timestamp;
      advanceAnimationTweens(dt);
      advanceClipPlayback(dt);
      if (
        animationTweensRef.current.size > 0 ||
        clipPlaybackRef.current.size > 0
      ) {
        rafHandleRef.current = requestAnimationFrame(tick);
      } else {
        rafHandleRef.current = null;
        lastFrameTimeRef.current = null;
      }
    };
    rafHandleRef.current = requestAnimationFrame(tick);
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

  const sampleTrack = useCallback(
    (track: AnimationTrackLike, time: number): number => {
      const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
      if (!keyframes.length) {
        return 0;
      }
      const first = keyframes[0];
      if (!first) {
        return 0;
      }
      if (time <= Number(first.time ?? 0)) {
        return Number(first.value ?? 0);
      }
      for (let i = 0; i < keyframes.length - 1; i += 1) {
        const current = keyframes[i] ?? {};
        const next = keyframes[i + 1] ?? {};
        const start = Number(current.time ?? 0);
        const end = Number(next.time ?? start);
        if (time >= start && time <= end) {
          const range = end - start || 1;
          const factor = (time - start) / range;
          const currentValue = Number(current.value ?? 0);
          const nextValue = Number(next.value ?? currentValue);
          return currentValue + (nextValue - currentValue) * factor;
        }
      }
      const last = keyframes[keyframes.length - 1];
      return Number(last?.value ?? 0);
    },
    [],
  );

  const advanceClipPlayback = useCallback(
    (dt: number) => {
      if (clipPlaybackRef.current.size === 0) {
        return;
      }
      const map = clipPlaybackRef.current;
      const toDelete: string[] = [];
      map.forEach((state, key) => {
        state.time += dt * state.speed;
        const clip = assetBundle.animations?.find(
          (anim) => anim.id === state.id,
        );
        if (!clip) {
          toDelete.push(key);
          state.resolve();
          return;
        }
        const clipData: AnimationClipLike = clip.clip;
        const duration = Number(clipData?.duration ?? state.duration);
        state.duration =
          Number.isFinite(duration) && duration > 0 ? duration : state.duration;
        if (state.time >= state.duration) {
          toDelete.push(key);
          state.time = state.duration;
        }
        const tracks = Array.isArray(clipData?.tracks)
          ? (clipData.tracks as AnimationTrackLike[])
          : [];
        tracks.forEach((track) => {
          const value = sampleTrack(track, state.time) * state.weight;
          const path = `animation/${clip.id}/${track.channel}`;
          setInput(path, { float: value });
        });
        if (toDelete.includes(key)) {
          state.resolve();
        }
      });
      toDelete.forEach((key) => {
        clipPlaybackRef.current.delete(key);
        const clip = assetBundle.animations?.find((anim) => anim.id === key);
        if (clip) {
          const clipData: AnimationClipLike = clip.clip;
          const tracks = Array.isArray(clipData?.tracks)
            ? (clipData.tracks as AnimationTrackLike[])
            : [];
          tracks.forEach((track) => {
            const path = `animation/${clip.id}/${track.channel}`;
            setInput(path, { float: 0 });
          });
        }
      });
    },
    [assetBundle.animations, sampleTrack, setInput],
  );

  const animateValue = useCallback(
    (path: string, target: ValueJSON, options?: AnimateValueOptions) => {
      const easing = resolveEasing(options?.easing);
      const duration = Math.max(0, options?.duration ?? DEFAULT_DURATION);
      cancelAnimation(path);

      const current = getPathSnapshot(path);
      const fromValue = valueAsNumber(current);
      const toValue = valueAsNumber(target);

      if (fromValue == null || toValue == null || duration === 0) {
        setInput(path, target);
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        animationTweensRef.current.set(path, {
          path,
          from: fromValue,
          to: toValue,
          duration,
          elapsed: 0,
          easing,
          resolve,
        });
        scheduleLoop();
      });
    },
    [cancelAnimation, getPathSnapshot, scheduleLoop, setInput],
  );

  const playAnimation = useCallback(
    (id: string, options?: PlayAnimationOptions) => {
      const clip = assetBundle.animations?.find((anim) => anim.id === id);
      if (!clip) {
        return Promise.reject(
          new Error(`Animation ${id} is not part of the current asset bundle.`),
        );
      }
      if (clipPlaybackRef.current.has(id)) {
        clipPlaybackRef.current.delete(id);
      }
      return new Promise<void>((resolve) => {
        const speed = options?.speed ?? 1;
        const weight = options?.weight ?? clip.weight ?? 1;
        const clipData: AnimationClipLike = clip.clip;
        clipPlaybackRef.current.set(id, {
          id,
          time: options?.reset ? 0 : 0,
          duration: Number(clipData?.duration ?? 0),
          speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
          weight,
          resolve,
        });
        scheduleLoop();
      });
    },
    [assetBundle.animations, scheduleLoop],
  );

  const stopAnimation = useCallback(
    (id: string) => {
      const clip = assetBundle.animations?.find((anim) => anim.id === id);
      const state = clipPlaybackRef.current.get(id);
      if (state) {
        clipPlaybackRef.current.delete(id);
        state.resolve();
      }
      if (clip) {
        const clipData: AnimationClipLike = clip.clip;
        const tracks = Array.isArray(clipData?.tracks)
          ? (clipData.tracks as AnimationTrackLike[])
          : [];
        tracks.forEach((track) => {
          const path = `animation/${clip.id}/${track.channel}`;
          setInput(path, { float: 0 });
        });
      }
    },
    [assetBundle.animations, setInput],
  );

  const registerInputDriver = useCallback(
    (id: string, factory: InputDriverFactory): InputDriverLifecycle => {
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
    (dt: number) => {
      advanceAnimations(dt);
      stepRuntime(dt);
    },
    [advanceAnimations, stepRuntime],
  );

  useEffect(() => {
    return () => {
      if (rafHandleRef.current !== null) {
        cancelAnimationFrame(rafHandleRef.current);
        rafHandleRef.current = null;
      }
      lastFrameTimeRef.current = null;
      animationTweensRef.current.clear();
      clipPlaybackRef.current.clear();
    };
  }, []);

  const contextValue: VizijRuntimeContextValue = useMemo(
    () => ({
      ...status,
      assetBundle,
      setInput,
      setValue: setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      stopAnimation,
      step,
      advanceAnimations,
    }),
    [
      status,
      assetBundle,
      setInput,
      setRendererValue,
      stagePoseNeutral,
      animateValue,
      cancelAnimation,
      registerInputDriver,
      playAnimation,
      stopAnimation,
      step,
      advanceAnimations,
    ],
  );

  return (
    <VizijRuntimeContext.Provider value={contextValue}>
      {children}
    </VizijRuntimeContext.Provider>
  );
}
