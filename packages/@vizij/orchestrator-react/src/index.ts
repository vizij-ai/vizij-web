import {
  listOrchestrationFixtures,
  loadOrchestrationBundle,
  loadOrchestrationDescriptor,
  loadOrchestrationJson,
} from "@vizij/orchestrator-wasm";

export { OrchestratorProvider } from "./OrchestratorProvider";
export type { OrchestratorProviderProps } from "./OrchestratorProvider";

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
  PrebindResolver,
  CreateOrchOptions,
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
