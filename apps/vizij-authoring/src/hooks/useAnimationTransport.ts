import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VizijAnimationAsset } from "@vizij/runtime-react";
import { useOptionalVizijRuntime, useVizijRuntime } from "@vizij/runtime-react";
import { useBindingAuthoring } from "../state/RigControllerProvider";
import {
  useAnimationStore,
  type AnimationRuntimeTransportAdapter,
} from "../state/animationStore";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
  type AnimationClipIR,
} from "../types/animationClipIr";
import { clipIrToBundleAnimationEntry } from "../utils/animationClipCompiler";
import { isAuthoringDebugEnabled } from "../utils/debug";

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

function isAuthoredTimelineAnimation(animation: VizijAnimationAsset): boolean {
  return (
    animation.id === AUTHORED_TIMELINE_CLIP_ID ||
    animation.id === LEGACY_AUTHORED_TIMELINE_CLIP_ID
  );
}

function normalizeAnimationInputPath(path: string | undefined): string {
  return (path ?? "").trim().replace(/^\/+/, "");
}

function hasAnimationTracks(animation: VizijAnimationAsset): boolean {
  const tracks = (animation.clip as { tracks?: unknown[] } | undefined)?.tracks;
  return Array.isArray(tracks) && tracks.length > 0;
}

function muteAnimationClip(
  animation: VizijAnimationAsset,
): VizijAnimationAsset {
  const sourceClip =
    animation.clip && typeof animation.clip === "object"
      ? (animation.clip as Record<string, unknown>)
      : {};
  const clipId =
    typeof sourceClip.id === "string" && sourceClip.id.trim().length > 0
      ? sourceClip.id
      : animation.id;
  return {
    id: animation.id,
    clip: {
      ...sourceClip,
      id: clipId,
      tracks: [],
    } as VizijAnimationAsset["clip"],
  };
}

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

  const authoredAnimation = useMemo<VizijAnimationAsset | null>(() => {
    if (!active || !authoredClip) {
      return null;
    }
    const bundleEntry = clipIrToBundleAnimationEntry(authoredClip, {
      standardInputsById,
    });
    return {
      id: bundleEntry.id,
      clip: bundleEntry.clip,
    };
  }, [active, authoredClip, standardInputsById]);
  const authoredOutputPaths = useMemo(() => {
    if (!authoredClip) {
      return [];
    }
    const paths = new Set<string>();
    authoredClip.tracks.forEach((track) => {
      const resolvedPath =
        normalizeAnimationInputPath(track.channel) ||
        normalizeAnimationInputPath(track.variableId);
      if (resolvedPath.length > 0) {
        paths.add(resolvedPath);
      }
    });
    return Array.from(paths);
  }, [authoredClip]);

  const inheritedAssetAnimations = useMemo(
    () =>
      assetBundleAnimations.filter(
        (animation: VizijAnimationAsset) =>
          !isAuthoredTimelineAnimation(animation),
      ),
    [assetBundleAnimations],
  );
  const playableInheritedAssetAnimations = useMemo(
    () =>
      inheritedAssetAnimations.filter((animation) =>
        hasAnimationTracks(animation),
      ),
    [inheritedAssetAnimations],
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

  const mergedAnimations = useMemo(() => {
    if (!active) {
      const toMute =
        currentAnimations.length > 0
          ? currentAnimations
          : cachedInheritedAnimationsRef.current;
      const muted = toMute.map((animation) => muteAnimationClip(animation));
      return [...muted].sort((left, right) => left.id.localeCompare(right.id));
    }
    const inherited =
      playableInheritedAssetAnimations.length > 0
        ? playableInheritedAssetAnimations
        : cachedInheritedAnimationsRef.current;
    const next = authoredAnimation
      ? [...inherited, authoredAnimation]
      : inherited;
    return [...next].sort((left, right) => left.id.localeCompare(right.id));
  }, [
    active,
    authoredAnimation,
    currentAnimations,
    playableInheritedAssetAnimations,
  ]);

  const currentAnimationSignature = useMemo(
    () => toDeterministicSignature(currentAnimations),
    [currentAnimations],
  );
  const mergedAnimationSignature = useMemo(
    () => toDeterministicSignature(mergedAnimations),
    [mergedAnimations],
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
    if (!active) {
      setRuntimeTransportAdapter(null);
      if (wasActive) {
        if (typeof runtime.stopAnimation === "function") {
          runtime.stopAnimation(AUTHORED_TIMELINE_CLIP_ID, {
            clearOutputs: true,
          });
        } else if (typeof runtime.pauseAnimation === "function") {
          runtime.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
        }
        if (typeof runtime.setInput === "function") {
          authoredOutputPaths.forEach((path) => {
            runtime.setInput(path, { float: 0 });
          });
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
    setTransportRuntimeReady(
      currentAnimationSignature === mergedAnimationSignature,
      transportSessionKey,
    );
    return () => {
      setRuntimeTransportAdapter(null);
      if (typeof runtime.setAnimationActive === "function") {
        runtime.setAnimationActive(true);
      }
      setTransportEnabled(true);
    };
  }, [
    active,
    authoredOutputPaths,
    currentAnimationSignature,
    mergedAnimationSignature,
    runtime,
    setRuntimeTransportAdapter,
    setTransportEnabled,
    setTransportRuntimeReady,
    syncTransportState,
    transportSessionKey,
  ]);

  useEffect(() => {
    if (
      lastCurrentAnimationSignatureRef.current !== currentAnimationSignature
    ) {
      lastCurrentAnimationSignatureRef.current = currentAnimationSignature;
      if (currentAnimationSignature !== mergedAnimationSignature) {
        // Runtime drifted from the authored signature; allow one controlled
        // retry for the current merged signature.
        appliedAnimationSignatureRef.current = null;
      }
    }

    if (currentAnimationSignature === mergedAnimationSignature) {
      appliedAnimationSignatureRef.current = mergedAnimationSignature;
      return;
    }

    setTransportRuntimeReady(false, transportSessionKey);
    if (appliedAnimationSignatureRef.current === mergedAnimationSignature) {
      return;
    }

    // Retry bundle application until runtime state converges to the merged
    // signature. Another bridge update can race and temporarily drop
    // animations from the runtime bundle.
    appliedAnimationSignatureRef.current = mergedAnimationSignature;
    if (setGraphBundle) {
      if (isAuthoringDebugEnabled("timeline")) {
        console.log("[timeline][animation-bridge] apply animations", {
          currentAnimationSignature,
          mergedAnimationSignature,
          mergedAnimationIds: mergedAnimations.map((animation) => animation.id),
          authoredTrackCount: authoredAnimation?.clip?.tracks?.length ?? 0,
        });
      }
      setGraphBundle(
        {
          animations: mergedAnimations,
        },
        { tier: "graphs" },
      );
    }
    if (transportActive && authoredAnimation && seekAnimation) {
      seekAnimation(AUTHORED_TIMELINE_CLIP_ID, currentTimeRef.current);
    }
  }, [
    authoredAnimation,
    currentAnimationSignature,
    mergedAnimationSignature,
    mergedAnimations,
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
          duration: playbackState.duration,
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
    let frameHandle = 0;
    const tick = () => {
      const playbackState = getAnimationState(AUTHORED_TIMELINE_CLIP_ID);
      if (!playbackState) {
        syncMissingPlaybackState();
        frameHandle = requestAnimationFrame(tick);
        return;
      }
      syncPlaybackState(playbackState);
      frameHandle = requestAnimationFrame(tick);
    };

    const initialPlaybackState = getAnimationState(AUTHORED_TIMELINE_CLIP_ID);
    if (!initialPlaybackState) {
      syncMissingPlaybackState();
    } else {
      syncPlaybackState(initialPlaybackState);
    }
    frameHandle = requestAnimationFrame(tick);
    return () => {
      if (frameHandle !== 0) {
        cancelAnimationFrame(frameHandle);
      }
    };
  }, [active, getAnimationState, syncTransportState, transportSessionKey]);

  return null;
}

export function useAnimationTransport() {
  const runtime = useOptionalVizijRuntime();
  const runtimeTransportAdapter = useAnimationStore(
    (state) => state.runtimeTransportAdapter,
  );
  const transportEnabled = useAnimationStore((state) => state.transportEnabled);
  const {
    tracks,
    currentTime,
    isPlaying,
    transportPlaybackState,
    playSpeed,
    loop,
    play,
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
    runtimeTransport.setAnimationLoop(AUTHORED_TIMELINE_CLIP_ID, loop);
    runtimeTransport.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, currentTime);
    play();
    void runtimeTransport.playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
      reset: false,
      speed: playSpeed,
    });
  }, [canDrive, currentTime, loop, play, playSpeed, runtimeTransport]);

  const pauseTransport = useCallback(() => {
    if (!canDrive || !runtimeTransport) {
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
      return;
    }
    runtimeTransport.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
    pause();
  }, [canDrive, pause, runtimeTransport, syncTransportState]);

  const stopTransport = useCallback(() => {
    if (!canDrive || !runtimeTransport) {
      stop();
      return;
    }
    runtimeTransport.stopAnimation(AUTHORED_TIMELINE_CLIP_ID, {
      clearOutputs: true,
    });
    stop();
  }, [canDrive, runtimeTransport, stop]);

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
          void runtimeTransport.playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
            reset: false,
            speed: playSpeed,
          });
        }
        runtimeTransport.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
      }
      runtimeTransport.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, timeSeconds);
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
      runtimeTransport.setAnimationLoop(AUTHORED_TIMELINE_CLIP_ID, enabled);
    },
    [canDrive, runtimeTransport, setLoop],
  );

  const setSpeedTransport = useCallback(
    (multiplier: number) => {
      setPlaySpeed(multiplier);
      if (!canDrive || !runtimeTransport) {
        return;
      }
      const playbackState = runtimeTransport.getAnimationState(
        AUTHORED_TIMELINE_CLIP_ID,
      );
      if (playbackState?.playing) {
        void runtimeTransport.playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
          reset: false,
          speed: multiplier,
        });
      }
    },
    [canDrive, runtimeTransport, setPlaySpeed],
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
      runtimeTransport.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
      const playbackState = runtimeTransport.getAnimationState(
        AUTHORED_TIMELINE_CLIP_ID,
      );
      const baseTime = playbackState?.time ?? currentTime;
      const durationSeconds = playbackState?.duration ?? 0;
      const unclampedTime = baseTime + Math.max(0, deltaSeconds);
      const nextTime =
        durationSeconds > 0
          ? Math.max(0, Math.min(unclampedTime, durationSeconds))
          : Math.max(0, unclampedTime);
      runtimeTransport.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, nextTime);
      syncTransportState({
        currentTime: nextTime,
        isPlaying: false,
        transportActive: true,
        transportPlaybackState: "paused",
      });
    },
    [canDrive, currentTime, runtimeTransport, syncTransportState],
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
