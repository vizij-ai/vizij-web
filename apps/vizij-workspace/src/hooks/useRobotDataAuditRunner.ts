import { useCallback, useEffect, useRef, useState } from "react";
import type { World } from "@vizij/render";
import type { AnimatableValue } from "@vizij/utils";
import {
  createRobotDataAuditTask,
  type RobotDataAuditResult,
} from "../utils/robotDataAudit";

type RobotDataAuditStatus = "idle" | "running" | "succeeded" | "error";

interface UseRobotDataAuditRunnerOptions {
  namespace: string;
  world: World;
  animatables: Record<string, AnimatableValue>;
  enabled: boolean;
}

interface RobotDataAuditRunnerState {
  status: RobotDataAuditStatus;
  progress: number;
  result: RobotDataAuditResult | null;
  error: string | null;
  updatedAt: number | null;
}

interface RobotDataAuditRunnerControls extends RobotDataAuditRunnerState {
  isResultStale: boolean;
  runAudit: () => void;
  cancelAudit: () => void;
}

interface AuditWork {
  task: ReturnType<typeof createRobotDataAuditTask>;
  cancelHandle: (() => void) | null;
  cancelled: boolean;
  sceneSnapshot: {
    world: World;
    animatables: Record<string, AnimatableValue>;
  };
}

const MAX_BATCH_TIME_MS = 10;
const STEP_BATCH_SIZE = 8;

export function useRobotDataAuditRunner({
  namespace,
  world,
  animatables,
  enabled,
}: UseRobotDataAuditRunnerOptions): RobotDataAuditRunnerControls {
  const [state, setState] = useState<RobotDataAuditRunnerState>({
    status: "idle",
    progress: 0,
    result: null,
    error: null,
    updatedAt: null,
  });
  const [isResultStale, setResultStale] = useState(false);
  const lastResultSceneRef = useRef<{
    world: World | null;
    animatables: Record<string, AnimatableValue> | null;
  }>({ world: null, animatables: null });
  const workRef = useRef<AuditWork | null>(null);

  const cancelAudit = useCallback(() => {
    const work = workRef.current;
    if (work?.cancelHandle) {
      work.cancelHandle();
    }
    if (work) {
      work.cancelled = true;
    }
    workRef.current = null;
    setState((previous) => {
      if (previous.status !== "running") {
        return previous;
      }
      return {
        ...previous,
        status: previous.result ? "succeeded" : "idle",
        progress: previous.result ? 1 : 0,
        error: null,
      };
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      cancelAudit();
      setState({
        status: "idle",
        progress: 0,
        result: null,
        error: null,
        updatedAt: null,
      });
      lastResultSceneRef.current = { world: null, animatables: null };
      setResultStale(false);
      return;
    }

    const lastScene = lastResultSceneRef.current;
    const sceneChanged =
      lastScene.world !== world || lastScene.animatables !== animatables;
    setResultStale(sceneChanged && Boolean(state.result));
  }, [animatables, world, enabled, cancelAudit, state.result]);

  useEffect(() => () => cancelAudit(), [cancelAudit]);

  const finishWithResult = useCallback((work: AuditWork) => {
    setState({
      status: "succeeded",
      progress: 1,
      result: work.task.result,
      error: null,
      updatedAt: Date.now(),
    });
    lastResultSceneRef.current = work.sceneSnapshot;
    setResultStale(false);
    workRef.current = null;
  }, []);

  const scheduleStep = useCallback((callback: () => void) => {
    if (typeof window === "undefined") {
      const timeout = setTimeout(callback, 0);
      return () => clearTimeout(timeout);
    }
    const idleScheduler = (window as IdleWindow).requestIdleCallback;
    const idleCancel = (window as IdleWindow).cancelIdleCallback;
    if (typeof idleScheduler === "function") {
      const handle = idleScheduler(() => callback());
      return () => idleCancel?.(handle);
    }
    const timeout = window.setTimeout(callback, 16);
    return () => window.clearTimeout(timeout);
  }, []);

  const runAudit = useCallback(() => {
    if (!enabled) {
      setState((previous) => ({
        ...previous,
        status: "error",
        error: "Load a Vizij GLB before running the audit.",
      }));
      return;
    }
    cancelAudit();
    const task = createRobotDataAuditTask(world, animatables, {
      namespace,
    });
    const sceneSnapshot = { world, animatables };

    if (task.totalNodes === 0) {
      setState({
        status: "succeeded",
        progress: 1,
        result: task.result,
        error: null,
        updatedAt: Date.now(),
      });
      lastResultSceneRef.current = sceneSnapshot;
      setResultStale(false);
      return;
    }

    const work: AuditWork = {
      task,
      cancelHandle: null,
      cancelled: false,
      sceneSnapshot,
    };
    workRef.current = work;
    setState((previous) => ({
      ...previous,
      status: "running",
      progress: 0,
      error: null,
    }));

    const step = () => {
      const currentWork = workRef.current;
      if (!currentWork || currentWork !== work || currentWork.cancelled) {
        return;
      }
      const start = typeof performance !== "undefined" ? performance.now() : 0;
      while (
        !currentWork.task.done &&
        shouldContinue(start, MAX_BATCH_TIME_MS)
      ) {
        currentWork.task.step(STEP_BATCH_SIZE);
      }
      const progress =
        currentWork.task.totalNodes === 0
          ? 1
          : currentWork.task.processedNodes / currentWork.task.totalNodes;
      setState((previous) => ({
        ...previous,
        progress: Math.min(1, progress),
      }));
      if (currentWork.task.done) {
        finishWithResult(currentWork);
        return;
      }
      currentWork.cancelHandle = scheduleStep(step);
    };

    work.cancelHandle = scheduleStep(step);
  }, [
    animatables,
    cancelAudit,
    enabled,
    finishWithResult,
    namespace,
    scheduleStep,
    world,
  ]);

  return {
    ...state,
    isResultStale,
    runAudit,
    cancelAudit,
  };
}

function shouldContinue(start: number, budgetMs: number): boolean {
  if (typeof performance === "undefined" || start === 0) {
    return true;
  }
  const elapsed = performance.now() - start;
  return elapsed < budgetMs;
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};
