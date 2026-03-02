import { useCallback, useEffect, useMemo, useRef } from "react";
import type { VizijAnimationAsset } from "@vizij/runtime-react";
import { useOptionalVizijRuntime, useVizijRuntime } from "@vizij/runtime-react";
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
  const appliedAnimationSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (currentAnimationSignature === mergedAnimationSignature) {
      appliedAnimationSignatureRef.current = mergedAnimationSignature;
      return;
    }
    if (appliedAnimationSignatureRef.current === mergedAnimationSignature) {
      return;
    }
    appliedAnimationSignatureRef.current = mergedAnimationSignature;
    if (setGraphBundle) {
      setGraphBundle(
        {
          animations: mergedAnimations,
        },
        { tier: "graphs" },
      );
    }
    if (transportActive && authoredAnimation && seekAnimation) {
      seekAnimation(AUTHORED_TIMELINE_CLIP_ID, currentTime);
    }
  }, [
    authoredAnimation,
    currentTime,
    currentAnimationSignature,
    mergedAnimationSignature,
    mergedAnimations,
    seekAnimation,
    setGraphBundle,
    transportActive,
  ]);

  useEffect(() => {
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
  }, [getAnimationState, syncTransportState]);

  return null;
}

export function useAnimationTransport() {
  const runtime = useOptionalVizijRuntime();
  const {
    tracks,
    currentTime,
    playSpeed,
    loop,
    play,
    pause,
    stop,
    setLoop,
    setPlaySpeed,
    syncTransportState,
  } = useAnimationStore();

  const hasTracks = tracks.length > 0;
  const canDrive = Boolean(runtime) && hasTracks;

  const playTransport = useCallback(() => {
    if (!canDrive || !runtime) {
      return;
    }
    runtime.setAnimationLoop(AUTHORED_TIMELINE_CLIP_ID, loop);
    runtime.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, currentTime);
    play();
    void runtime.playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
      reset: false,
      speed: playSpeed,
    });
  }, [canDrive, currentTime, loop, play, playSpeed, runtime]);

  const pauseTransport = useCallback(() => {
    if (!canDrive || !runtime) {
      syncTransportState({
        isPlaying: false,
        transportActive: false,
        transportPlaybackState: "stopped",
      });
      return;
    }
    runtime.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
    pause();
  }, [canDrive, pause, runtime, syncTransportState]);

  const stopTransport = useCallback(() => {
    if (!canDrive || !runtime) {
      stop();
      return;
    }
    runtime.stopAnimation(AUTHORED_TIMELINE_CLIP_ID);
    stop();
  }, [canDrive, runtime, stop]);

  const seekTransport = useCallback(
    (timeSeconds: number) => {
      if (!canDrive || !runtime) {
        syncTransportState({
          currentTime: timeSeconds,
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        });
        return;
      }
      runtime.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, timeSeconds);
      syncTransportState({
        currentTime: timeSeconds,
        transportActive: true,
        transportPlaybackState: "paused",
        isPlaying: false,
      });
    },
    [canDrive, runtime, syncTransportState],
  );

  const setLoopTransport = useCallback(
    (enabled: boolean) => {
      setLoop(enabled);
      if (!canDrive || !runtime) {
        return;
      }
      runtime.setAnimationLoop(AUTHORED_TIMELINE_CLIP_ID, enabled);
    },
    [canDrive, runtime, setLoop],
  );

  const setSpeedTransport = useCallback(
    (multiplier: number) => {
      setPlaySpeed(multiplier);
      if (!canDrive || !runtime) {
        return;
      }
      const playbackState = runtime.getAnimationState(
        AUTHORED_TIMELINE_CLIP_ID,
      );
      if (playbackState?.playing) {
        void runtime.playAnimation(AUTHORED_TIMELINE_CLIP_ID, {
          reset: false,
          speed: multiplier,
        });
      }
    },
    [canDrive, runtime, setPlaySpeed],
  );

  const stepTransport = useCallback(
    (deltaSeconds = 1 / 30) => {
      if (!canDrive || !runtime) {
        syncTransportState({
          currentTime: currentTime + Math.max(0, deltaSeconds),
          isPlaying: false,
          transportActive: false,
          transportPlaybackState: "stopped",
        });
        return;
      }
      runtime.pauseAnimation(AUTHORED_TIMELINE_CLIP_ID);
      const playbackState = runtime.getAnimationState(
        AUTHORED_TIMELINE_CLIP_ID,
      );
      const baseTime = playbackState?.time ?? currentTime;
      const durationSeconds = playbackState?.duration ?? 0;
      const unclampedTime = baseTime + Math.max(0, deltaSeconds);
      const nextTime =
        durationSeconds > 0
          ? Math.max(0, Math.min(unclampedTime, durationSeconds))
          : Math.max(0, unclampedTime);
      runtime.seekAnimation(AUTHORED_TIMELINE_CLIP_ID, nextTime);
      syncTransportState({
        currentTime: nextTime,
        isPlaying: false,
        transportActive: true,
        transportPlaybackState: "paused",
      });
    },
    [canDrive, currentTime, runtime, syncTransportState],
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
