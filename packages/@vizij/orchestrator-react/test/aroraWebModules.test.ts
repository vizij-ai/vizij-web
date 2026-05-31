import { describe, expect, it } from "vitest";
import {
  DEFAULT_ARORA_WEB_ORCHESTRATOR_MODULE,
  VIZIJ_ARORA_WEB_MODULE_IDS,
  VIZIJ_ARORA_WEB_MODULE_REGISTRY_KEYS,
  resolveVizijAroraWebModuleGraph,
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
});
