import type {
  AroraWebInitInput,
  InitInput,
  OrchestratorBackend,
} from "@vizij/orchestrator-react";

const DEFAULT_COMPOSED_PRELOAD_MODULES = [
  "vizij-animation",
  "vizij-node-graph",
] as const;

type MergeableInitInput = Record<string, unknown> & Partial<AroraWebInitInput>;

function isMergeableInitInput(input: InitInput): input is MergeableInitInput {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

export function resolveVizijOrchestratorInitInput(
  backend?: OrchestratorBackend,
  initInput?: InitInput,
): InitInput | undefined {
  if (backend !== "aroraWeb") {
    return initInput;
  }

  if (!initInput) {
    return {
      orchestratorModule: "composed",
      preloadModules: [...DEFAULT_COMPOSED_PRELOAD_MODULES],
    };
  }

  if (!isMergeableInitInput(initInput)) {
    return initInput;
  }

  const resolved: MergeableInitInput = {
    orchestratorModule: "composed",
    ...initInput,
  };
  if (
    "preloadModules" in resolved ||
    (resolved as { orchestratorModule?: unknown }).orchestratorModule ===
      "compatibility"
  ) {
    return resolved;
  }
  return {
    ...resolved,
    preloadModules: [...DEFAULT_COMPOSED_PRELOAD_MODULES],
  } as InitInput;
}
