import {
  listOrchestrationFixtures,
  loadOrchestrationBundle,
  loadOrchestrationDescriptor,
  loadOrchestrationJson,
} from "@vizij/orchestrator-wasm";

export { OrchestratorProvider } from "./OrchestratorProvider";
export type { OrchestratorProviderProps } from "./OrchestratorProvider";
export { OrchestratorContext } from "./context";
export { AroraWebOrchestratorRuntime } from "./aroraWeb";
export { resolveVizijOrchestratorInitInput } from "./aroraWebInit";
export {
  DEFAULT_ARORA_WEB_MODULE_REGISTRY,
  DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
  DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE,
  DEFAULT_ARORA_WEB_URL,
  DEFAULT_ARORA_WEB_WASM_URL,
  VIZIJ_ARORA_WEB_MODULE_ARTIFACTS,
  VIZIJ_ARORA_WEB_MODULE_IDS,
  VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS,
  VIZIJ_ARORA_WEB_ORCHESTRATOR_MODULE_PRESETS,
  VIZIJ_ARORA_WEB_PRELOAD_MODULE_PRESETS,
  resolveVizijAroraWebModuleGraph,
  resolveVizijAroraWebRequiredAssetPaths,
  type VizijAroraWebIndependentModule,
  type VizijAroraWebModuleKey,
  type VizijAroraWebModuleGraph,
} from "./aroraWebModules";
export { ModuleFacadeOrchestratorRuntime } from "./moduleFacade";
export type { ModuleFacadeRequest, ModuleFacadeResponse } from "./moduleFacade";

export { useOrchestrator, useOrchTarget, useOrchFrame } from "./hooks";

export { valueAsNumber, valueAsVec3, valueAsBool } from "./valueHelpers";
export type {
  ValueJSON,
  ShapeJSON,
  WriteOp,
  OrchestratorTimings,
  OrchestratorFrame,
  OrchestratorConflict,
  InitInput,
  AroraWebInitInput,
  AroraWebModuleArtifact,
  AroraWebDebugModuleInfo,
  AroraWebModuleExports,
  AroraWebModuleGraphDebugInfo,
  AroraWebModuleRegistry,
  AroraWebModuleRegistryManifest,
  AroraWebPreloadModule,
  AroraWebPreloadModuleName,
  PrebindResolver,
  CreateOrchOptions,
  OrchestratorBackend,
  OrchestratorRuntimeLike,
  ControllerId,
  GraphRegistrationInput,
  GraphRegistrationConfig,
  GraphSubscriptions,
  MergedGraphRegistrationConfig,
  MergeStrategyOptions,
  MergeConflictStrategy,
  AnimationRegistrationConfig,
  AnimationSetup,
  OrchestratorReactCtx,
} from "./types";

export {
  init as initOrchestratorWasm,
  createOrchestrator as createOrchestratorRuntime,
  Orchestrator as OrchestratorRuntime,
} from "@vizij/orchestrator-wasm";
export {
  listOrchestrationFixtures,
  loadOrchestrationBundle,
  loadOrchestrationDescriptor,
  loadOrchestrationJson,
};
export type {
  OrchestratorFrame as WasmOrchestratorFrame,
  Value as WasmValue,
  Shape as WasmShape,
  ConflictLog as WasmConflictLog,
  GraphRegistrationInput as WasmGraphRegistration,
  GraphRegistrationConfig as WasmGraphRegistrationConfig,
  GraphSubscriptions as WasmGraphSubscriptions,
  MergedGraphRegistrationConfig as WasmMergedGraphRegistrationConfig,
  MergeStrategyOptions as WasmMergeStrategyOptions,
  MergeConflictStrategy as WasmMergeConflictStrategy,
  AnimationRegistrationConfig as WasmAnimationRegistration,
  AnimationSetup as WasmAnimationSetup,
} from "@vizij/orchestrator-wasm";

/**
 * Standardised access to embedded orchestration samples for quick-start demos and tests.
 */
export const samples = {
  list: listOrchestrationFixtures,
  load: loadOrchestrationDescriptor,
  loadJson: loadOrchestrationJson,
  loadBundle: loadOrchestrationBundle,
} as const;
