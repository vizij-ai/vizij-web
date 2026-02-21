import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRuntimePrewarmForTests, prewarmVizijRuntime } from "../prewarm";

const initOrchestratorWasmSpy = vi.fn<(input?: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);

vi.mock("@vizij/orchestrator-react", () => ({
  initOrchestratorWasm: (input?: unknown) => initOrchestratorWasmSpy(input),
}));

describe("prewarmVizijRuntime", () => {
  beforeEach(() => {
    initOrchestratorWasmSpy.mockClear();
    __resetRuntimePrewarmForTests();
  });

  it("deduplicates repeated warmup calls", async () => {
    const first = prewarmVizijRuntime();
    const second = prewarmVizijRuntime();

    expect(first).toBe(second);

    await second;
    expect(initOrchestratorWasmSpy).toHaveBeenCalledTimes(1);
  });

  it("forwards initInput on first warmup call", async () => {
    const initInput = { url: "/assets/orchestrator.wasm" };

    await prewarmVizijRuntime({ initInput });

    expect(initOrchestratorWasmSpy).toHaveBeenCalledWith(initInput);
  });
});
