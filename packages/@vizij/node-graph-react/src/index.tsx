import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { init,
  Graph,
  type GraphSpec,
  type ValueJSON,
  type Value,
} from "@vizij/node-graph-wasm";

type Outputs = Record<string, Record<string, ValueJSON>> | null;

type Ctx = {
  ready: boolean;
  outputs: Outputs;

  /** Update a node parameter (e.g., "value", "frequency", "phase", "min", "max", "x", "y", "z") */
  setParam: (nodeId: string, key: string, value: Value) => void;

  /** Replace/reload the graph spec at runtime */
  reload: (spec: GraphSpec | string) => void;

  /** Set absolute time (seconds) for deterministic scrubbing or syncing */
  setTime: (t: number) => void;
};

const NodeGraphCtx = createContext<Ctx | null>(null);

export const NodeGraphProvider: React.FC<{
  children: React.ReactNode;
  /** Graph spec (object or pre-serialized JSON) loaded on mount and when identity changes */
  spec: GraphSpec | string;
  /** Start an internal RAF loop that advances time with `step(dt)` and calls `evalAll()` each frame */
  autostart?: boolean;
}> = ({ children, spec, autostart = true }) => {
  const graphRef = useRef<Graph | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);
  const specRef = useRef<GraphSpec | string | null>(null);

  const [ready, setReady] = useState(false);
  const [outputs, setOutputs] = useState<Outputs>(null);

  // init + construct + load spec + optional RAF loop
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await init();

      const g = new Graph();
      graphRef.current = g;
      g.loadGraph(spec);
      specRef.current = spec;

      setReady(true);

      if (!autostart) return;

      const loop = (t: number) => {
        if (cancelled) return;

        const last = lastRef.current || t;
        const dt = (t - last) / 1000; // seconds
        lastRef.current = t;

        g.step(dt);
        const out = g.evalAll();
        setOutputs(out);

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
  }, [autostart]);

  // Reload graph if `spec` identity changes (keeps the same Graph instance)
  useEffect(() => {
    if (!ready || !graphRef.current) return;
    if (specRef.current === spec) return;
    graphRef.current.loadGraph(spec);
    specRef.current = spec;
    // after reload, produce fresh outputs immediately (esp. if autostart=false)
    const out = graphRef.current.evalAll();
    setOutputs(out);
  }, [spec, ready]);

  // Context API
  const setParam = (nodeId: string, key: string, value: Value) => {
    graphRef.current?.setParam(nodeId, key, value);
    // Optional: re-evaluate immediately to reflect param changes without waiting for next frame
    if (graphRef.current) setOutputs(graphRef.current.evalAll());
  };

  const reload = (newSpec: GraphSpec | string) => {
    graphRef.current?.loadGraph(newSpec);
    specRef.current = newSpec;
    if (graphRef.current) setOutputs(graphRef.current.evalAll());
  };

  const setTime = (t: number) => {
    graphRef.current?.setTime(t);
    if (graphRef.current) setOutputs(graphRef.current.evalAll());
  };

  return (
    <NodeGraphCtx.Provider
      value={{ ready, outputs, setParam, reload, setTime }}
    >
      {/* <NodeGraphProvider spec={spec} autostart={false}> */}
        {children}
      {/* </NodeGraphProvider> */}
    </NodeGraphCtx.Provider>
  );
};

export const useNodeGraph = () => {
  const ctx = useContext(NodeGraphCtx);
  if (!ctx) throw new Error("useNodeGraph must be used within NodeGraphProvider");
  return ctx;
};

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
