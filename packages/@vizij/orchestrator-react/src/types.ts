/**
 * Shared type definitions for the orchestrator React integration.
 * These mirror the public wasm surface while layering on React-specific details.
 */

import type {
  AnimationRegistrationConfig as WasmAnimationRegistrationConfig,
  AnimationSetup as WasmAnimationSetup,
  ConflictLog,
  GraphRegistrationInput as WasmGraphRegistrationInput,
  GraphSubscriptions as WasmGraphSubscriptions,
  InitInput as WasmInitInput,
  OrchestratorFrame as WasmOrchestratorFrame,
  Shape as WasmShape,
  Value as WasmValue,
  WriteOpJSON,
} from "@vizij/orchestrator-wasm";

/** Values emitted by the orchestrator writes leverage the wasm union. */
export type ValueJSON = WasmValue;

/** Optional shape metadata describing the serialized value structure. */
export type ShapeJSON = WasmShape;

/** Individual write units emitted from the orchestrator frame merge. */
export type WriteOp = WriteOpJSON & {
  player?: number | string;
};

export type OrchestratorTimings = WasmOrchestratorFrame["timings_ms"] & {
  animations_ms?: number;
  graphs_ms?: number;
};

export type OrchestratorFrame = Omit<WasmOrchestratorFrame, "merged_writes"> & {
  merged_writes: WriteOp[];
};

export type OrchestratorConflict = ConflictLog;

export type InitInput = WasmInitInput | { url?: string };

export type PrebindResolver = (
  path: string,
) => string | number | null | undefined;

export type CreateOrchOptions = {
  schedule?: "SinglePass" | "TwoPass" | "RateDecoupled";
};

export type ControllerId = string;

export type GraphRegistrationInput = WasmGraphRegistrationInput;
export type GraphSubscriptions = WasmGraphSubscriptions;

export type AnimationRegistrationConfig = WasmAnimationRegistrationConfig;
export type AnimationSetup = WasmAnimationSetup;

export type OrchestratorReactCtx = {
  ready: boolean;
  createOrchestrator: (opts?: CreateOrchOptions) => Promise<void>;
  registerGraph: (cfg: GraphRegistrationInput) => ControllerId;
  registerAnimation: (cfg: AnimationRegistrationConfig) => ControllerId;
  prebind?: (resolver: PrebindResolver) => void;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
  removeInput: (path: string) => boolean;
  step: (dt: number) => OrchestratorFrame | null;
  listControllers: () => { graphs: ControllerId[]; anims: ControllerId[] };
  removeGraph: (id: ControllerId) => boolean;
  removeAnimation: (id: ControllerId) => boolean;
  getLatestFrame: () => OrchestratorFrame | null;
  subscribeToPath: (path: string, cb: () => void) => () => void;
  getPathSnapshot: (path: string) => ValueJSON | undefined;
  subscribeToFrame: (cb: () => void) => () => void;
  getFrameSnapshot: () => OrchestratorFrame | null;
};
