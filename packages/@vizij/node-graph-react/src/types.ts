/**
 * Shared types for @vizij/node-graph-react
 * These bridge to @vizij/node-graph-wasm type exports and add local runtime types.
 */

import type {
  Graph as WasmGraph,
  GraphSpec,
  EvalResult,
  ValueJSON,
  ShapeJSON,
  WriteOpJSON,
  PortSnapshot,
  InitInput,
  Registry,
} from "@vizij/node-graph-wasm";

/* Playback types */
export type PlaybackMode = "manual" | "raf" | "interval" | "timecode";

export interface PlaybackConfig {
  mode?: PlaybackMode;
  tickMs?: number; // interval ms for "interval" mode (default ~16)
  updateHz?: number; // UI notify Hz (clamped 1..240)
}

/* Provider props (match GraphProvider implementation) */
export interface GraphProviderProps {
  children?: React.ReactNode;
  spec?: GraphSpec | string;
  autoStart?: boolean;
  autoMode?: PlaybackMode;
  wasmInitInput?: InitInput;
  updateHz?: number;
  stepStrategy?: {
    mode?: PlaybackMode;
    tickMs?: number;
  };
  /**
   * When true and a `spec` is provided, GraphProvider will await the completion
   * of runtime.loadGraph(spec) and the application of any initialParams /
   * initialInputs before starting the provider evaluation loop.
   *
   * Default: true
   */
  waitForGraph?: boolean;

  /**
   * Timeout in milliseconds to wait for graph load. Set to null to disable timeout.
   * Default: 60000
   */
  graphLoadTimeoutMs?: number | null;

  /**
   * Declarative initial parameters to apply after graph load completes.
   * Shape: { [nodeId]: { [paramKey]: ValueJSON } }
   */
  initialParams?: Record<string, Record<string, ValueJSON>>;

  /**
   * Declarative initial inputs to stage after graph load completes.
   * Shape: { [inputPath]: ValueJSON }
   */
  initialInputs?: Record<string, ValueJSON>;

  /**
   * If true (default) attach waitForGraphReady() and event helpers to runtime.
   * If false, provider will not expose the readiness promise on runtime.
   */
  exposeGraphReadyPromise?: boolean;
}

/* Store snapshot shape used internally by the provider/store */
export interface StoreSnapshot {
  evalResult: EvalResult | null;
  version: number;
}

/* Eval store snapshot (projected shape for selectors) */
export interface EvalStoreSnapshot {
  nodes: Record<string, Record<string, PortSnapshot>>;
  writes: WriteOpJSON[];
  version: number;
  raw?: EvalResult | null;
}

/* Runtime context value exposed by provider */
export interface GraphRuntimeContextValue {
  ready: boolean;
  status?: "idle" | "loading" | "ready" | "error";
  graph: WasmGraph | null;
  /**
   * Readiness fields:
   * - graphLoaded: true once the graph is constructed and any initialParams/initialInputs applied
   * - waitForGraphReady: resolves when graphLoaded is true (if exposed)
   * - on/off: event subscription helpers for 'graphLoaded' | 'graphLoadError' (if exposed)
   */
  graphLoaded: boolean;
  waitForGraphReady?: () => Promise<void>;
  on?: (
    event: "graphLoaded" | "graphLoadError",
    cb: (info?: any) => void,
  ) => void;
  off?: (
    event: "graphLoaded" | "graphLoadError",
    cb: (info?: any) => void,
  ) => void;

  loadGraph: (spec: GraphSpec | string) => Promise<WasmGraph | null>;
  unloadGraph: () => void;
  setTime: (t: number) => void;
  step: (dt: number) => void;
  setParam: (nodeId: string, key: string, value: any) => void;
  stageInput: (
    path: string,
    value: any,
    shape?: ShapeJSON,
    immediateEval?: boolean,
  ) => void;
  applyStagedInputs: () => void;
  clearStagedInputs?: () => void;
  evalAll: () => EvalResult | null;
  getLastDt: () => number;
  /**
   * Return the internal store snapshot (the provider's store shape).
   * Selectors/hooks should operate on the derived EvalStoreSnapshot when needed.
   */
  getSnapshot: () => StoreSnapshot;
  subscribe: (listener: () => void) => () => void;
  getVersion: () => number;
  startPlayback: (mode?: PlaybackMode, hz?: number) => void;
  stopPlayback: () => void;
  getPlaybackMode: () => PlaybackMode;
  getWrites: () => WriteOpJSON[];
  clearWrites: () => void;
}

/* Selector helper type */
export type Selector<T> = (snapshot: EvalStoreSnapshot) => T;
