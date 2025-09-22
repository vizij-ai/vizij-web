import { useCallback } from "react";
import { useGraphContext } from "./GraphContext";
import { useGraphOutputs } from "./useGraphOutputs";
import type { PlaybackMode } from "./types";

/**
 * useGraphPlayback
 * Hook to control the provider playback loop.
 *
 * Methods:
 * - start(mode?, hz?) - start playback in given mode ("raf"|"interval") or default
 * - stop() - stop any running playback loop
 * - getMode() - current playback mode (reactive)
 */
export function useGraphPlayback() {
  const rt: any = useGraphContext();
  if (!rt) {
    throw new Error("useGraphPlayback must be used within a <GraphProvider />");
  }

  // Subscribe to playbackMode stored in the provider snapshot so getMode is reactive.
  const playbackMode = useGraphOutputs(
    (snap) => (snap as any)?.playbackMode ?? "manual",
  );

  const start = useCallback(
    (mode?: PlaybackMode, hz?: number) => {
      rt.startPlayback?.(mode, hz);
    },
    [rt],
  );

  const stop = useCallback(() => {
    rt.stopPlayback?.();
  }, [rt]);

  const getMode = useCallback(() => {
    return playbackMode as PlaybackMode;
  }, [playbackMode]);

  const isReady = Boolean(rt.ready);

  return {
    start,
    stop,
    getMode,
    isReady,
  } as const;
}
