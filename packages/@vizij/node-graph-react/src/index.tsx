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
  normalizeGraphSpec,
  type GraphSpec,
  type ValueJSON,
  type Value,
  type PortSnapshot,
  type ShapeJSON,
  type WriteOpJSON,
  type EvalResult,
} from "@vizij/node-graph-wasm";

type Outputs = Record<string, Record<string, PortSnapshot>> | null;

type Ctx = {
  ready: boolean;

  /** Update a node parameter (e.g., "value", "frequency", "phase", "min", "max", "x", "y", "z") */
  setParam: (nodeId: string, key: string, value: Value) => void;

  /** Replace/reload the graph spec at runtime */
  reload: (spec: GraphSpec | string) => void;

  /** Set absolute time (seconds) for deterministic scrubbing or syncing */
  setTime: (t: number) => void;

  /** Subscribe to changes for a given nodeId; used by selector hooks */
  subscribeToNode: (nodeId: string, cb: () => void) => () => void;

  /** Snapshot accessor for a single port keyed on a node */
  getNodeOutputSnapshot: (
    nodeId: string | undefined,
    key?: string,
  ) => PortSnapshot | undefined;
  /** Snapshot accessor for a single port on a node */
  getNodeOutput: (
    nodeId: string | undefined,
  ) => Record<string, PortSnapshot> | undefined;

  /** Subscribe to write operations emitted during evaluation */
  subscribeToWrites: (cb: () => void) => () => void;

  /** Snapshot accessor returning the latest writes */
  getWrites: () => WriteOpJSON[];

  /** Clear the cached writes (useful once the host has consumed them) */
  clearWrites: () => void;

  /** Get the duration (seconds) of the most recent graph step */
  getLastDt: () => number;
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
  const currentTimeRef = useRef<number>(0);
  const lastDtRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  // Legacy outputs state for backward-compat nodes reading ctx.outputs
  // External outputs store and subscribers (per nodeId)
  const outputsRef = useRef<Record<string, Record<string, PortSnapshot>>>({});
  const subscribersRef = useRef<Map<string, Set<() => void>>>(new Map());
  const writesRef = useRef<WriteOpJSON[]>([]);
  const writeSubscribersRef = useRef<Set<() => void>>(new Set());

  const notifyNode = useCallback((nodeId: string) => {
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
  }, []);

  const notifyWrites = useCallback(() => {
    const subs = writeSubscribersRef.current;
    if (!subs || subs.size === 0) return;
    [...subs].forEach((cb) => {
      try {
        cb();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("NodeGraph writes callback error", e);
      }
    });
  }, []);

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

  const subscribeToWrites = useCallback((cb: () => void) => {
    const set = writeSubscribersRef.current;
    set.add(cb);
    return () => {
      set.delete(cb);
    };
  }, []);

  const getNodeOutputSnapshot = useCallback(
    (nodeId?: string, key: string = "out") => {
      if (!nodeId) return undefined;
      return outputsRef.current[nodeId]?.[key];
    },
    [],
  );

  const getNodeOutput = useCallback((nodeId?: string) => {
    if (!nodeId) return undefined;
    return outputsRef.current[nodeId];
  }, []);

  const publishWrites = useCallback(
    (writes: WriteOpJSON[]) => {
      writesRef.current = writes;
      notifyWrites();
    },
    [notifyWrites],
  );

  const getWrites = useCallback(() => writesRef.current, []);

  const clearWrites = useCallback(() => {
    if (writesRef.current.length === 0) return;
    writesRef.current = [];
    notifyWrites();
  }, [notifyWrites]);

  const buildAndNotifyOutputs = useCallback(
    (raw: Record<string, Record<string, PortSnapshot>>) => {
      const previousKeys = new Set(Object.keys(outputsRef.current));
      const next: Record<string, Record<string, PortSnapshot>> = {};

      for (const [nodeId, ports] of Object.entries(raw)) {
        next[nodeId] = ports;
        notifyNode(nodeId);
        previousKeys.delete(nodeId);
      }

      outputsRef.current = next;

      // Notify subscribers of nodes that no longer exist so they can clear state.
      previousKeys.forEach((nodeId) => notifyNode(nodeId));
    },
    [notifyNode],
  );

  const applyEvalResult = useCallback(
    (result: EvalResult) => {
      buildAndNotifyOutputs(result.nodes);
      publishWrites(result.writes ?? []);
    },
    [buildAndNotifyOutputs, publishWrites],
  );

  // init + construct + load spec + optional RAF loop
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await init();

      const g = new Graph();
      graphRef.current = g;

      let normalized: GraphSpec;
      try {
        normalized = await normalizeGraphSpec(spec);
      } catch (err) {
        console.error("Failed to normalize graph spec", err);
        normalized =
          typeof spec === "string"
            ? (JSON.parse(spec) as GraphSpec)
            : (spec as GraphSpec);
      }
      if (cancelled) return;

      g.loadGraph(normalized);
      specRef.current = spec;
      currentTimeRef.current = 0;
      lastDtRef.current = 0;

      // seed outputs immediately
      const initial = g.evalAll();
      applyEvalResult(initial);

      setReady(true);

      if (!autostart) return;

      const loop = (t: number) => {
        if (cancelled) return;

        const last = lastTimeRef.current || t;
        const dt = (t - last) / 1000; // seconds
        lastTimeRef.current = t;

        lastDtRef.current = dt;
        currentTimeRef.current += dt;
        g.step(dt);

        const now = performance.now();
        const interval = updateHz && updateHz > 0 ? 1000 / updateHz : 0;

        if (!interval || now - lastNotifyRef.current >= interval) {
          const out = g.evalAll();
          applyEvalResult(out);
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
  }, [autostart, updateHz, applyEvalResult]);

  // Reload graph if `spec` identity changes (keeps the same Graph instance)
  useEffect(() => {
    if (!ready || !graphRef.current) return;
    if (specRef.current === spec) return;

    let cancelled = false;
    (async () => {
      let normalized: GraphSpec;
      try {
        normalized = await normalizeGraphSpec(spec);
      } catch (err) {
        console.error("Failed to normalize graph spec", err);
        normalized =
          typeof spec === "string"
            ? (JSON.parse(spec) as GraphSpec)
            : (spec as GraphSpec);
      }
      if (cancelled || !graphRef.current) return;

      graphRef.current.loadGraph(normalized);
      specRef.current = spec;
      // refresh outputs immediately
      lastDtRef.current = 0;
      const out = graphRef.current.evalAll();
      applyEvalResult(out);
    })();

    return () => {
      cancelled = true;
    };
  }, [spec, ready, applyEvalResult]);

  // Context API with stable callbacks
  const setParam = useCallback(
    (nodeId: string, key: string, value: Value) => {
      const g = graphRef.current;
      if (!g) return;
      g.setParam(nodeId, key, value as any);
      lastDtRef.current = 0;
      // reflect change immediately
      const out = g.evalAll();
      applyEvalResult(out);
    },
    [applyEvalResult],
  );

  const reload = useCallback(
    (newSpec: GraphSpec | string) => {
      const g = graphRef.current;
      if (!g) return;

      (async () => {
        let normalized: GraphSpec;
        try {
          normalized = await normalizeGraphSpec(newSpec);
        } catch (err) {
          console.error("Failed to normalize graph spec", err);
          normalized =
            typeof newSpec === "string"
              ? (JSON.parse(newSpec) as GraphSpec)
              : (newSpec as GraphSpec);
        }
        if (graphRef.current !== g) return;

        g.loadGraph(normalized);
        specRef.current = newSpec;
        currentTimeRef.current = 0;
        lastDtRef.current = 0;
        const out = g.evalAll();
        applyEvalResult(out);
      })();
    },
    [applyEvalResult],
  );

  const setTime = useCallback(
    (t: number) => {
      const g = graphRef.current;
      if (!g) return;
      g.setTime(t);
      const prev = currentTimeRef.current;
      lastDtRef.current = Math.max(0, t - prev);
      currentTimeRef.current = t;
      const out = g.evalAll();
      applyEvalResult(out);
    },
    [applyEvalResult],
  );

  const ctxValue: Ctx = {
    ready,
    setParam,
    reload,
    setTime,
    subscribeToNode,
    getNodeOutputSnapshot,
    getNodeOutput,
    subscribeToWrites,
    getWrites,
    clearWrites,
    getLastDt: () => lastDtRef.current,
  };

  return (
    <NodeGraphCtx.Provider value={ctxValue}>{children}</NodeGraphCtx.Provider>
  );
};

export const useNodeGraph = () => {
  const ctx = useContext(NodeGraphCtx);
  if (!ctx)
    throw new Error("useNodeGraph must be used within NodeGraphProvider");
  return ctx;
};

/* -----------------------------------------------------------
   Selector hooks for fine-grained subscriptions
----------------------------------------------------------- */

export function useNodeOutput(
  nodeId?: string,
  key: string = "out",
): PortSnapshot | undefined {
  const { subscribeToNode, getNodeOutputSnapshot } = useNodeGraph();

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!nodeId) return () => {};
      return subscribeToNode(nodeId, cb);
    },
    [subscribeToNode, nodeId],
  );

  const getSnapshot = useCallback(
    () => getNodeOutputSnapshot(nodeId, key),
    [getNodeOutputSnapshot, nodeId, key],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

export function useNodeOutputs(
  nodeId?: string,
): Record<string, PortSnapshot> | undefined {
  const { subscribeToNode, getNodeOutput } = useNodeGraph();

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!nodeId) return () => {};
      return subscribeToNode(nodeId, cb);
    },
    [subscribeToNode, nodeId],
  );

  const getSnapshot = useCallback(() => {
    if (!nodeId) return undefined;
    return getNodeOutput(nodeId);
  }, [getNodeOutput, nodeId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}

export function useGraphWrites(): WriteOpJSON[] {
  const { subscribeToWrites, getWrites } = useNodeGraph();

  const subscribe = useCallback(
    (cb: () => void) => subscribeToWrites(cb),
    [subscribeToWrites],
  );

  const getSnapshot = useCallback(() => getWrites(), [getWrites]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/* -----------------------------------------------------------
   Optional helpers to read typed values from ValueJSON
   (handy for UI components)
----------------------------------------------------------- */

export function valueAsNumber(
  v?: PortSnapshot | ValueJSON | null,
): number | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("float" in val) return val.float;
  if ("bool" in val) return val.bool ? 1 : 0;
  if ("vec3" in val) return val.vec3[0];
  if ("vec4" in val) return val.vec4[0];
  if ("quat" in val) return val.quat[0];
  if ("color" in val) return val.color[0];
  if ("vector" in val) return val.vector[0] ?? 0;
  if ("transform" in val) return val.transform.pos?.[0] ?? 0;
  if ("enum" in val) return valueAsNumber(val.enum.value);
  if ("array" in val) return valueAsNumber(val.array[0]);
  if ("list" in val) return valueAsNumber(val.list[0]);
  if ("tuple" in val) return valueAsNumber(val.tuple[0]);
  return undefined;
}

export function valueAsVec3(
  v?: PortSnapshot | ValueJSON | null,
): [number, number, number] | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("vec3" in val) return val.vec3;
  if ("vec4" in val) return [val.vec4[0], val.vec4[1], val.vec4[2]];
  if ("quat" in val) return [val.quat[0], val.quat[1], val.quat[2]];
  if ("color" in val) return [val.color[0], val.color[1], val.color[2]];
  if ("vector" in val)
    return [val.vector[0] ?? 0, val.vector[1] ?? 0, val.vector[2] ?? 0];
  if ("transform" in val) {
    const pos = val.transform.pos ?? [0, 0, 0];
    return [pos[0] ?? 0, pos[1] ?? 0, pos[2] ?? 0];
  }
  if ("enum" in val) return valueAsVec3(val.enum.value);
  if ("array" in val) return valueAsVec3(val.array[0]);
  if ("list" in val) return valueAsVec3(val.list[0]);
  if ("tuple" in val) return valueAsVec3(val.tuple[0]);
  if ("float" in val) return [val.float, val.float, val.float];
  if ("bool" in val) return val.bool ? [1, 1, 1] : [0, 0, 0];
  return undefined;
}

export function valueAsVector(
  v?: PortSnapshot | ValueJSON | null,
): number[] | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("vector" in val) return val.vector.slice();
  if ("vec3" in val) return [val.vec3[0], val.vec3[1], val.vec3[2]];
  if ("vec4" in val)
    return [val.vec4[0], val.vec4[1], val.vec4[2], val.vec4[3]];
  if ("quat" in val)
    return [val.quat[0], val.quat[1], val.quat[2], val.quat[3]];
  if ("color" in val)
    return [val.color[0], val.color[1], val.color[2], val.color[3]];
  if ("transform" in val) {
    const pos = val.transform.pos ?? [0, 0, 0];
    const rot = val.transform.rot ?? [0, 0, 0, 1];
    const scale = val.transform.scale ?? [1, 1, 1];
    return [...pos, ...rot, ...scale];
  }
  if ("enum" in val) return valueAsVector(val.enum.value);
  if ("array" in val)
    return val.array.flatMap((entry: any) => valueAsVector(entry) ?? []);
  if ("list" in val)
    return val.list.flatMap((entry: any) => valueAsVector(entry) ?? []);
  if ("tuple" in val)
    return val.tuple.flatMap((entry: any) => valueAsVector(entry) ?? []);
  if ("float" in val) return [val.float];
  if ("bool" in val) return val.bool ? [1] : [0];
  return undefined;
}

export function valueAsBool(
  v?: PortSnapshot | ValueJSON | null,
): boolean | undefined {
  const val = extractValueJSON(v);
  if (!val) return undefined;
  if ("bool" in val) return val.bool;
  if ("float" in val) return val.float !== 0;
  if ("text" in val) return val.text.length > 0;
  if ("vector" in val) return val.vector.some((x: any) => x !== 0);
  if ("vec3" in val) return val.vec3.some((x: any) => x !== 0);
  if ("vec4" in val) return val.vec4.some((x: any) => x !== 0);
  if ("quat" in val) return val.quat.some((x: any) => x !== 0);
  if ("color" in val) return val.color.some((x: any) => x !== 0);
  if ("transform" in val)
    return (
      (val.transform.pos ?? []).some((x: any) => x !== 0) ||
      (val.transform.rot ?? []).some((x: any) => x !== 0) ||
      (val.transform.scale ?? []).some((x: any) => x !== 0)
    );
  if ("enum" in val) return valueAsBool(val.enum.value) ?? false;
  if ("record" in val)
    return Object.values(val.record).some((entry) => valueAsBool(entry));
  if ("array" in val) return val.array.some((entry: any) => valueAsBool(entry));
  if ("list" in val) return val.list.some((entry: any) => valueAsBool(entry));
  if ("tuple" in val) return val.tuple.some((entry: any) => valueAsBool(entry));
  return undefined;
}

function extractValueJSON(
  v?: PortSnapshot | ValueJSON | null,
): ValueJSON | undefined {
  if (!v) return undefined;
  if (typeof v === "object" && v !== null && "value" in v && "shape" in v) {
    return (v as PortSnapshot).value;
  }
  if (typeof v === "object" && v !== null) {
    return v as ValueJSON;
  }
  return undefined;
}
