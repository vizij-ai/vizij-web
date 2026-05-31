import type {
  AroraWebInitInput,
  InitInput,
  OrchestratorBackend,
} from "./types";
import { DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL } from "./aroraWebModules";

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
      moduleRegistryUrl: DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
    };
  }

  if (!isMergeableInitInput(initInput)) {
    return initInput;
  }

  const resolved: MergeableInitInput = {
    orchestratorModule: "composed",
    moduleRegistryUrl: DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
    ...initInput,
  };
  return resolved;
}
