/**
 * Shared type definitions for the orchestrator React integration.
 * These mirror the public wasm surface while layering on React-specific details.
 */

import type {
  AnimationRegistrationConfig as WasmAnimationRegistrationConfig,
  AnimationSetup as WasmAnimationSetup,
  ConflictLog,
  GraphRegistrationInput as WasmGraphRegistrationInput,
  GraphRegistrationConfig as WasmGraphRegistrationConfig,
  GraphSubscriptions as WasmGraphSubscriptions,
  MergedGraphRegistrationConfig as WasmMergedGraphRegistrationConfig,
  MergeStrategyOptions as WasmMergeStrategyOptions,
  MergeConflictStrategy as WasmMergeConflictStrategy,
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
  version?: number;
};

export type OrchestratorConflict = ConflictLog;

export type AroraWebModuleExports = {
  default?: (input?: unknown) => Promise<unknown> | unknown;
  init?: (input?: unknown) => Promise<unknown> | unknown;
  Engine: new () => {
    loadModule?: (headerJson: string, executable: Uint8Array) => string;
    load_module?: (headerJson: string, executable: Uint8Array) => string;
    call: (callJson: string) => string;
  };
};

export type AroraWebOrchestratorModule = "compatibility" | "composed";
export type AroraWebPreloadModuleName = "vizij-animation" | "vizij-node-graph";
export type AroraWebModuleArtifact = {
  preset?: AroraWebPreloadModuleName;
  headerJson?: string | object;
  headerUrl?: string | URL;
  wasmBytes?: Uint8Array | ArrayBuffer;
  wasmUrl?: string | URL;
};
export type AroraWebPreloadModule =
  | AroraWebPreloadModuleName
  | AroraWebModuleArtifact;
export type AroraWebModuleRegistry = Record<string, AroraWebPreloadModule>;
export type AroraWebModuleRegistryManifest = {
  schemaVersion?: number;
  version?: number;
  baseUrl?: string | URL;
  engine?: {
    js?: string | URL;
    wasm?: string | URL;
  };
  orchestrators?: Partial<Record<AroraWebOrchestratorModule, string>> &
    Record<string, string | undefined>;
  modules?:
    | Record<string, AroraWebModuleArtifact & { id?: string; name?: string }>
    | Array<AroraWebModuleArtifact & { id: string; name?: string }>;
};

export type AroraWebInitInput = {
  aroraWeb?: AroraWebModuleExports | (() => Promise<AroraWebModuleExports>);
  aroraWebUrl?: string;
  aroraWebInitInput?: unknown;
  orchestratorModule?: AroraWebOrchestratorModule;
  moduleRegistry?: AroraWebModuleRegistry;
  moduleRegistryUrl?: string | URL | false;
  preloadModules?: AroraWebPreloadModule[];
  headerJson?: string | object;
  headerUrl?: string | URL;
  wasmBytes?: Uint8Array | ArrayBuffer;
  wasmUrl?: string | URL;
  dispatchFunctionId?: string;
  requestParamId?: string;
  fetch?: typeof fetch;
};

export type InitInput = WasmInitInput | { url?: string } | AroraWebInitInput;

export type PrebindResolver = (
  path: string,
) => string | number | null | undefined;

export type CreateOrchOptions = {
  schedule?: "SinglePass" | "TwoPass" | "RateDecoupled";
};

export type OrchestratorBackend = "direct" | "moduleFacade" | "aroraWeb";

export type ControllerId = string;

export type AroraWebDebugModuleInfo = {
  id: string | null;
  name: string | null;
  wasmUrl: string | null;
  engineModuleId: string | null;
};

export type AroraWebModuleGraphDebugInfo = {
  orchestratorModule: AroraWebOrchestratorModule;
  moduleRegistryUrl: string | null;
  manifestUrl: string | null;
  selectedModule: AroraWebDebugModuleInfo;
  preloadedModules: AroraWebDebugModuleInfo[];
};

export type OrchestratorDebugInfo = {
  aroraWebInstanceId?: string | null;
  aroraWebModuleGraph?: AroraWebModuleGraphDebugInfo | null;
};

export type GraphRegistrationInput = WasmGraphRegistrationInput;
export type GraphRegistrationConfig = WasmGraphRegistrationConfig;
export type GraphSubscriptions = WasmGraphSubscriptions;

/**
 * Extended merge conflict strategies recognised by the wasm bridge.
 * Older builds only exposed "error" | "namespace" | "blend", so we
 * widen the union with the newer additive and weighted blend aliases.
 */
export type MergeConflictStrategy =
  | WasmMergeConflictStrategy
  | "blend_equal"
  | "blend_equal_weights"
  | "add"
  | "sum"
  | "blend-sum"
  | "additive"
  | "default-blend"
  | "blend-default"
  | "blend-weights"
  | "weights";

export type MergeStrategyOptions = Omit<
  WasmMergeStrategyOptions,
  "outputs" | "intermediate"
> & {
  outputs?: MergeConflictStrategy;
  intermediate?: MergeConflictStrategy;
};

export type MergedGraphRegistrationConfig = Omit<
  WasmMergedGraphRegistrationConfig,
  "strategy"
> & {
  strategy?: MergeStrategyOptions;
};

export type AnimationSetup = Omit<WasmAnimationSetup, "player" | "instance"> & {
  player?: NonNullable<WasmAnimationSetup["player"]> & {
    loopMode?: "once" | "loop" | "pingpong";
  };
  instance?: NonNullable<WasmAnimationSetup["instance"]> & {
    timeScale?: number;
    timescale?: number;
    startOffset?: number;
    offset?: number;
    active?: boolean;
  };
};
export type AnimationRegistrationConfig = Omit<
  WasmAnimationRegistrationConfig,
  "setup"
> & {
  setup?: AnimationSetup;
};

export type OrchestratorReactCtx = {
  backend: OrchestratorBackend;
  ready: boolean;
  createOrchestrator: (opts?: CreateOrchOptions) => Promise<void>;
  registerGraph: (cfg: GraphRegistrationInput) => ControllerId;
  registerMergedGraph: (cfg: MergedGraphRegistrationConfig) => ControllerId;
  registerAnimation: (cfg: AnimationRegistrationConfig) => ControllerId;
  prebind: (resolver: PrebindResolver) => void;
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
  normalizeGraphSpec?: (spec: object | string) => Promise<object>;
  abiVersion?: () => Promise<number>;
  getDebugInfo?: () => OrchestratorDebugInfo | null;
};

export type OrchestratorRuntimeLike = {
  registerGraph: (cfg: GraphRegistrationInput) => ControllerId;
  registerMergedGraph: (cfg: MergedGraphRegistrationConfig) => ControllerId;
  registerAnimation: (cfg: AnimationRegistrationConfig) => ControllerId;
  prebind: (resolver: PrebindResolver) => void;
  setInput: (path: string, value: ValueJSON, shape?: ShapeJSON) => void;
  removeInput: (path: string) => boolean;
  step: (dt: number) => OrchestratorFrame;
  listControllers: () => { graphs: ControllerId[]; anims: ControllerId[] };
  removeGraph: (id: ControllerId) => boolean;
  removeAnimation: (id: ControllerId) => boolean;
  normalizeGraphSpec?: (spec: object | string) => Promise<object>;
  facadeVersion?: () => number;
  getDebugInfo?: () => OrchestratorDebugInfo | null;
};
