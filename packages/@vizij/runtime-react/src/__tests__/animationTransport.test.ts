import { describe, expect, it } from "vitest";
import {
  resolveAnimationTransportMode,
  resolveProviderAnimationBackend,
} from "../utils/animationTransport";

describe("animationTransport", () => {
  it("uses orchestrator playback for Arora web runtimes in auto mode", () => {
    expect(resolveAnimationTransportMode("auto", "aroraWeb")).toBe(
      "orchestrator",
    );
    expect(resolveAnimationTransportMode(undefined, "aroraWeb")).toBe(
      "orchestrator",
    );
    expect(resolveAnimationTransportMode("auto", "moduleFacade")).toBe("host");
  });

  it("resolves auto transport from a shared parent Arora backend", () => {
    const backend = resolveProviderAnimationBackend({
      providerBackend: undefined,
      parentBackend: "aroraWeb",
      providesOrchestrator: false,
    });

    expect(backend).toBe("aroraWeb");
    expect(resolveAnimationTransportMode("auto", backend)).toBe("orchestrator");
  });

  it("uses the owned provider backend instead of a parent fallback", () => {
    expect(
      resolveProviderAnimationBackend({
        providerBackend: undefined,
        parentBackend: "aroraWeb",
        providesOrchestrator: true,
      }),
    ).toBeUndefined();
  });
});
