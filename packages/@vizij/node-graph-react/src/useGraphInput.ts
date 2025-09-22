import { useEffect } from "react";
import { useGraphContext } from "./GraphContext";

/**
 * useGraphInput
 * Controlled hook for staging inputs into the graph runtime.
 *
 * - path: string path for the input (e.g., "nodes.nodeId.inputs.inputKey")
 * - value: any value to stage
 * - shape: optional shape hint for the WASM runtime
 * - options:
 *    - immediateEval: boolean - if true, apply the staged input and run evalAll immediately
 *
 * Behavior:
 * - On mount/update, stage the provided value into the provider's stagedInputs (persisted)
 * - If immediateEval is true, call runtime.evalAll after staging
 * - On unmount, clear the staged input for the provided path
 */
export function useGraphInput(
  path: string,
  value: any,
  shape?: any,
  options?: { immediateEval?: boolean },
) {
  const runtime = useGraphContext();
  if (!runtime) {
    throw new Error("useGraphInput must be used within a <GraphProvider />");
  }

  useEffect(() => {
    runtime.stageInput(path, value, shape);
    if (options?.immediateEval) {
      // apply staged inputs and eval immediately
      runtime.applyStagedInputs?.();
      runtime.evalAll?.();
    }
    return () => {
      // clear staged input for this path to avoid leaking persisted staged values
      runtime.stageInput(path, undefined, undefined);
    };
    // We intentionally depend on path/value/shape/options.immediateEval/runtime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, value, shape, options?.immediateEval, runtime]);
}
