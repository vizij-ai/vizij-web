import type { MutableRefObject } from "react";
import {
  valueAsColorRgba,
  valueAsNumber,
  valueAsVector,
  type ValueJSON,
  type WriteOpJSON,
} from "@vizij/node-graph-react";
import {
  buildAnimatableValue,
  type AnimatableValue,
  type RawValue,
  type StandardRigInput,
  cloneDeepSafe,
} from "@vizij/utils";
import type { StandardInputValues } from "@vizij/node-graph-authoring";

export interface GraphInputBindingEntry {
  graphPath: string;
  inputId?: string;
  defaultValue: number;
}

export function convertValueJSONToRaw(
  animatable: AnimatableValue | undefined,
  value: ValueJSON | undefined,
): RawValue | undefined {
  if (!animatable) {
    return undefined;
  }
  switch (animatable.type) {
    case "number": {
      const num = valueAsNumber(value);
      if (typeof num === "number" && Number.isFinite(num)) {
        return num;
      }
      break;
    }
    case "vector2": {
      const vec = valueAsVector(value);
      if (vec && vec.length >= 2) {
        return {
          x: Number(vec[0] ?? 0),
          y: Number(vec[1] ?? 0),
        };
      }
      break;
    }
    case "vector3":
    case "euler": {
      const vec = valueAsVector(value);
      if (vec && vec.length >= 3) {
        return {
          x: Number(vec[0] ?? 0),
          y: Number(vec[1] ?? 0),
          z: Number(vec[2] ?? 0),
        };
      }
      break;
    }
    case "rgb": {
      const color = valueAsColorRgba(value);
      if (Array.isArray(color)) {
        const [r = 0, g = 0, b = 0] = color;
        return {
          r: Number(r ?? 0),
          g: Number(g ?? 0),
          b: Number(b ?? 0),
        };
      }
      const vec = valueAsVector(value);
      if (vec && vec.length >= 3) {
        return {
          r: Number(vec[0] ?? 0),
          g: Number(vec[1] ?? 0),
          b: Number(vec[2] ?? 0),
        };
      }
      break;
    }
    default:
      break;
  }
  const fallback = animatable.default as RawValue;
  if (fallback && typeof fallback === "object") {
    return cloneDeepSafe(fallback);
  }
  return fallback;
}

export interface ApplyGraphOutputsOptions {
  result: unknown;
  animatables: Record<string, AnimatableValue>;
  namespace: string;
  setValue: (
    animId: string,
    ns: string,
    value: RawValue | ((current: RawValue | undefined) => RawValue | undefined),
  ) => void;
  drivenAnimatablesRef: MutableRefObject<Set<string>>;
  resetDrivenAnimatables: () => void;
}

export function applyGraphOutputsToAnimatables({
  result,
  animatables,
  namespace,
  setValue,
  drivenAnimatablesRef,
  resetDrivenAnimatables,
}: ApplyGraphOutputsOptions): void {
  if (!result) {
    resetDrivenAnimatables();
    return;
  }
  const writes: WriteOpJSON[] = Array.isArray((result as any)?.writes)
    ? ((result as any).writes as WriteOpJSON[])
    : [];
  const nextDriven = new Set<string>();

  writes.forEach((write) => {
    if (!write || typeof write.path !== "string") {
      return;
    }
    const animatable = animatables[write.path];
    if (!animatable) {
      return;
    }
    const rawValue = convertValueJSONToRaw(
      animatable,
      write.value as ValueJSON,
    );
    if (rawValue === undefined) {
      return;
    }
    setValue(write.path, namespace, rawValue);
    nextDriven.add(write.path);
  });

  drivenAnimatablesRef.current.forEach((animId) => {
    if (nextDriven.has(animId)) {
      return;
    }
    const animatable = animatables[animId];
    if (!animatable) {
      return;
    }
    const resetValue = buildAnimatableValue(animatable, undefined);
    setValue(animId, namespace, resetValue);
  });

  drivenAnimatablesRef.current = nextDriven;
}

export interface StageGraphInputsOptions {
  graphStatus: "idle" | "loading" | "ready" | "error";
  bindingsById: Map<string, string>;
  fallbackBindings: readonly GraphInputBindingEntry[];
  inputValues: StandardInputValues;
  standardInputsById: Map<string, StandardRigInput>;
  stageRigInput: (graphPath: string, payload: { float: number }) => void;
  clearRigStaged: () => void;
  clearExisting?: boolean;
  debug?: boolean;
}

export function stageGraphInputsFromState({
  graphStatus,
  bindingsById,
  fallbackBindings,
  inputValues,
  standardInputsById,
  stageRigInput,
  clearRigStaged,
  clearExisting,
  debug,
}: StageGraphInputsOptions): void {
  if (graphStatus !== "ready") {
    return;
  }
  if (bindingsById.size === 0 && fallbackBindings.length === 0) {
    return;
  }
  if (clearExisting) {
    clearRigStaged();
  }
  if (debug) {
    // console.debug("[vizij] stage all inputs", {
    //   count:
    //     bindingsById.size > 0 ? bindingsById.size : fallbackBindings.length,
    //   clear: clearExisting ?? false,
    // });
  }
  if (bindingsById.size > 0) {
    bindingsById.forEach((graphPath, inputId) => {
      const stored = inputValues[inputId];
      const fallbackInput = standardInputsById.get(inputId);
      const value =
        typeof stored === "number" && Number.isFinite(stored)
          ? stored
          : (fallbackInput?.defaultValue ?? 0);
      stageRigInput(graphPath, { float: value });
    });
    return;
  }
  fallbackBindings.forEach(({ graphPath, inputId, defaultValue }) => {
    const stored = inputId ? inputValues[inputId] : undefined;
    const value =
      typeof stored === "number" && Number.isFinite(stored)
        ? stored
        : defaultValue;
    stageRigInput(graphPath, { float: value });
  });
}

export interface RuntimeInputBridgeStore {
  getState: () => {
    stageRuntimeInput?: (graphPath: string, value: number) => void;
  };
  subscribe: (listener: () => void) => () => void;
}

export function subscribeRuntimeInputBridgeAvailable(
  store: RuntimeInputBridgeStore,
  onAvailable: () => void,
): () => void {
  let previous = store.getState().stageRuntimeInput;
  return store.subscribe(() => {
    const next = store.getState().stageRuntimeInput;
    if (next && next !== previous) {
      onAvailable();
    }
    previous = next;
  });
}
