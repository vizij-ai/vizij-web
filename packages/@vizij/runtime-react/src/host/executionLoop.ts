import type { ShapeJSON, ValueJSON } from "@vizij/orchestrator-react";
import { namespaceTypedPath } from "@vizij/studio-support";

export type StagedRuntimeInput = {
  value: ValueJSON;
  shape?: ShapeJSON;
};

export type StagedRuntimeInputs = Map<string, StagedRuntimeInput>;

export function stageRuntimeInput(args: {
  stagedInputs: StagedRuntimeInputs;
  namespace: string;
  path: string;
  value: ValueJSON;
  shape?: ShapeJSON;
}): string {
  const namespacedPath = namespaceTypedPath(args.path, args.namespace);
  args.stagedInputs.set(namespacedPath, {
    value: args.value,
    shape: args.shape,
  });
  return namespacedPath;
}

export function flushStagedRuntimeInputs(args: {
  stagedInputs: StagedRuntimeInputs;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
}): number {
  if (args.stagedInputs.size === 0) {
    return 0;
  }
  let count = 0;
  args.stagedInputs.forEach(({ value, shape }, path) => {
    args.setInput(path, value, shape);
    count += 1;
  });
  args.stagedInputs.clear();
  return count;
}

export function flushStagedRuntimeInput(args: {
  stagedInputs: StagedRuntimeInputs;
  namespace: string;
  path: string;
  fallbackValue: ValueJSON;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
}): boolean {
  const namespacedPath = namespaceTypedPath(args.path, args.namespace);
  const staged = args.stagedInputs.get(namespacedPath);
  if (staged) {
    args.setInput(namespacedPath, staged.value, staged.shape);
    args.stagedInputs.delete(namespacedPath);
    return true;
  }
  args.setInput(namespacedPath, args.fallbackValue);
  return false;
}

export function clearStagedRuntimeInput(args: {
  stagedInputs: StagedRuntimeInputs;
  namespace: string;
  path: string;
  removeInput: (path: string) => void;
}): void {
  const namespacedPath = namespaceTypedPath(args.path, args.namespace);
  args.stagedInputs.delete(namespacedPath);
  args.removeInput(namespacedPath);
}

export function updateAverageStepDelta(
  previousAverageDt: number | null,
  dt: number,
  alpha = 0.1,
): number | null {
  if (dt <= 0 || !Number.isFinite(dt)) {
    return previousAverageDt;
  }
  const prev = previousAverageDt ?? dt;
  return prev * (1 - alpha) + dt * alpha;
}

export function advanceRuntimeExecution(args: {
  dt: number;
  previousAverageDt: number | null;
  driveRuntime: boolean;
  forceRuntime?: boolean;
  stagedInputs: StagedRuntimeInputs;
  advanceHostAnimations: (dt: number) => void;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
  stepRuntime: (dt: number) => void;
}): {
  averageDt: number | null;
  flushedInputCount: number;
  steppedRuntime: boolean;
} {
  const averageDt = updateAverageStepDelta(args.previousAverageDt, args.dt);
  args.advanceHostAnimations(args.dt);
  const flushedInputCount = flushStagedRuntimeInputs({
    stagedInputs: args.stagedInputs,
    setInput: args.setInput,
  });
  const steppedRuntime = args.driveRuntime || args.forceRuntime === true;
  if (steppedRuntime) {
    args.stepRuntime(args.dt);
  }
  return { averageDt, flushedInputCount, steppedRuntime };
}
