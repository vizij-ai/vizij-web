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
