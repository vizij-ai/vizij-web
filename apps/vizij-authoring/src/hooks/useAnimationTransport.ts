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
} from "../types/animationClipIr";
import { clipIrToBundleAnimationEntry } from "../utils/animationClipCompiler";

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

export function AnimationRuntimeBridge({
  active = true,
}: {
  active?: boolean;
}) {
  const runtime = useVizijRuntime();
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
  const setRuntimeTransportAdapter = useAnimationStore(
    (state) => state.setRuntimeTransportAdapter,
  );
  const setTransportEnabled = useAnimationStore(
    (state) => state.setTransportEnabled,
  );
  const currentTime = useAnimationStore((state) => state.currentTime);
  const transportActive = useAnimationStore((state) => state.transportActive);
  const authoredClip = useMemo(
    () =>
      tracks.length > 0
        ? exportClipIr({
            id: AUTHORED_TIMELINE_CLIP_ID,
            name: AUTHORED_TIMELINE_CLIP_NAME,
          })
        : null,
    [exportClipIr, tracks],
  );

  const authoredAnimation = useMemo<VizijAnimationAsset | null>(() => {
    if (!authoredClip) {
      return null;
    }
    const bundleEntry = clipIrToBundleAnimationEntry(authoredClip, {
      standardInputsById,
    });
    return {
      id: bundleEntry.id,
      clip: bundleEntry.clip,
    };
  }, [authoredClip, standardInputsById]);

  const mergedAnimations = useMemo(() => {
    const inherited = assetBundleAnimations.filter(
      (animation: VizijAnimationAsset) =>
        !isAuthoredTimelineAnimation(animation),
    );
    const next = authoredAnimation
      ? [...inherited, authoredAnimation]
      : inherited;
    return [...next].sort((left, right) => left.id.localeCompare(right.id));
  }, [assetBundleAnimations, authoredAnimation]);

  const currentAnimations = useMemo(
    () =>
      [...assetBundleAnimations].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    [assetBundleAnimations],
  );

  const currentAnimationSignature = useMemo(
    () => toDeterministicSignature(currentAnimations),
    [currentAnimations],
  );
  const mergedAnimationSignature = useMemo(
    () => toDeterministicSignature(mergedAnimations),
    [mergedAnimations],
  );
  const currentTimeRef = useRef(currentTime);
  const appliedAnimationSignatureRef = useRef<string | null>(null);
  const lastCurrentAnimationSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

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

    if (appliedAnimationSignatureRef.current === mergedAnimationSignature) {
      return;
    }

    // Retry bundle application until runtime state converges to the merged
    // signature. Another bridge update can race and temporarily drop
    // animations from the runtime bundle.
    appliedAnimationSignatureRef.current = mergedAnimationSignature;
    if (setGraphBundle) {
      if (process.env.NODE_ENV !== "production") {
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
    transportActive,
  ]);

  useEffect(() => {
    setTransportEnabled(active);
    if (!active) {
      setRuntimeTransportAdapter(null);
      if (typeof runtime.pauseAnimation === "function") {
        runtime.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
      }
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
      return () => {
        setTransportEnabled(true);
      };
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
    return () => {
      setRuntimeTransportAdapter(null);
      setTransportEnabled(true);
    };
  }, [
    active,
    runtime,
    setRuntimeTransportAdapter,
    setTransportEnabled,
    syncTransportState,
  ]);

  useEffect(() => {
    if (!active) {
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
      return;
    }
    let frameHandle = 0;
    const tick = () => {
      const playbackState = getAnimationState?.(AUTHORED_TIMELINE_CLIP_ID);
      if (!playbackState) {
        syncTransportState({
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
          currentTime: 0,
        });
      } else {
        syncTransportState({
          currentTime: playbackState.time,
          duration: playbackState.duration,
          isPlaying: playbackState.playing,
          loop: playbackState.loop,
          playSpeed: playbackState.speed,
          transportActive: true,
          transportPlaybackState: playbackState.playing ? "playing" : "paused",
        });
      }
      frameHandle = requestAnimationFrame(tick);
    };

    frameHandle = requestAnimationFrame(tick);
    return () => {
      if (frameHandle !== 0) {
        cancelAnimationFrame(frameHandle);
      }
    };
  }, [active, getAnimationState, syncTransportState]);

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
    runtimeTransport.stopAnimation(AUTHORED_TIMELINE_CLIP_ID);
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
      runtimeTransport.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, timeSeconds);
      const nextPlaybackState = isPlaying
        ? "playing"
        : transportPlaybackState === "stopped"
          ? "stopped"
          : "paused";
      syncTransportState({
        currentTime: timeSeconds,
        isPlaying,
        transportActive: nextPlaybackState !== "stopped",
        transportPlaybackState: nextPlaybackState,
      });
    },
    [
      canDrive,
      isPlaying,
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
