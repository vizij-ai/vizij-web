import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  init,
  Graph,
  type GraphSpec,
  type ValueJSON,
  type Value,
} from "@vizij/node-graph-wasm";

/**
 * Internal shape produced by the engine:
 * Record<nodeId, Record<portKey, ValueJSON>>
 */
type Outputs = Record<string, Record<string, ValueJSON>> | null;

type Ctx = {
  ready: boolean;

  // Legacy field (kept for compatibility but not updated per-frame to avoid global rerenders)
  outputs: Outputs;

  /** Update a node parameter (e.g., "value", "frequency", "phase", "min", "max", "x", "y", "z") */
  setParam: (nodeId: string, key: string, value: Value) => void;

  /** Replace/reload the graph spec at runtime */
  reload: (spec: GraphSpec | string) => void;

  /** Set absolute time (seconds) for deterministic scrubbing or syncing */
  setTime: (t: number) => void;

  /** Subscribe to changes for a given nodeId; used by selector hooks */
  subscribeToNode: (nodeId: string, cb: () => void) => () => void;

  /** Snapshot accessor for a single port on a node */
  getNodeOutputSnapshot: (nodeId: string | undefined, key?: string) => ValueJSON | undefined;
};

const NodeGraphCtx = createContext<Ctx | null>(null);

export const NodeGraphProvider: React.FC<{
  children: React.ReactNode;
  /** Graph spec (object or pre-serialized JSON) loaded on mount and when identity changes */
  spec: GraphSpec | string;
  /** Start an internal RAF loop that advances time with `step(dt)` and calls `evalAll()` each frame */
  autostart?: boolean;
  /** Optional: throttle UI notifications (in Hz). Example: 30 means ~ every 33ms. Default: notify every frame. */
  updateHz?: number;
}> = ({ children, spec, autostart = true, updateHz }) => {
  const graphRef = useRef<Graph | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const lastNotifyRef = useRef<number>(0);
  const specRef = useRef<GraphSpec | string | null>(null);

  const [ready, setReady] = useState(false);
  // Legacy outputs state for backward-compat nodes reading ctx.outputs
  const [legacyOutputs, setLegacyOutputs] = useState<Outputs>(null);

  // External outputs store and subscribers (per nodeId)
  const outputsRef = useRef<Record<string, Record<string, ValueJSON>>>({});
  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());

  const notifyNode = (nodeId: string) => {
    const subs = subscribersRef.current.get(nodeId);
    if (!subs || subs.size === 0) return;
    // Clone to avoid mutation during iteration
    [...subs].forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("NodeGraph notify callback error", e);
      }
    });
  };

  const subscribeToNode = useCallback((nodeId: string, cb: () => void) => {
    let set = subscribersRef.current.get(nodeId);
    if (!set) {
      set = new Set();
      subscribersRef.current.set(nodeId, set);
    }
    set.add(cb);
    return () => {
      const s = subscribersRef.current.get(nodeId);
      if (!s) return;
      s.delete(cb);
      if (s.size === 0) subscribersRef.current.delete(nodeId);
    };
  }, []);

  const getNodeOutputSnapshot = useCallback(
    (nodeId?: string, key: string = "out") => {
      if (!nodeId) return undefined;
      return outputsRef.current[nodeId]?.[key];
    },
    []
  );

  // Equality helpers
  const equalValue = (a: ValueJSON | undefined, b: ValueJSON | undefined): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    if ("float" in a && "float" in b) return a.float === b.float;
    if ("bool" in a && "bool" in b) return a.bool === b.bool;
    if ("vec3" in a && "vec3" in b) {
      const av = a.vec3;
      const bv = b.vec3;
      return av[0] === bv[0] && av[1] === bv[1] && av[2] === bv[2];
    }
    return false;
  };

  const equalNodeOutputs = (
    prev: Record<string, ValueJSON> | undefined,
    next: Record<string, ValueJSON> | undefined
  ): boolean => {
    if (prev === next) return true;
    if (!prev || !next) return false;
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length !== nextKeys.length) return false;
    for (const k of nextKeys) {
      if (!equalValue(prev[k], next[k])) return false;
    }
    return true;
  };

  const buildAndNotifyOutputs = (raw: Record<string, Record<string, ValueJSON>>) => {
    const prev = outputsRef.current;
    const next: Record<string, Record<string, ValueJSON>> = {};
    const changedNodes: string[] = [];

    // Nodes present in new output
    for (const nodeId of Object.keys(raw)) {
      const prevNode = prev[nodeId];
      const nextNodeRaw = raw[nodeId];
      if (equalNodeOutputs(prevNode, nextNodeRaw)) {
        next[nodeId] = prevNode;
      } else {
        next[nodeId] = nextNodeRaw;
        changedNodes.push(nodeId);
      }
    }

    // Nodes removed
    for (const nodeId of Object.keys(prev)) {
      if (!(nodeId in raw)) {
        // drop from next; notify removal
        changedNodes.push(nodeId);
      }
    }

    outputsRef.current = next;
    changedNodes.forEach(notifyNode);
    // Keep legacy outputs updated to avoid breaking existing components while we migrate
    setLegacyOutputs(next);
  };

  // init + construct + load spec + optional RAF loop
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await init();

      const g = new Graph();
      graphRef.current = g;
      g.loadGraph(spec);
      specRef.current = spec;

      // seed outputs immediately
      const initial = g.evalAll() as Record<string, Record<string, ValueJSON>>;
      buildAndNotifyOutputs(initial);

      setReady(true);

      if (!autostart) return;

      const loop = (t: number) => {
        if (cancelled) return;

        const last = lastTimeRef.current || t;
        const dt = (t - last) / 1000; // seconds
        lastTimeRef.current = t;

        g.step(dt);

        const now = performance.now();
        const interval = updateHz && updateHz > 0 ? (1000 / updateHz) : 0;

        if (!interval || now - lastNotifyRef.current >= interval) {
          const out = g.evalAll() as Record<string, Record<string, ValueJSON>>;
          buildAndNotifyOutputs(out);
          lastNotifyRef.current = now;
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    // mount only; spec changes handled in the next effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autostart, updateHz]);

  // Reload graph if `spec` identity changes (keeps the same Graph instance)
  useEffect(() => {
    if (!ready || !graphRef.current) return;
    if (specRef.current === spec) return;
    graphRef.current.loadGraph(spec);
    specRef.current = spec;
    // refresh outputs immediately
    const out = graphRef.current.evalAll() as Record<string, Record<string, ValueJSON>>;
    buildAndNotifyOutputs(out);
  }, [spec, ready]);

  // Context API with stable callbacks
  const setParam = useCallback((nodeId: string, key: string, value: Value) => {
    const g = graphRef.current;
    if (!g) return;
    g.setParam(nodeId, key, value);
    // reflect change immediately
    const out = g.evalAll() as Record<string, Record<string, ValueJSON>>;
    buildAndNotifyOutputs(out);
  }, []);

  const reload = useCallback((newSpec: GraphSpec | string) => {
    const g = graphRef.current;
    if (!g) return;
    g.loadGraph(newSpec);
    specRef.current = newSpec;
    const out = g.evalAll() as Record<string, Record<string, ValueJSON>>;
    buildAndNotifyOutputs(out);
  }, []);

  const setTime = useCallback((t: number) => {
    const g = graphRef.current;
    if (!g) return;
    g.setTime(t);
    const out = g.evalAll() as Record<string, Record<string, ValueJSON>>;
    buildAndNotifyOutputs(out);
  }, []);

  const ctxValue: Ctx = {
    ready,
    // Expose legacy outputs to maintain backwards compatibility during migration.
    // Selector hooks (useNodeOutput/useNodeOutputs) should be preferred for performance.
    outputs: legacyOutputs,
    setParam,
    reload,
    setTime,
    subscribeToNode,
    getNodeOutputSnapshot,
  };

  return (
    <NodeGraphCtx.Provider value={ctxValue}>
      {children}
    </NodeGraphCtx.Provider>
  );
};

export const useNodeGraph = () => {
  const ctx = useContext(NodeGraphCtx);
  if (!ctx) throw new Error("useNodeGraph must be used within NodeGraphProvider");
  return ctx;
};

/* -----------------------------------------------------------
   Selector hooks for fine-grained subscriptions
----------------------------------------------------------- */

export function useNodeOutput(nodeId?: string, key: string = "out"): ValueJSON | undefined {
  const { subscribeToNode, getNodeOutputSnapshot } = useNodeGraph();

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!nodeId) return () => {};
      return subscribeToNode(nodeId, cb);
    },
    [subscribeToNode, nodeId]
  );

  const getSnapshot = useCallback(
    () => getNodeOutputSnapshot(nodeId, key),
    [getNodeOutputSnapshot, nodeId, key]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

export function useNodeOutputs(nodeId?: string): Record<string, ValueJSON> | undefined {
  const { subscribeToNode, getNodeOutputSnapshot } = useNodeGraph();

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!nodeId) return () => {};
      return subscribeToNode(nodeId, cb);
    },
    [subscribeToNode, nodeId]
  );

  const getSnapshot = useCallback(() => {
    if (!nodeId) return undefined;
    // Gather all ports by probing the last snapshot we saw. We don't cache keys here;
    // consumers that need a specific port should use useNodeOutput for best performance.
    // For simplicity, we reconstruct a shallow object aggregating known ports.
    // We rely on getNodeOutputSnapshot to read by key when known ('out' common).
    // Here, return only 'out' to avoid extra work; complex nodes should use per-port hook.
    const out = getNodeOutputSnapshot(nodeId, "out");
    return out ? { out } : undefined;
  }, [getNodeOutputSnapshot, nodeId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

/* -----------------------------------------------------------
   Optional helpers to read typed values from ValueJSON
   (handy for UI components)
----------------------------------------------------------- */

export function valueAsNumber(v?: unknown): number | undefined {
  let val: ValueJSON | undefined;
  if (v && typeof v === "object") {
    const obj: any = v;
    if ("float" in obj || "bool" in obj || "vec3" in obj) {
      val = obj as ValueJSON;
    } else {
      const map = obj as Record<string, ValueJSON>;
      val = map.out ?? (Object.keys(map)[0] ? map[Object.keys(map)[0]] : undefined);
    }
  }
  if (!val) return undefined;
  if ("float" in val) return val.float;
  if ("bool" in val) return val.bool ? 1 : 0;
  if ("vec3" in val) return val.vec3[0];
  return undefined;
}

export function valueAsVec3(
  v?: unknown
): [number, number, number] | undefined {
  let val: ValueJSON | undefined;
  if (v && typeof v === "object") {
    const obj: any = v;
    if ("float" in obj || "bool" in obj || "vec3" in obj) {
      val = obj as ValueJSON;
    } else {
      const map = obj as Record<string, ValueJSON>;
      val = map.out ?? (Object.keys(map)[0] ? map[Object.keys(map)[0]] : undefined);
    }
  }
  if (!val) return undefined;
  if ("vec3" in val) return val.vec3;
  if ("float" in val) return [val.float, val.float, val.float];
  if ("bool" in val) return val.bool ? [1, 1, 1] : [0, 0, 0];
  return undefined;
}

export function valueAsBool(v?: unknown): boolean | undefined {
  let val: ValueJSON | undefined;
  if (v && typeof v === "object") {
    const obj: any = v;
    if ("float" in obj || "bool" in obj || "vec3" in obj) {
      val = obj as ValueJSON;
    } else {
      const map = obj as Record<string, ValueJSON>;
      val = map.out ?? (Object.keys(map)[0] ? map[Object.keys(map)[0]] : undefined);
    }
  }
  if (!val) return undefined;
  if ("bool" in val) return val.bool;
  if ("float" in val) return val.float !== 0;
  if ("vec3" in val) return val.vec3.some((x: number) => x !== 0);
  return undefined;
}
