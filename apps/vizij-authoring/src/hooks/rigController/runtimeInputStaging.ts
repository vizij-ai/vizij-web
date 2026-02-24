import type { StandardInputValues } from "@vizij/node-graph-authoring";
import type { RuntimeInputRoute } from "./runtimeInputRoutes";

export interface QueueRuntimeInputsFromStateArgs {
  routesByCanonicalId: Map<string, RuntimeInputRoute>;
  inputValues: StandardInputValues;
  queueByGraphPath: Map<string, number>;
}

export interface FlushQueuedRuntimeInputsArgs {
  queueByGraphPath: Map<string, number>;
  stagedByGraphPath: Map<string, number>;
  stageRuntimeInput: (graphPath: string, value: number) => void;
}

export function queueRuntimeInputWrite(
  queueByGraphPath: Map<string, number>,
  graphPath: string,
  value: number,
): boolean {
  const previous = queueByGraphPath.get(graphPath);
  if (previous !== undefined && Object.is(previous, value)) {
    return false;
  }
  queueByGraphPath.set(graphPath, value);
  return true;
}

export function queueRuntimeInputsFromState({
  routesByCanonicalId,
  inputValues,
  queueByGraphPath,
}: QueueRuntimeInputsFromStateArgs): number {
  let queuedCount = 0;
  routesByCanonicalId.forEach((route, canonicalInputId) => {
    const stored = inputValues[canonicalInputId];
    const value =
      typeof stored === "number" && Number.isFinite(stored)
        ? stored
        : route.defaultValue;
    if (queueRuntimeInputWrite(queueByGraphPath, route.graphPath, value)) {
      queuedCount += 1;
    }
  });
  return queuedCount;
}

export function flushQueuedRuntimeInputs({
  queueByGraphPath,
  stagedByGraphPath,
  stageRuntimeInput,
}: FlushQueuedRuntimeInputsArgs): number {
  if (queueByGraphPath.size === 0) {
    return 0;
  }
  let writeCount = 0;
  queueByGraphPath.forEach((value, graphPath) => {
    const staged = stagedByGraphPath.get(graphPath);
    if (staged !== undefined && Object.is(staged, value)) {
      return;
    }
    stageRuntimeInput(graphPath, value);
    stagedByGraphPath.set(graphPath, value);
    writeCount += 1;
  });
  queueByGraphPath.clear();
  return writeCount;
}
