import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VizijAnimationAsset } from "@vizij/runtime-react";
import { useVizijRuntime } from "@vizij/runtime-react";
import { useBindingAuthoring } from "../state/RigControllerProvider";
import { useAnimationStore } from "../state/animationStore";
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

export function AnimationRuntimeBridge() {
  const { assetBundle, setGraphBundle, getAnimationState, seekAnimation } =
    useVizijRuntime();
  const standardInputsById = useBindingAuthoring(
    (state) => state.standardInputsById,
  );
  const tracks = useAnimationStore((state) => state.tracks);
  const exportClipIr = useAnimationStore((state) => state.exportClipIr);
  const syncTransportState = useAnimationStore(
    (state) => state.syncTransportState,
  );
  const duration = useAnimationStore((state) => state.duration);
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
    [duration, exportClipIr, tracks],
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
    const inherited = (assetBundle.animations ?? []).filter(
      (animation: VizijAnimationAsset) =>
        !isAuthoredTimelineAnimation(animation),
    );
    const next = authoredAnimation
      ? [...inherited, authoredAnimation]
      : inherited;
    return [...next].sort((left, right) => left.id.localeCompare(right.id));
  }, [assetBundle.animations, authoredAnimation]);

  const mergedAnimationSignature = useMemo(
    () => toDeterministicSignature(mergedAnimations),
    [mergedAnimations],
  );
  const appliedAnimationSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (appliedAnimationSignatureRef.current === mergedAnimationSignature) {
      return;
    }
    appliedAnimationSignatureRef.current = mergedAnimationSignature;
    setGraphBundle(
      {
        animations: mergedAnimations,
      },
      { tier: "graphs" },
    );
    if (transportActive && authoredAnimation) {
      seekAnimation(AUTHORED_TIMELINE_CLIP_ID, currentTime);
    }
  }, [
    authoredAnimation,
    currentTime,
    mergedAnimationSignature,
    mergedAnimations,
    seekAnimation,
    setGraphBundle,
    transportActive,
  ]);

  useEffect(() => {
    let frameHandle = 0;
    const tick = () => {
      const playbackState = getAnimationState(AUTHORED_TIMELINE_CLIP_ID);
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
  }, [getAnimationState, syncTransportState]);

  return null;
}

export function useAnimationTransport() {
  const {
    playAnimation,
    pauseAnimation,
    stopAnimation,
    seekAnimation,
    setAnimationLoop,
    getAnimationState,
  } = useVizijRuntime();
  const {
    tracks,
    currentTime,
    playSpeed,
    loop,
    play,
    pause,
    stop,
    seek,
    setLoop,
    setPlaySpeed,
    syncTransportState,
  } = useAnimationStore();

  const canDrive = tracks.length > 0;

  const playTransport = useCallback(() => {
    if (!canDrive) {
      return;
    }
    setAnimationLoop(AUTHORED_TIMELINE_CLIP_ID, loop);
    seekAnimation(AUTHORED_TIMELINE_CLIP_ID, currentTime);
    play();
    void playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
      reset: false,
      speed: playSpeed,
    });
  }, [
    canDrive,
    currentTime,
    loop,
    play,
    playAnimation,
    playSpeed,
    seekAnimation,
    setAnimationLoop,
  ]);

  const pauseTransport = useCallback(() => {
    if (!canDrive) {
      return;
    }
    pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
    pause();
  }, [canDrive, pause, pauseAnimation]);

  const stopTransport = useCallback(() => {
    if (!canDrive) {
      stop();
      return;
    }
    stopAnimation(AUTHORED_TIMELINE_CLIP_ID);
    stop();
  }, [canDrive, stop, stopAnimation]);

  const seekTransport = useCallback(
    (timeSeconds: number) => {
      if (!canDrive) {
        seek(timeSeconds);
        return;
      }
      seekAnimation(AUTHORED_TIMELINE_CLIP_ID, timeSeconds);
      seek(timeSeconds);
      syncTransportState({
        transportActive: true,
        transportPlaybackState: "paused",
        isPlaying: false,
      });
    },
    [canDrive, seek, seekAnimation, syncTransportState],
  );

  const setLoopTransport = useCallback(
    (enabled: boolean) => {
      setLoop(enabled);
      if (!canDrive) {
        return;
      }
      setAnimationLoop(AUTHORED_TIMELINE_CLIP_ID, enabled);
    },
    [canDrive, setAnimationLoop, setLoop],
  );

  const setSpeedTransport = useCallback(
    (multiplier: number) => {
      setPlaySpeed(multiplier);
      if (!canDrive) {
        return;
      }
      const playbackState = getAnimationState(AUTHORED_TIMELINE_CLIP_ID);
      if (playbackState?.playing) {
        void playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
          reset: false,
          speed: multiplier,
        });
      }
    },
    [canDrive, getAnimationState, playAnimation, setPlaySpeed],
  );

  const stepTransport = useCallback(
    (deltaSeconds = 1 / 30) => {
      if (!canDrive) {
        return;
      }
      pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
      const playbackState = getAnimationState(AUTHORED_TIMELINE_CLIP_ID);
      const baseTime = playbackState?.time ?? currentTime;
      const durationSeconds = playbackState?.duration ?? 0;
      const unclampedTime = baseTime + Math.max(0, deltaSeconds);
      const nextTime =
        durationSeconds > 0
          ? Math.max(0, Math.min(unclampedTime, durationSeconds))
          : Math.max(0, unclampedTime);
      seekAnimation(AUTHORED_TIMELINE_CLIP_ID, nextTime);
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
      getAnimationState,
      pauseAnimation,
      seekAnimation,
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
