import type {
  AroraWebOrchestratorModule,
  AroraWebPreloadModuleName,
} from "./types";

export const VIZIJ_ARORA_WEB_MODULE_IDS = {
  orchestratorCompatibility: "144358c2-b7e0-414d-8755-56d7ac03f811",
  orchestratorComposed: "580d9cef-88be-4f1c-b649-f87032acd8fe",
  animation: "aa32e080-b002-428c-9994-6143aab3bf08",
  nodeGraph: "098bd478-8375-4f3a-b649-d64cb1284944",
} as const;

export const VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS: Record<
  AroraWebOrchestratorModule,
  string
> = {
  compatibility: "vizij-orchestrator",
  composed: "vizij-orchestrator-composed",
};

export const DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE: AroraWebOrchestratorModule =
  "composed";

export type VizijAroraWebIndependentModule = {
  name: AroraWebPreloadModuleName;
  id: string;
  registryKey: AroraWebPreloadModuleName;
};

export type VizijAroraWebModuleGraph = {
  orchestratorModule: AroraWebOrchestratorModule;
  orchestrator: {
    id: string;
    registryKey: string;
  };
  imports: VizijAroraWebIndependentModule[];
};

const VIZIJ_ARORA_WEB_INDEPENDENT_MODULES = [
  {
    name: "vizij-animation",
    id: VIZIJ_ARORA_WEB_MODULE_IDS.animation,
    registryKey: "vizij-animation",
  },
  {
    name: "vizij-node-graph",
    id: VIZIJ_ARORA_WEB_MODULE_IDS.nodeGraph,
    registryKey: "vizij-node-graph",
  },
] as const satisfies readonly VizijAroraWebIndependentModule[];

export function resolveVizijAroraWebModuleGraph(
  orchestratorModule: AroraWebOrchestratorModule = DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE,
): VizijAroraWebModuleGraph {
  if (orchestratorModule === "compatibility") {
    return {
      orchestratorModule,
      orchestrator: {
        id: VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorCompatibility,
        registryKey: VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS.compatibility,
      },
      imports: [],
    };
  }

  return {
    orchestratorModule,
    orchestrator: {
      id: VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorComposed,
      registryKey: VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS.composed,
    },
    imports: VIZIJ_ARORA_WEB_INDEPENDENT_MODULES.map((entry) => ({
      ...entry,
    })),
  };
}
