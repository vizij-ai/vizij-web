import {
  initOrchestratorWasm,
  type InitInput,
} from "@vizij/orchestrator-react";

export interface VizijRuntimePrewarmOptions {
  initInput?: InitInput;
}

let prewarmPromise: Promise<void> | null = null;

/**
 * Pre-initializes runtime WASM dependencies before the first provider mount.
 * Safe to call multiple times; initialization is deduped per page session.
 */
export function prewarmVizijRuntime(
  options?: VizijRuntimePrewarmOptions,
): Promise<void> {
  if (!prewarmPromise) {
    prewarmPromise = initOrchestratorWasm(options?.initInput).then(
      () => undefined,
    );
  }
  return prewarmPromise;
}

export function __resetRuntimePrewarmForTests() {
  prewarmPromise = null;
}
