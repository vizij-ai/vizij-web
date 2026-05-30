import type {
  AroraWebInitInput,
  InitInput,
  OrchestratorBackend,
} from "@vizij/orchestrator-react";

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
    };
  }

  if (!isMergeableInitInput(initInput)) {
    return initInput;
  }

  const resolved: MergeableInitInput = {
    orchestratorModule: "composed",
    ...initInput,
  };
  return resolved;
}
