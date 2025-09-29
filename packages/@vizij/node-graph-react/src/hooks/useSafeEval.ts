import { useCallback } from "react";
import { useGraphContext } from "../GraphContext";

/**
 * useSafeEval
 *
 * Convenience hook that returns helpers which ensure the graph runtime is
 * ready before performing staging/evaluation operations.
 *
 * Provided helpers:
 *  - stageAndEval(path, value, shape?) : Promise<any>
 *      Awaits runtime.waitForGraphReady() if available, stages the input, and
 *      triggers evalAll(). Returns the eval result (or null).
 *  - safeEvalAll() : Promise<any>
 *      Awaits runtime.waitForGraphReady() if available, then calls evalAll().
 *
 * Note: This helper does NOT buffer or replay multiple streaming calls.
 * Consumers that require streaming semantics must implement their own buffering.
 */
export function useSafeEval() {
  const rt: any = useGraphContext();
  if (!rt) {
    throw new Error("useSafeEval must be used within a <GraphProvider />");
  }

  const waitIfAvailable = useCallback(async () => {
    if (typeof rt.waitForGraphReady === "function") {
      try {
        await rt.waitForGraphReady();
      } catch (err) {
        // propagate error to caller so they can handle load failures
        throw err;
      }
    }
  }, [rt]);

  const stageAndEval = useCallback(
    async (path: string, value: any, shape?: any, immediateEval?: boolean) => {
      await waitIfAvailable();
      // stage the input; runtime.stageInput persists staged inputs until next eval
      rt.stageInput?.(path, value, shape, Boolean(immediateEval));
      if (immediateEval) {
        // If immediateEval requested, eval has already been triggered by stageInput impl
        // but call evalAll to be safe and return the result.
        return rt.evalAll?.();
      }
      // Otherwise perform an explicit eval
      return rt.evalAll?.();
    },
    [rt, waitIfAvailable],
  );

  const safeEvalAll = useCallback(async () => {
    await waitIfAvailable();
    return rt.evalAll?.();
  }, [rt, waitIfAvailable]);

  return {
    stageAndEval,
    safeEvalAll,
  } as const;
}
