import { useEffect, useState, useCallback } from "react";
import { useGraphContext } from "../GraphContext";

/**
 * useGraphLoaded
 *
 * Returns:
 *  - graphLoaded: boolean
 *  - waitForGraphReady: () => Promise<void>
 *
 * If the runtime exposes waitForGraphReady(), it will be used. Otherwise the
 * returned waitForGraphReady() resolves immediately (legacy behavior).
 */
export function useGraphLoaded() {
  const rt: any = useGraphContext();
  if (!rt) {
    throw new Error("useGraphLoaded must be used within a <GraphProvider />");
  }

  const [graphLoaded, setGraphLoaded] = useState<boolean>(
    Boolean(rt.graphLoaded),
  );

  useEffect(() => {
    // Reflect current context value only when it actually changes
    const next = Boolean(rt.graphLoaded);
    if (next !== graphLoaded) {
      setGraphLoaded(next);
    }

    let cleanup = () => {};
    const hasEvents =
      typeof rt.on === "function" && typeof rt.off === "function";

    // If runtime provides on/off events, listen for changes
    if (hasEvents) {
      const onLoaded = () => setGraphLoaded(true);
      const onError = () => setGraphLoaded(false);
      try {
        rt.on("graphLoaded", onLoaded);
        rt.on("graphLoadError", onError);
      } catch {}
      cleanup = () => {
        try {
          rt.off("graphLoaded", onLoaded);
          rt.off("graphLoadError", onError);
        } catch {}
      };
    }
    return cleanup;
  }, [rt.graphLoaded, graphLoaded]);

  const waitForGraphReady = useCallback((): Promise<void> => {
    if (typeof rt.waitForGraphReady === "function") {
      return rt.waitForGraphReady();
    }
    // legacy: if provider did not expose the promise, resolve immediately
    return Promise.resolve();
  }, [rt]);

  return { graphLoaded, waitForGraphReady } as const;
}
