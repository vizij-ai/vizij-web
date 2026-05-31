import type {
  AroraWebModuleArtifact,
  AroraWebModuleRegistry,
  AroraWebOrchestratorModule,
  AroraWebPreloadModuleName,
} from "./types";

export const DEFAULT_ARORA_WEB_URL = "/arora-web/pkg/arora_web.js";
export const DEFAULT_ARORA_WEB_WASM_URL = "/arora-web/pkg/arora_web_bg.wasm";
export const DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL =
  "/arora-web/modules/manifest.json";

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

export type VizijAroraWebModuleKey =
  | "vizij-orchestrator"
  | "vizij-orchestrator-composed"
  | AroraWebPreloadModuleName;

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

export const VIZIJ_ARORA_WEB_MODULE_ARTIFACTS = {
  "vizij-orchestrator": {
    headerUrl: "/arora-web/modules/vizij-orchestrator/module.json",
    wasmUrl:
      "/arora-web/modules/vizij-orchestrator/arora_vizij_orchestrator.wasm",
  },
  "vizij-orchestrator-composed": {
    headerUrl: "/arora-web/modules/vizij-orchestrator-composed/module.json",
    wasmUrl:
      "/arora-web/modules/vizij-orchestrator-composed/arora_vizij_orchestrator_composed.wasm",
  },
  "vizij-animation": {
    headerUrl: "/arora-web/modules/vizij-animation/module.json",
    wasmUrl: "/arora-web/modules/vizij-animation/vizij_animation.wasm",
  },
  "vizij-node-graph": {
    headerUrl: "/arora-web/modules/vizij-node-graph/module.json",
    wasmUrl: "/arora-web/modules/vizij-node-graph/vizij_node_graph.wasm",
  },
} as const satisfies Record<VizijAroraWebModuleKey, AroraWebModuleArtifact>;

export const VIZIJ_ARORA_WEB_ORCHESTRATOR_MODULE_PRESETS: Record<
  AroraWebOrchestratorModule,
  AroraWebModuleArtifact
> = {
  compatibility: VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator"],
  composed: VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator-composed"],
};

export const VIZIJ_ARORA_WEB_PRELOAD_MODULE_PRESETS: Record<
  AroraWebPreloadModuleName,
  AroraWebModuleArtifact
> = {
  "vizij-animation": VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-animation"],
  "vizij-node-graph": VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-node-graph"],
};

export const DEFAULT_ARORA_WEB_MODULE_REGISTRY: AroraWebModuleRegistry = {
  [VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorCompatibility]:
    VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator"],
  "vizij-orchestrator": VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator"],
  [VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorComposed]:
    VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator-composed"],
  "vizij-orchestrator-composed":
    VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator-composed"],
  [VIZIJ_ARORA_WEB_MODULE_IDS.animation]: "vizij-animation",
  "vizij-animation": "vizij-animation",
  [VIZIJ_ARORA_WEB_MODULE_IDS.nodeGraph]: "vizij-node-graph",
  "vizij-node-graph": "vizij-node-graph",
};

export function resolveVizijAroraWebRequiredAssetPaths(options?: {
  includeCompatibility?: boolean;
}): string[] {
  const moduleKeys: VizijAroraWebModuleKey[] = [
    ...(options?.includeCompatibility ? ["vizij-orchestrator" as const] : []),
    "vizij-animation",
    "vizij-node-graph",
    "vizij-orchestrator-composed",
  ];
  return [
    DEFAULT_ARORA_WEB_URL,
    DEFAULT_ARORA_WEB_WASM_URL,
    DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
    ...moduleKeys.flatMap((key) => {
      const artifact = VIZIJ_ARORA_WEB_MODULE_ARTIFACTS[key];
      return [String(artifact.headerUrl), String(artifact.wasmUrl)];
    }),
  ];
}

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
