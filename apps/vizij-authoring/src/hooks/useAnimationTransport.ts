import { useCallback, useEffect, useMemo, useRef } from "react";
import { useOptionalVizijRuntime, useVizijRuntime } from "@vizij/runtime-react";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  buildAnimationPreviewBundle,
  planAnimationPreviewTransaction,
  toDeterministicSignature,
  type AnimationClipIR,
  type VizijAnimationAsset,
} from "@vizij/studio-support";
import {
  useBindingAuthoring,
  useGraphRuntimeStoreApi,
} from "../state/RigControllerProvider";
import {
  useAnimationStore,
  type AnimationRuntimeTransportAdapter,
} from "../state/animationStore";
import { applyAuthoringCompileState } from "../state/graphRuntimeStore";
import { isAuthoringDebugEnabled } from "../utils/debug";

export function AnimationRuntimeBridge({
  active = true,
  clip = null,
  transportSessionKey,
}: {
  active?: boolean;
  clip?: AnimationClipIR | null;
  transportSessionKey?: number;
}) {
  const runtime = useVizijRuntime();
  const graphRuntimeStore = useGraphRuntimeStoreApi();
  const runtimeRootId = runtime.rootId ?? null;
  const assetBundleAnimations = runtime.assetBundle?.animations ?? [];
  const setGraphBundle =
    typeof runtime.setGraphBundle === "function"
      ? runtime.setGraphBundle
      : null;
  const getAnimationState =
    typeof runtime.getAnimationState === "function"
      ? runtime.getAnimationState
      : null;
  const hasAnimationController =
    typeof runtime.hasAnimationController === "function"
      ? runtime.hasAnimationController
      : null;
  const getAnimationOutputPaths =
    typeof runtime.getAnimationOutputPaths === "function"
      ? runtime.getAnimationOutputPaths
      : null;
  const seekAnimation =
    typeof runtime.seekAnimation === "function" ? runtime.seekAnimation : null;
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const tracks = useAnimationStore((state) => state.tracks);
  const exportClipIr = useAnimationStore((state) => state.exportClipIr);
  const syncTransportState = useAnimationStore(
    (state) => state.syncTransportState,
  );
  const setTransportRuntimeReady = useAnimationStore(
    (state) => state.setTransportRuntimeReady,
  );
  const setRuntimeTransportAdapter = useAnimationStore(
    (state) => state.setRuntimeTransportAdapter,
  );
  const setRuntimeClipId = useAnimationStore((state) => state.setRuntimeClipId);
  const setTransportEnabled = useAnimationStore(
    (state) => state.setTransportEnabled,
  );
  const currentTime = useAnimationStore((state) => state.currentTime);
  const transportActive = useAnimationStore((state) => state.transportActive);
  const editorClip = useMemo(
    () =>
      tracks.length > 0
        ? exportClipIr({
            id: AUTHORED_TIMELINE_CLIP_ID,
            name: AUTHORED_TIMELINE_CLIP_NAME,
          })
        : null,
    [exportClipIr, tracks],
  );
  const authoredClip = clip ?? editorClip;
  const runtimeClipId = authoredClip?.id ?? AUTHORED_TIMELINE_CLIP_ID;

  const playableInheritedAssetAnimations = useMemo(
    () =>
      buildAnimationPreviewBundle({
        active: true,
        authoredClip: null,
        currentAnimations: assetBundleAnimations,
      }).animations,
    [assetBundleAnimations],
  );
  const inheritedAssetAnimationSignature = useMemo(
    () => toDeterministicSignature(playableInheritedAssetAnimations),
    [playableInheritedAssetAnimations],
  );
  const cachedInheritedAnimationsRef = useRef<VizijAnimationAsset[]>([]);
  const cachedInheritedRootIdRef = useRef<string | null>(runtimeRootId);

  useEffect(() => {
    if (cachedInheritedRootIdRef.current !== runtimeRootId) {
      cachedInheritedRootIdRef.current = runtimeRootId;
      cachedInheritedAnimationsRef.current = [];
    }
  }, [runtimeRootId]);

  useEffect(() => {
    if (playableInheritedAssetAnimations.length === 0) {
      return;
    }
    cachedInheritedAnimationsRef.current = playableInheritedAssetAnimations;
  }, [inheritedAssetAnimationSignature, playableInheritedAssetAnimations]);

  const currentAnimations = useMemo(
    () =>
      [...assetBundleAnimations].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    [assetBundleAnimations],
  );

  const previewBundle = useMemo(
    () =>
      buildAnimationPreviewBundle({
        active,
        authoredClip,
        standardInputsById,
        currentAnimations,
        fallbackInheritedAnimations: cachedInheritedAnimationsRef.current,
      }),
    [active, authoredClip, currentAnimations, standardInputsById],
  );
  const authoredAnimation = previewBundle.authoredAnimation;
  const authoredOutputPaths = previewBundle.outputPaths;
  const mergedAnimations = previewBundle.animations;
  const authoredAnimationTrackCount =
    authoredAnimation?.clip?.tracks?.length ?? 0;

  const currentAnimationSignature = useMemo(
    () => toDeterministicSignature(currentAnimations),
    [currentAnimations],
  );
  const mergedAnimationSignature = useMemo(
    () => previewBundle.signature,
    [previewBundle.signature],
  );
  const currentTimeRef = useRef(currentTime);
  const wasActiveRef = useRef(active);
  const appliedAnimationSignatureRef = useRef<string | null>(null);
  const lastCurrentAnimationSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = active;
    setTransportEnabled(active);
    setRuntimeClipId(runtimeClipId);
    if (!active) {
      setRuntimeTransportAdapter(null);
      if (wasActive) {
        if (typeof runtime.stopAnimation === "function") {
          runtime.stopAnimation(runtimeClipId, {
            clearOutputs: true,
          });
        } else if (typeof runtime.pauseAnimation === "function") {
          runtime.pauseAnimation(runtimeClipId);
        }
      }
      if (typeof runtime.setAnimationActive === "function") {
        runtime.setAnimationActive(false);
      }
      syncTransportState(
        {
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        },
        transportSessionKey,
      );
      setTransportRuntimeReady(false, transportSessionKey);
      return () => {
        if (typeof runtime.setAnimationActive === "function") {
          runtime.setAnimationActive(true);
        }
        setTransportEnabled(true);
      };
    }
    if (typeof runtime.setAnimationActive === "function") {
      runtime.setAnimationActive(true);
    }
    if (
      typeof runtime.playAnimation !== "function" ||
      typeof runtime.pauseAnimation !== "function" ||
      typeof runtime.stopAnimation !== "function" ||
      typeof runtime.seekAnimation !== "function" ||
      typeof runtime.setAnimationLoop !== "function" ||
      typeof runtime.getAnimationState !== "function"
    ) {
      setRuntimeTransportAdapter(null);
      setTransportRuntimeReady(false, transportSessionKey);
      return;
    }
    const adapter: AnimationRuntimeTransportAdapter = {
      playAnimation: runtime.playAnimation,
      pauseAnimation: runtime.pauseAnimation,
      stopAnimation: runtime.stopAnimation,
      seekAnimation: runtime.seekAnimation,
      setAnimationLoop: runtime.setAnimationLoop,
      getAnimationState: runtime.getAnimationState,
    };
    setRuntimeTransportAdapter(adapter);
    setTransportRuntimeReady(false, transportSessionKey);
    return () => {
      setRuntimeTransportAdapter(null);
      if (typeof runtime.setAnimationActive === "function") {
        runtime.setAnimationActive(true);
      }
      setTransportEnabled(true);
    };
  }, [
    active,
    runtime,
    runtimeClipId,
    setRuntimeClipId,
    setRuntimeTransportAdapter,
    setTransportEnabled,
    setTransportRuntimeReady,
    syncTransportState,
    transportSessionKey,
  ]);

  useEffect(() => {
    if (!active) {
      setTransportRuntimeReady(false, transportSessionKey);
      return;
    }
    const plan = planAnimationPreviewTransaction({
      preview: previewBundle,
      currentSignature: currentAnimationSignature,
      lastCurrentSignature: lastCurrentAnimationSignatureRef.current,
      appliedSignature: appliedAnimationSignatureRef.current,
    });
    lastCurrentAnimationSignatureRef.current = plan.nextLastCurrentSignature;
    appliedAnimationSignatureRef.current = plan.nextAppliedSignature;

    if (plan.converged) {
      const animationTarget =
        graphRuntimeStore.getState().authoringCompileTargets.animation;
      const runtimeControllerReady =
        authoredAnimation !== null &&
        (hasAnimationController?.(runtimeClipId) ?? false);
      const runtimeOutputRoutesReady =
        authoredAnimationTrackCount === 0 ||
        (getAnimationOutputPaths?.(runtimeClipId)?.length ?? 0) > 0;
      const registeredInRuntime =
        runtimeControllerReady && runtimeOutputRoutesReady;
      const alreadyRegistered =
        active &&
        authoredAnimation !== null &&
        ((animationTarget.status === "registered" &&
          animationTarget.signature === plan.compiledState.signature) ||
          registeredInRuntime);
      applyAuthoringCompileState(
        graphRuntimeStore,
        alreadyRegistered
          ? {
              ...plan.compiledState,
              status: "registered",
              message: null,
            }
          : plan.compiledState,
      );
      setTransportRuntimeReady(alreadyRegistered, transportSessionKey);
      return;
    }

    setTransportRuntimeReady(false, transportSessionKey);
    if (plan.dirtyState) {
      applyAuthoringCompileState(graphRuntimeStore, plan.dirtyState);
    }
    if (!plan.shouldPublish) {
      return;
    }

    if (setGraphBundle) {
      applyAuthoringCompileState(graphRuntimeStore, plan.compilingState);
      if (isAuthoringDebugEnabled("timeline")) {
        console.log("[timeline][animation-bridge] apply animations", {
          currentAnimationSignature,
          mergedAnimationSignature: previewBundle.signature,
          mergedAnimationIds: mergedAnimations.map((animation) => animation.id),
          authoredTrackCount: authoredAnimation?.clip?.tracks?.length ?? 0,
        });
      }
      setGraphBundle(plan.bundle, {
        tier: "graphs",
        source: plan.source,
      });
      applyAuthoringCompileState(graphRuntimeStore, plan.compiledState);
    } else {
      graphRuntimeStore.setState({
        authoringCompileStatus: "runtime-error",
        authoringCompileTarget: "animation",
        authoringCompileMessage:
          "Runtime does not support graph bundle updates",
        authoringCompileSignature: previewBundle.signature,
      });
    }
    if (transportActive && authoredAnimation && seekAnimation) {
      seekAnimation(runtimeClipId, currentTimeRef.current);
    }
  }, [
    active,
    authoredAnimation,
    authoredAnimationTrackCount,
    currentAnimationSignature,
    getAnimationOutputPaths,
    graphRuntimeStore,
    hasAnimationController,
    mergedAnimations,
    previewBundle,
    runtimeClipId,
    seekAnimation,
    setGraphBundle,
    setTransportRuntimeReady,
    transportActive,
    transportSessionKey,
  ]);

  useEffect(() => {
    if (!active) {
      syncTransportState(
        {
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        },
        transportSessionKey,
      );
      setTransportRuntimeReady(false, transportSessionKey);
      return;
    }
    const syncMissingPlaybackState = () => {
      syncTransportState(
        {
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
          currentTime: 0,
        },
        transportSessionKey,
      );
    };
    const syncPlaybackState = (playbackState: {
      time: number;
      duration: number;
      playing: boolean;
      loop: boolean;
      speed: number;
    }) => {
      syncTransportState(
        {
          currentTime: playbackState.time,
          isPlaying: playbackState.playing,
          loop: playbackState.loop,
          playSpeed: playbackState.speed,
          transportActive: true,
          transportPlaybackState: playbackState.playing ? "playing" : "paused",
        },
        transportSessionKey,
      );
    };
    if (!getAnimationState) {
      syncMissingPlaybackState();
      return;
    }
    const syncIntervalMs = 50;
    const tick = () => {
      const playbackState = getAnimationState(runtimeClipId);
      if (!playbackState) {
        syncMissingPlaybackState();
        return;
      }
      syncPlaybackState(playbackState);
    };

    const initialPlaybackState = getAnimationState(runtimeClipId);
    if (!initialPlaybackState) {
      syncMissingPlaybackState();
    } else {
      syncPlaybackState(initialPlaybackState);
    }
    const intervalHandle = window.setInterval(tick, syncIntervalMs);
    return () => {
      window.clearInterval(intervalHandle);
    };
  }, [
    active,
    getAnimationState,
    runtimeClipId,
    syncTransportState,
    transportSessionKey,
  ]);

  return null;
}

export function useAnimationTransport() {
  const runtime = useOptionalVizijRuntime();
  const runtimeTransportAdapter = useAnimationStore(
    (state) => state.runtimeTransportAdapter,
  );
  const runtimeClipId = useAnimationStore((state) => state.runtimeClipId);
  const transportEnabled = useAnimationStore((state) => state.transportEnabled);
  const {
    tracks,
    currentTime,
    isPlaying,
    transportPlaybackState,
    playSpeed,
    loop,
    pause,
    stop,
    setLoop,
    setPlaySpeed,
    syncTransportState,
  } = useAnimationStore();

  const runtimeTransport = runtime ?? runtimeTransportAdapter;
  const hasTracks = tracks.length > 0;
  const canDrive = transportEnabled && Boolean(runtimeTransport) && hasTracks;

  const playTransport = useCallback(() => {
    if (!canDrive || !runtimeTransport) {
      return;
    }
    runtimeTransport.setAnimationLoop(runtimeClipId, loop);
    runtimeTransport.seekAnimation(runtimeClipId, currentTime);
    const playPromise = runtimeTransport.playAnimation(runtimeClipId, {
      reset: false,
      speed: playSpeed,
    });
    const playbackState = runtimeTransport.getAnimationState(runtimeClipId);
    if (playbackState?.playing) {
      syncTransportState({
        currentTime: playbackState.time,
        duration: playbackState.duration,
        isPlaying: true,
        loop: playbackState.loop,
        playSpeed: playbackState.speed,
        transportActive: true,
        transportPlaybackState: "playing",
      });
    } else {
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
    }
    void playPromise.catch((error) => {
      console.error(
        "[vizij-authoring] animation transport playback failed",
        error,
      );
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
    });
  }, [
    canDrive,
    currentTime,
    loop,
    playSpeed,
    runtimeClipId,
    runtimeTransport,
    syncTransportState,
  ]);

  const pauseTransport = useCallback(() => {
    if (!canDrive || !runtimeTransport) {
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
      return;
    }
    runtimeTransport.pauseAnimation(runtimeClipId);
    pause();
  }, [canDrive, pause, runtimeClipId, runtimeTransport, syncTransportState]);

  const stopTransport = useCallback(() => {
    if (!canDrive || !runtimeTransport) {
      stop();
      return;
    }
    runtimeTransport.stopAnimation(runtimeClipId, {
      clearOutputs: true,
    });
    stop();
  }, [canDrive, runtimeClipId, runtimeTransport, stop]);

  const seekTransport = useCallback(
    (timeSeconds: number) => {
      if (!canDrive || !runtimeTransport) {
        syncTransportState({
          currentTime: timeSeconds,
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        });
        return;
      }
      const resumePlaying = isPlaying;
      if (!resumePlaying) {
        if (transportPlaybackState === "stopped") {
          void runtimeTransport.playAnimation(runtimeClipId, {
            reset: false,
            speed: playSpeed,
          });
        }
        runtimeTransport.pauseAnimation(runtimeClipId);
      }
      runtimeTransport.seekAnimation(runtimeClipId, timeSeconds);
      syncTransportState({
        currentTime: timeSeconds,
        isPlaying: resumePlaying,
        transportActive: true,
        transportPlaybackState: resumePlaying ? "playing" : "paused",
      });
    },
    [
      canDrive,
      isPlaying,
      playSpeed,
      runtimeClipId,
      runtimeTransport,
      syncTransportState,
      transportPlaybackState,
    ],
  );

  const setLoopTransport = useCallback(
    (enabled: boolean) => {
      setLoop(enabled);
      if (!canDrive || !runtimeTransport) {
        return;
      }
      runtimeTransport.setAnimationLoop(runtimeClipId, enabled);
    },
    [canDrive, runtimeClipId, runtimeTransport, setLoop],
  );

  const setSpeedTransport = useCallback(
    (multiplier: number) => {
      setPlaySpeed(multiplier);
      if (!canDrive || !runtimeTransport) {
        return;
      }
      const playbackState = runtimeTransport.getAnimationState(runtimeClipId);
      if (playbackState?.playing) {
        void runtimeTransport.playAnimation(runtimeClipId, {
          reset: false,
          speed: multiplier,
        });
      }
    },
    [canDrive, runtimeClipId, runtimeTransport, setPlaySpeed],
  );

  const stepTransport = useCallback(
    (deltaSeconds = 1 / 30) => {
      if (!canDrive || !runtimeTransport) {
        syncTransportState({
          currentTime: currentTime + Math.max(0, deltaSeconds),
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        });
        return;
      }
      runtimeTransport.pauseAnimation(runtimeClipId);
      const playbackState = runtimeTransport.getAnimationState(runtimeClipId);
      const baseTime = playbackState?.time ?? currentTime;
      const durationSeconds = playbackState?.duration ?? 0;
      const unclampedTime = baseTime + Math.max(0, deltaSeconds);
      const nextTime =
        durationSeconds > 0
          ? Math.max(0, Math.min(unclampedTime, durationSeconds))
          : Math.max(0, unclampedTime);
      runtimeTransport.seekAnimation(runtimeClipId, nextTime);
      syncTransportState({
        currentTime: nextTime,
        isPlaying: false,
        transportActive: true,
        transportPlaybackState: "paused",
      });
    },
    [
      canDrive,
      currentTime,
      runtimeClipId,
      runtimeTransport,
      syncTransportState,
    ],
  );

  return {
    active: canDrive,
    play: playTransport,
    pause: pauseTransport,
    stop: stopTransport,
    seek: seekTransport,
    setLoop: setLoopTransport,
    setSpeed: setSpeedTransport,
    step: stepTransport,
  };
}
