import { useEffect, useRef, useCallback } from "react";
import { init as wasmInit } from "@vizij/node-graph-wasm";
import { createGraphStore } from "./utils/createGraphStore";
import { normalizeSpec } from "./utils/normalizeSpec";

type Graph = any;
type GraphSpec = any;
type EvalResult = any;

export interface UseGraphInstanceOptions {
  normalize?: boolean;
  autoEval?: boolean;
}

/**
 * useGraphInstance
 * Manage a local Graph instance (create + dispose) outside of the provider.
 *
 * If `spec` is provided, the hook will attempt to load the graph on mount.
 */
export function useGraphInstance(
  spec?: GraphSpec,
  options?: UseGraphInstanceOptions,
) {
  const wasmRef = useRef<any>(null);
  const graphRef = useRef<Graph | null>(null);
  const stagedRef = useRef<Record<string, any>>({});
  const storeRef = useRef(
    createGraphStore<{
      evalResult: EvalResult | null;
      version: number;
    }>({
      evalResult: null,
      version: 0,
    }),
  );

  // init wasm runtime (if not already)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const m = await wasmInit();
        if (!mounted) return;
        wasmRef.current = m;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("useGraphInstance: wasm init failed", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const publish = useCallback((res: EvalResult | null) => {
    storeRef.current.setSnapshot((prev) => ({
      ...prev,
      evalResult: res,
      version: (prev.version || 0) + 1,
    }));
  }, []);

  const applyStaged = useCallback(() => {
    const g = graphRef.current;
    if (!g) return;
    const staged = stagedRef.current;
    for (const path of Object.keys(staged)) {
      const { value, shape } = staged[path];
      try {
        if (shape !== undefined) {
          g.stageInput(path, value, shape);
        } else {
          g.stageInput(path, value);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("useGraphInstance: stageInput error", err);
      }
    }
    stagedRef.current = {};
  }, []);

  const evalAll = useCallback(() => {
    const g = graphRef.current;
    if (!g) return null;
    try {
      applyStaged();
      const res = g.evalAll ? g.evalAll() : g.eval?.();
      const json =
        typeof res?.toValueJSON === "function" ? res.toValueJSON?.() : res;
      publish(json ?? res ?? null);
      return json ?? res ?? null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("useGraphInstance: evalAll error", err);
      return null;
    }
  }, [applyStaged, publish]);

  const loadGraph = useCallback(
    async (graphSpec: GraphSpec) => {
      if (!wasmRef.current) {
        // attempt to init if not ready
        wasmRef.current = await wasmInit();
      }
      if (!wasmRef.current) {
        throw new Error("WASM runtime not available");
      }
      // free previous if present
      if (graphRef.current && typeof graphRef.current.free === "function") {
        try {
          graphRef.current.free();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("useGraphInstance: free previous graph failed", err);
        }
        graphRef.current = null;
      }
      const normalized =
        options?.normalize !== false ? normalizeSpec(graphSpec) : graphSpec;
      const GraphCtor =
        wasmRef.current.Graph ?? wasmRef.current.createGraph ?? null;
      let g: Graph | null = null;
      if (GraphCtor) {
        try {
          g =
            typeof GraphCtor === "function"
              ? new GraphCtor(normalized)
              : GraphCtor(normalized);
        } catch (err) {
          try {
            g = wasmRef.current.loadGraph?.(normalized) ?? null;
          } catch (err2) {
            // eslint-disable-next-line no-console
            console.error("useGraphInstance: create graph failed", err, err2);
            throw err2 ?? err;
          }
        }
      } else if (wasmRef.current.loadGraph) {
        g = wasmRef.current.loadGraph(normalized);
      } else {
        throw new Error(
          "useGraphInstance: cannot find Graph constructor/factory",
        );
      }
      graphRef.current = g;
      publish(null);
      if (options?.autoEval) {
        evalAll();
      }
      return g;
    },
    [evalAll, options?.autoEval, options?.normalize, publish],
  );

  const unloadGraph = useCallback(() => {
    if (graphRef.current && typeof graphRef.current.free === "function") {
      try {
        graphRef.current.free();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("useGraphInstance: free failed", err);
      }
    }
    graphRef.current = null;
    publish(null);
  }, [publish]);

  const stageInput = useCallback((path: string, value: any, shape?: any) => {
    stagedRef.current[path] = { value, shape };
  }, []);

  const clearStaged = useCallback(() => {
    stagedRef.current = {};
  }, []);

  const setParam = useCallback((nodeId: string, key: string, value: any) => {
    const g = graphRef.current;
    if (!g) return;
    if (typeof g.setParam === "function") g.setParam(nodeId, key, value);
  }, []);

  const step = useCallback((dt: number) => {
    const g = graphRef.current;
    if (!g) return;
    if (typeof g.step === "function") g.step(dt);
  }, []);

  const setTime = useCallback((t: number) => {
    const g = graphRef.current;
    if (!g) return;
    if (typeof g.setTime === "function") g.setTime(t);
  }, []);

  // auto-load provided spec on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (spec) {
        try {
          await loadGraph(spec);
          if (!mounted) return;
          if (options?.autoEval) {
            evalAll();
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error("useGraphInstance: auto load failed", err);
        }
      }
    })();
    return () => {
      mounted = false;
      unloadGraph();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // store interface
    subscribe: storeRef.current.subscribe,
    getSnapshot: storeRef.current.getSnapshot,
    getVersion: storeRef.current.getVersion,
    // instance controls
    loadGraph,
    unloadGraph,
    evalAll,
    stageInput,
    clearStaged,
    setParam,
    step,
    setTime,
  };
}
