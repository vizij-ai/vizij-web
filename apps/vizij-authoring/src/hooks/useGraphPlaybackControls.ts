import { useCallback, useEffect, useRef, useState } from "react";

interface UseGraphPlaybackControlsOptions {
  graphStatus: "idle" | "loading" | "ready" | "error";
  stageInputsFromState: (options?: { clear?: boolean }) => void;
  stepRigGraph: (deltaSeconds: number) => void;
  evalRigGraph: () => unknown;
  applyGraphOutputs: (result: unknown) => void;
  setRigTime: (time: number) => void;
  resetDrivenAnimatables: () => void;
}

interface GraphPlaybackControls {
  graphTimeSeconds: number;
  graphPlaybackState: "playing" | "paused";
  graphFrameRate: number;
  playGraph: () => void;
  pauseGraph: () => void;
  stopGraph: () => void;
  stepGraph: () => void;
}

export function useGraphPlaybackControls(
  options: UseGraphPlaybackControlsOptions,
): GraphPlaybackControls {
  const {
    graphStatus,
    stageInputsFromState,
    stepRigGraph,
    evalRigGraph,
    applyGraphOutputs,
    setRigTime,
    resetDrivenAnimatables,
  } = options;

  const [graphTimeSeconds, setGraphTimeSeconds] = useState(0);
  const graphTimeRef = useRef(0);
  const [graphPlaybackState, setGraphPlaybackState] = useState<
    "playing" | "paused"
  >("playing");
  const playbackStateRef = useRef<"playing" | "paused">("playing");
  const [graphFrameRate, setGraphFrameRate] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  const cancelAnimationLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    lastFrameTimeRef.current = null;
  }, []);

  const runGraphStep = useCallback(
    (deltaSeconds: number) => {
      if (graphStatus !== "ready") {
        return;
      }
      const clampedDelta = Math.max(deltaSeconds, 0);
      graphTimeRef.current += clampedDelta;
      setGraphTimeSeconds(graphTimeRef.current);
      setRigTime(graphTimeRef.current);
      stageInputsFromState();
      stepRigGraph(clampedDelta);
      const result = evalRigGraph();
      applyGraphOutputs(result);
      if (clampedDelta > 0) {
        const instantaneous = Math.min(240, 1 / clampedDelta);
        if (Number.isFinite(instantaneous)) {
          setGraphFrameRate((previous) => {
            if (previous === 0) {
              return instantaneous;
            }
            const smoothed = previous * 0.85 + instantaneous * 0.15;
            return Math.min(240, Math.max(0, smoothed));
          });
        }
      }
    },
    [
      applyGraphOutputs,
      evalRigGraph,
      graphStatus,
      setRigTime,
      stageInputsFromState,
      stepRigGraph,
    ],
  );

  const runAnimationFrame = useCallback(
    (timestamp: number) => {
      if (playbackStateRef.current !== "playing") {
        animationFrameRef.current = null;
        return;
      }
      const last = lastFrameTimeRef.current ?? timestamp;
      lastFrameTimeRef.current = timestamp;
      const deltaSeconds = Math.max((timestamp - last) / 1000, 0);
      runGraphStep(deltaSeconds);
      animationFrameRef.current = requestAnimationFrame(runAnimationFrame);
    },
    [runGraphStep],
  );

  useEffect(() => {
    if (graphStatus !== "ready") {
      playbackStateRef.current = "paused";
      setGraphPlaybackState("paused");
      cancelAnimationLoop();
      graphTimeRef.current = 0;
      setGraphTimeSeconds(0);
      setRigTime(0);
      setGraphFrameRate(0);
      return;
    }

    if (graphPlaybackState === "playing") {
      playbackStateRef.current = "playing";
      if (animationFrameRef.current === null) {
        lastFrameTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(runAnimationFrame);
      }
    } else {
      playbackStateRef.current = "paused";
      cancelAnimationLoop();
      setGraphFrameRate(0);
    }
  }, [
    cancelAnimationLoop,
    graphPlaybackState,
    graphStatus,
    runAnimationFrame,
    setRigTime,
  ]);

  const playGraph = useCallback(() => {
    if (graphStatus !== "ready") {
      return;
    }
    setGraphPlaybackState("playing");
  }, [graphStatus]);

  const pauseGraph = useCallback(() => {
    setGraphPlaybackState("paused");
  }, []);

  const stopGraph = useCallback(() => {
    setGraphPlaybackState("paused");
    playbackStateRef.current = "paused";
    cancelAnimationLoop();
    graphTimeRef.current = 0;
    setGraphTimeSeconds(0);
    setRigTime(0);
    setGraphFrameRate(0);
    resetDrivenAnimatables();
  }, [cancelAnimationLoop, resetDrivenAnimatables, setRigTime]);

  const stepGraph = useCallback(() => {
    if (graphStatus !== "ready") {
      return;
    }
    if (graphPlaybackState === "playing") {
      setGraphPlaybackState("paused");
    }
    runGraphStep(1 / 60);
  }, [graphPlaybackState, graphStatus, runGraphStep]);

  return {
    graphTimeSeconds,
    graphPlaybackState,
    graphFrameRate,
    playGraph,
    pauseGraph,
    stopGraph,
    stepGraph,
  };
}
