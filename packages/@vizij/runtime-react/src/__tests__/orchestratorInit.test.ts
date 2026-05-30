import { describe, expect, it } from "vitest";
import type { InitInput } from "@vizij/orchestrator-react";
import { resolveVizijOrchestratorInitInput } from "../orchestratorInit";

describe("resolveVizijOrchestratorInitInput", () => {
  it("defaults aroraWeb runtimes to the composed Vizij module path", () => {
    expect(resolveVizijOrchestratorInitInput("aroraWeb")).toEqual({
      orchestratorModule: "composed",
      moduleRegistryUrl: "/arora-web/modules/manifest.json",
    });
  });

  it("preserves caller supplied aroraWeb init options while applying composed defaults", () => {
    const fetch = (() =>
      Promise.resolve(new Response())) as typeof globalThis.fetch;
    const wasmBytes = new Uint8Array([1, 2, 3]);

    expect(
      resolveVizijOrchestratorInitInput("aroraWeb", {
        aroraWebUrl: "/custom/arora_web.js",
        fetch,
        wasmBytes,
      }),
    ).toEqual({
      orchestratorModule: "composed",
      moduleRegistryUrl: "/arora-web/modules/manifest.json",
      aroraWebUrl: "/custom/arora_web.js",
      fetch,
      wasmBytes,
    });
  });

  it("keeps explicit compatibility mode as the opt-in fallback path", () => {
    expect(
      resolveVizijOrchestratorInitInput("aroraWeb", {
        orchestratorModule: "compatibility",
      }),
    ).toEqual({
      orchestratorModule: "compatibility",
      moduleRegistryUrl: "/arora-web/modules/manifest.json",
    });
  });

  it("preserves explicit preload module overrides for composed aroraWeb runtimes", () => {
    expect(
      resolveVizijOrchestratorInitInput("aroraWeb", {
        preloadModules: [],
      }),
    ).toEqual({
      orchestratorModule: "composed",
      moduleRegistryUrl: "/arora-web/modules/manifest.json",
      preloadModules: [],
    });
  });

  it("does not reinterpret non-plain wasm init inputs as aroraWeb config", () => {
    const url = new URL("https://example.test/vizij_orchestrator_bg.wasm");
    const bytes = new Uint8Array([1, 2, 3]);
    const buffer = new ArrayBuffer(3);

    expect(resolveVizijOrchestratorInitInput("aroraWeb", url)).toBe(url);
    expect(resolveVizijOrchestratorInitInput("aroraWeb", bytes)).toBe(bytes);
    expect(
      resolveVizijOrchestratorInitInput("aroraWeb", buffer as InitInput),
    ).toBe(buffer);
  });

  it("does not rewrite init input for non-aroraWeb backends", () => {
    const initInput = { url: "/vizij_orchestrator_bg.wasm" };

    expect(resolveVizijOrchestratorInitInput("direct", initInput)).toBe(
      initInput,
    );
    expect(resolveVizijOrchestratorInitInput("moduleFacade", initInput)).toBe(
      initInput,
    );
    expect(resolveVizijOrchestratorInitInput(undefined, initInput)).toBe(
      initInput,
    );
  });
});
