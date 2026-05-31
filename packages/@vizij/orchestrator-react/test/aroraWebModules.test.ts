import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARORA_WEB_MODULE_REGISTRY,
  DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
  DEFAULT_ARORA_WEB_URL,
  DEFAULT_ARORA_WEB_WASM_URL,
  DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE,
  VIZIJ_ARORA_WEB_MODULE_ARTIFACTS,
  VIZIJ_ARORA_WEB_MODULE_IDS,
  VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS,
  VIZIJ_ARORA_WEB_ORCHESTRATOR_MODULE_PRESETS,
  VIZIJ_ARORA_WEB_PRELOAD_MODULE_PRESETS,
  resolveVizijAroraWebModuleGraph,
  resolveVizijAroraWebRequiredAssetPaths,
} from "../src";

describe("Vizij Arora web module graph", () => {
  it("names the composed orchestrator as the default module target", () => {
    expect(DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE).toBe("composed");
    expect(resolveVizijAroraWebModuleGraph().orchestrator).toEqual({
      id: VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorComposed,
      registryKey: VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS.composed,
    });
  });

  it("declares animation and node graph as independent composed imports", () => {
    expect(resolveVizijAroraWebModuleGraph("composed").imports).toEqual([
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
    ]);
  });

  it("keeps the compatibility orchestrator as a monolithic fallback", () => {
    expect(resolveVizijAroraWebModuleGraph("compatibility")).toEqual({
      orchestratorModule: "compatibility",
      orchestrator: {
        id: VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorCompatibility,
        registryKey: VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS.compatibility,
      },
      imports: [],
    });
  });

  it("keeps default module artifacts next to the public module graph", () => {
    expect(VIZIJ_ARORA_WEB_ORCHESTRATOR_MODULE_PRESETS).toEqual({
      compatibility: VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator"],
      composed: VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator-composed"],
    });
    expect(VIZIJ_ARORA_WEB_PRELOAD_MODULE_PRESETS).toEqual({
      "vizij-animation": VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-animation"],
      "vizij-node-graph": VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-node-graph"],
    });
    expect(DEFAULT_ARORA_WEB_MODULE_REGISTRY).toMatchObject({
      [VIZIJ_ARORA_WEB_MODULE_IDS.orchestratorComposed]:
        VIZIJ_ARORA_WEB_MODULE_ARTIFACTS["vizij-orchestrator-composed"],
      [VIZIJ_ARORA_WEB_MODULE_IDS.animation]: "vizij-animation",
      [VIZIJ_ARORA_WEB_MODULE_IDS.nodeGraph]: "vizij-node-graph",
      "vizij-animation": "vizij-animation",
      "vizij-node-graph": "vizij-node-graph",
    });
  });

  it("lists required browser assets for composed and compatibility module bundles", () => {
    expect(resolveVizijAroraWebRequiredAssetPaths()).toEqual([
      DEFAULT_ARORA_WEB_URL,
      DEFAULT_ARORA_WEB_WASM_URL,
      DEFAULT_ARORA_WEB_MODULE_REGISTRY_URL,
      "/arora-web/modules/vizij-animation/module.json",
      "/arora-web/modules/vizij-animation/vizij_animation.wasm",
      "/arora-web/modules/vizij-node-graph/module.json",
      "/arora-web/modules/vizij-node-graph/vizij_node_graph.wasm",
      "/arora-web/modules/vizij-orchestrator-composed/module.json",
      "/arora-web/modules/vizij-orchestrator-composed/arora_vizij_orchestrator_composed.wasm",
    ]);

    expect(
      resolveVizijAroraWebRequiredAssetPaths({ includeCompatibility: true }),
    ).toContain(
      "/arora-web/modules/vizij-orchestrator/arora_vizij_orchestrator.wasm",
    );
  });
});
