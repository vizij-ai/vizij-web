/* @vitest-environment jsdom */
import type { FC } from "react";
import { describe, it, expect, afterAll, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { init as initNodeGraphWasm } from "@vizij/node-graph-wasm";
import {
  GraphProvider,
  useGraphRuntime,
  samples,
  valueAsNumber,
} from "../index";
import { getNodeGraphWasmInitInput } from "./helpers";

describe("@vizij/node-graph-react samples", () => {
  const originalError = console.error;
  const errorSpy = vi
    .spyOn(console, "error")
    .mockImplementation((msg, ...args) => {
      if (typeof msg === "string" && msg.includes("not wrapped in act")) {
        return;
      }
      originalError.call(console, msg as any, ...args);
    });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it("evaluates the simple gain/offset graph sample", async () => {
    const spec = await samples.load("simple-gain-offset");
    let runtimeRef: ReturnType<typeof useGraphRuntime> | null = null;

    const Harness: FC = () => {
      const runtime = useGraphRuntime();
      runtimeRef = runtime;
      return null;
    };

    await initNodeGraphWasm(getNodeGraphWasmInitInput());
    const { unmount } = render(
      <GraphProvider
        spec={spec}
        autoStart={false}
        wasmInitInput={getNodeGraphWasmInitInput()}
      >
        <Harness />
      </GraphProvider>,
    );

    await waitFor(() => {
      expect(runtimeRef?.ready).toBe(true);
    });
    await runtimeRef?.waitForGraphReady?.();

    const values: number[] = [];
    const pushIfNew = (val: number | undefined) => {
      if (typeof val !== "number") return;
      const prev = values[values.length - 1];
      if (typeof prev !== "number" || Math.abs(prev - val) > 1e-6) {
        values.push(val);
      }
    };

    const evaluate = () => {
      if (!runtimeRef) return;
      const result = runtimeRef.evalAll();
      const writes = result?.writes ?? [];
      const hit = writes.find((w: any) => w?.path === "demo/output/value");
      const num = hit ? valueAsNumber(hit.value as any) : undefined;
      pushIfNew(num);
    };

    evaluate();
    runtimeRef?.stageInput("node.t", 0.5, undefined, true);
    evaluate();
    runtimeRef?.stageInput("node.t", 1.0, undefined, true);
    evaluate();

    unmount();

    expect(values[0]).toBeCloseTo(0.25, 3);
    expect(values[1]).toBeCloseTo(1.0, 3);
    expect(values[2]).toBeCloseTo(1.75, 3);
  }, 10000);
});
