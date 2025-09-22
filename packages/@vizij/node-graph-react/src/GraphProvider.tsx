import React, { useEffect, useRef, useState, useCallback } from "react";
import { GraphContext } from "./GraphContext";
import type {
  GraphRuntimeContextValue,
  PlaybackMode,
  GraphProviderProps,
} from "./types";
import { createGraphStore } from "./utils/createGraphStore";
import { normalizeSpec } from "./utils/normalizeSpec";
import * as wasm from "@vizij/node-graph-wasm";

type Graph = any;
type GraphSpec = any;
type EvalResult = any;

export function GraphProvider({
  children,
  spec,
  autoStart = false,
  autoMode = "raf",
  updateHz = 60,
}: GraphProviderProps) {
  const [ready, setReady] = useState(false);
  const wasmModuleRef = useRef<any>(null);
  const graphRef = useRef<Graph | null>(null);
  const storeRef = useRef(
    createGraphStore<{
      evalResult: EvalResult | null;
      version: number;
      playbackMode?: PlaybackMode;
    }>({
      evalResult: null,
      version: 0,
      playbackMode: "manual",
    }),
  );
  // staged host inputs awaiting application before next eval
  const stagedInputsRef = useRef<Record<string, any>>({});
  const rafIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<any>(null);
  const playbackModeRef = useRef<PlaybackMode>("manual");
  const runningRef = useRef<boolean>(false);

  // Initialize WASM runtime once
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Some wasm packages expose an init() that must be awaited.
        // The init() typically does not return the module object; we import the module namespace above.
        await wasm.init?.();
        if (!mounted) return;
        wasmModuleRef.current = wasm;
        setReady(true);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to init @vizij/node-graph-wasm:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Helper: publish eval result to store
  const publishEvalResult = useCallback((res: EvalResult | null) => {
    storeRef.current.setSnapshot((prev) => ({
      ...prev,
      evalResult: res,
      version: (prev.version || 0) + 1,
    }));
  }, []);

  // Helper: get writes from current snapshot
  const getWrites = useCallback(() => {
    const snap = storeRef.current.getSnapshot();
    return snap?.evalResult?.writes ?? [];
  }, []);

  const clearWrites = useCallback(() => {
    storeRef.current.setSnapshot((prev) => {
      if (!prev || !prev.evalResult) return prev;
      const nextEval = { ...prev.evalResult, writes: [] };
      return {
        ...prev,
        evalResult: nextEval,
        version: (prev.version || 0) + 1,
      };
    });
  }, []);

  // Apply staged inputs to the active graph (if any)
  const applyStagedInputs = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const staged = stagedInputsRef.current;
    const keys = Object.keys(staged);
    if (keys.length === 0) return;
    for (const path of keys) {
      const { value, shape } = staged[path];
      try {
        // WASM Graph API: stageInput(path, value, shape?)
        // Always pass the shape argument explicitly (may be undefined) to keep call arity stable
        graph.stageInput(path, value, shape);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Error staging input on graph:", err);
      }
    }
    // After applying, clear staged inputs (we keep last staged state in case consumer wants to replay)
    stagedInputsRef.current = {};
  }, []);

  // Eval tick - returns the eval result if available
  const evalTick = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return null;
    try {
      // Ensure staged inputs are applied first
      applyStagedInputs();
      // Evaluate the graph
      const res = graph.evalAll ? graph.evalAll() : graph.eval?.();
      // Convert to JSON shape if available
      const json =
        typeof res?.toValueJSON === "function" ? res.toValueJSON?.() : res;
      publishEvalResult(json ?? res ?? null);
      return json ?? res ?? null;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Graph eval error:", err);
      return null;
    }
  }, [applyStagedInputs, publishEvalResult]);

  // Playback loop implementations
  const startRaf = useCallback(() => {
    if (rafIdRef.current != null) return;
    const loop = () => {
      if (!runningRef.current) {
        rafIdRef.current = null;
        return;
      }
      evalTick();
      rafIdRef.current =
        typeof window !== "undefined"
          ? window.requestAnimationFrame(loop)
          : null;
    };
    runningRef.current = true;
    rafIdRef.current =
      typeof window !== "undefined" ? window.requestAnimationFrame(loop) : null;
  }, [evalTick]);

  const stopRaf = useCallback(() => {
    if (rafIdRef.current != null && typeof window !== "undefined") {
      window.cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = null;
    runningRef.current = false;
  }, []);

  const startInterval = useCallback(
    (hz: number) => {
      if (intervalIdRef.current != null) return;
      runningRef.current = true;
      const ms = Math.max(1, Math.floor(1000 / Math.max(1, hz)));
      intervalIdRef.current = setInterval(() => {
        if (!runningRef.current) return;
        evalTick();
      }, ms);
    },
    [evalTick],
  );

  const stopInterval = useCallback(() => {
    if (intervalIdRef.current != null) {
      clearInterval(intervalIdRef.current);
    }
    intervalIdRef.current = null;
    runningRef.current = false;
  }, []);

  const stopPlayback = useCallback(() => {
    stopRaf();
    stopInterval();
    runningRef.current = false;
    playbackModeRef.current = "manual";
    storeRef.current.setSnapshot((prev) => ({
      ...prev,
      playbackMode: "manual",
      version: (prev.version || 0) + 1,
    }));
  }, [stopInterval, stopRaf]);

  const startPlayback = useCallback(
    (mode: PlaybackMode = "raf", hz?: number) => {
      stopPlayback();
      playbackModeRef.current = mode;
      // publish playbackMode into the snapshot so subscribers can react
      storeRef.current.setSnapshot((prev) => ({
        ...prev,
        playbackMode: mode,
        version: (prev.version || 0) + 1,
      }));
      if (mode === "raf") {
        startRaf();
      } else if (mode === "interval") {
        startInterval(hz ?? updateHz);
      } else {
        // manual mode - do nothing
      }
    },
    [startInterval, startRaf, stopPlayback, updateHz],
  );

  // Runtime API exposed to consumers
  const runtime: GraphRuntimeContextValue = {
    graph: graphRef.current,
    getLastDt: () => 0,
    ready,
    getSnapshot: () => storeRef.current.getSnapshot(),
    subscribe: (listener: () => void) => storeRef.current.subscribe(listener),
    getVersion: () => storeRef.current.getVersion(),
    loadGraph: async (spec: GraphSpec) => {
      const module = wasmModuleRef.current ?? wasm;
      if (!module) {
        throw new Error("WASM runtime not ready");
      }
      const normalized = normalizeSpec(spec);
      // free existing graph if present
      if (graphRef.current && typeof graphRef.current.free === "function") {
        try {
          graphRef.current.free();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Error freeing previous graph:", err);
        }
        graphRef.current = null;
      }
      // WASM runtime: create a Graph instance - assume module.Graph or module.createGraph or module.loadGraph
      const GraphCtor = module.Graph ?? module.createGraph ?? null;
      let g: Graph | null = null;
      if (GraphCtor) {
        // Some WASM bindings return constructors, others return factory functions
        try {
          g =
            typeof GraphCtor === "function"
              ? new (GraphCtor as any)(normalized)
              : (GraphCtor as any)(normalized);
        } catch (err) {
          // Try factory-style
          try {
            g = module.loadGraph?.(normalized) ?? null;
          } catch (err2) {
            // eslint-disable-next-line no-console
            console.error("Failed to construct Graph instance:", err, err2);
            throw err2 ?? err;
          }
        }
      } else if (module.loadGraph) {
        g = module.loadGraph(normalized);
      } else {
        throw new Error(
          "Unable to find Graph constructor/factory on WASM module",
        );
      }
      graphRef.current = g;
      // After load, publish an initial empty eval result (consumer may call eval)
      publishEvalResult(null);
      return g;
    },
    unloadGraph: () => {
      if (graphRef.current && typeof graphRef.current.free === "function") {
        try {
          graphRef.current.free();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Error freeing graph:", err);
        }
      }
      graphRef.current = null;
      publishEvalResult(null);
    },
    stageInput: (
      path: string,
      value: any,
      shape?: any,
      immediateEval?: boolean,
    ) => {
      // Persist staged input; will be applied before next eval
      stagedInputsRef.current[path] = { value, shape };
      // If caller requests immediate evaluation, apply staged inputs now and eval.
      if (immediateEval) {
        try {
          applyStagedInputs();
          evalTick();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(
            "immediateEval: error applying staged inputs or eval:",
            err,
          );
        }
      }
    },
    clearStagedInputs: () => {
      stagedInputsRef.current = {};
    },
    applyStagedInputs: () => {
      applyStagedInputs();
    },
    evalAll: () => {
      return evalTick();
    },
    step: (dt: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      if (typeof graph.step === "function") {
        graph.step(dt);
      } else {
        // fall back to manual time stepping if available
        if (typeof graph.setTime === "function") {
          // assume graph maintains time externally - leave to consumer
        }
      }
      // After stepping, run an evaluation so outputs reflect the new time
      try {
        evalTick();
      } catch (e) {
        // ignore
      }
    },
    setTime: (t: number) => {
      const graph = graphRef.current;
      if (!graph) return;
      if (typeof graph.setTime === "function") {
        graph.setTime(t);
      }
      // Reflect change immediately
      try {
        evalTick();
      } catch (e) {
        // ignore
      }
    },
    setParam: (nodeId: string, key: string, value: any) => {
      const graph = graphRef.current;
      if (!graph) return;
      if (typeof graph.setParam === "function") {
        graph.setParam(nodeId, key, value);
      }
      // Reflect change immediately
      try {
        evalTick();
      } catch (e) {
        // ignore
      }
    },
    startPlayback: (mode?: PlaybackMode, hz?: number) =>
      startPlayback(mode ?? autoMode, hz),
    stopPlayback: () => stopPlayback(),
    getPlaybackMode: () => {
      // Prefer playbackMode stored in the snapshot (keeps store-driven UIs consistent),
      // fall back to the internal ref if not present.
      const snap = storeRef.current.getSnapshot() as any;
      return (snap && snap.playbackMode) ?? playbackModeRef.current;
    },
    // writes helpers
    getWrites,
    clearWrites,
  };

  // Auto-start playback if requested once runtime becomes ready
  useEffect(() => {
    if (!ready) return;
    if (autoStart) {
      startPlayback(autoMode, updateHz);
    }
    return () => {
      stopPlayback();
    };
    // AutoStart only on mount or ready change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // If a spec prop is provided, load it when wasm runtime becomes ready or when spec changes
  useEffect(() => {
    if (!ready || spec == null) return;
    let cancelled = false;
    (async () => {
      try {
        await runtime.loadGraph(spec);
        if (cancelled) return;
        // After loading, perform an initial eval to seed outputs/writes
        evalTick();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("GraphProvider: loadGraph failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spec]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      stopPlayback();
      if (graphRef.current && typeof graphRef.current.free === "function") {
        try {
          graphRef.current.free();
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn("Error freeing graph on unmount:", err);
        }
      }
      graphRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force provider re-render when the internal store snapshot changes.
  // Many consumers read runtime.getPlaybackMode() directly from the runtime object.
  // To ensure those consumers re-render when playbackMode changes we subscribe to
  // the internal store and bump local state so the provider value identity changes.
  const [, setVersion] = React.useState(0);
  React.useEffect(() => {
    const unsub = storeRef.current.subscribe(() => {
      setVersion((v) => v + 1);
    });
    return unsub;
  }, []);

  // Value provided via context: runtime API and a convenience getter for snapshot
  const ctxValue: GraphRuntimeContextValue = {
    ...runtime,
  };

  return (
    <GraphContext.Provider value={ctxValue}>{children}</GraphContext.Provider>
  );
}
