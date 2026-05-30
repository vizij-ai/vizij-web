import { describe, expect, it } from "vitest";
import type { ShapeJSON, ValueJSON } from "@vizij/orchestrator-react";
import {
  advanceRuntimeExecution,
  clearStagedRuntimeInput,
  flushStagedRuntimeInput,
  flushStagedRuntimeInputs,
  stageRuntimeInput,
  updateAverageStepDelta,
} from "../host/executionLoop";

describe("runtime execution host inputs", () => {
  it("stages inputs under the active namespace and flushes them in order", () => {
    const stagedInputs = new Map<
      string,
      { value: ValueJSON; shape?: ShapeJSON }
    >();
    const flushed: Array<{
      path: string;
      value: ValueJSON;
      shape?: ShapeJSON;
    }> = [];

    expect(
      stageRuntimeInput({
        stagedInputs,
        namespace: "demo-face",
        path: "rig/face/smile",
        value: { float: 0.5 },
      }),
    ).toBe("demo-face/rig/face/smile");
    stageRuntimeInput({
      stagedInputs,
      namespace: "demo-face",
      path: "demo-face/rig/face/blink",
      value: { float: 1 },
      shape: { kind: "scalar" } as ShapeJSON,
    });

    const count = flushStagedRuntimeInputs({
      stagedInputs,
      setInput: (path, value, shape) => {
        flushed.push({ path, value, shape });
      },
    });

    expect(count).toBe(2);
    expect(stagedInputs.size).toBe(0);
    expect(flushed).toEqual([
      { path: "demo-face/rig/face/smile", value: { float: 0.5 } },
      {
        path: "demo-face/rig/face/blink",
        value: { float: 1 },
        shape: { kind: "scalar" },
      },
    ]);
  });

  it("flushes or clears a single namespaced staged input", () => {
    const stagedInputs = new Map<
      string,
      { value: ValueJSON; shape?: ShapeJSON }
    >();
    const flushed: Array<{
      path: string;
      value: ValueJSON;
      shape?: ShapeJSON;
    }> = [];
    const removed: string[] = [];

    stageRuntimeInput({
      stagedInputs,
      namespace: "demo-face",
      path: "rig/face/smile",
      value: { float: 0.5 },
    });

    expect(
      flushStagedRuntimeInput({
        stagedInputs,
        namespace: "demo-face",
        path: "rig/face/smile",
        fallbackValue: { float: 0 },
        setInput: (path, value, shape) => {
          flushed.push({ path, value, shape });
        },
      }),
    ).toBe(true);
    expect(flushed).toEqual([
      { path: "demo-face/rig/face/smile", value: { float: 0.5 } },
    ]);

    stageRuntimeInput({
      stagedInputs,
      namespace: "demo-face",
      path: "rig/face/blink",
      value: { float: 1 },
    });
    clearStagedRuntimeInput({
      stagedInputs,
      namespace: "demo-face",
      path: "rig/face/blink",
      removeInput: (path) => {
        removed.push(path);
      },
    });

    expect(stagedInputs.size).toBe(0);
    expect(removed).toEqual(["demo-face/rig/face/blink"]);
  });
});

describe("runtime execution stepping", () => {
  it("updates average dt, advances host work, flushes inputs, and steps runtime only when enabled", () => {
    const stagedInputs = new Map<
      string,
      { value: ValueJSON; shape?: ShapeJSON }
    >();
    const calls: string[] = [];
    stageRuntimeInput({
      stagedInputs,
      namespace: "demo-face",
      path: "rig/face/smile",
      value: { float: 0.5 },
    });

    const result = advanceRuntimeExecution({
      dt: 0.2,
      previousAverageDt: 0.1,
      driveRuntime: false,
      forceRuntime: true,
      stagedInputs,
      advanceHostAnimations: (dt) => {
        calls.push(`advance:${dt}`);
      },
      setInput: (path, value) => {
        calls.push(`flush:${path}:${JSON.stringify(value)}`);
      },
      stepRuntime: (dt) => {
        calls.push(`runtime:${dt}`);
      },
    });

    expect(result.averageDt).toBeCloseTo(0.11, 6);
    expect(result.flushedInputCount).toBe(1);
    expect(result.steppedRuntime).toBe(true);
    expect(calls).toEqual([
      "advance:0.2",
      'flush:demo-face/rig/face/smile:{"float":0.5}',
      "runtime:0.2",
    ]);
  });

  it("does not step runtime without driveRuntime or forceRuntime", () => {
    const calls: string[] = [];

    const result = advanceRuntimeExecution({
      dt: 0.1,
      previousAverageDt: null,
      driveRuntime: false,
      forceRuntime: false,
      stagedInputs: new Map(),
      advanceHostAnimations: () => calls.push("advance"),
      setInput: () => calls.push("flush"),
      stepRuntime: () => calls.push("runtime"),
    });

    expect(result.averageDt).toBe(0.1);
    expect(result.steppedRuntime).toBe(false);
    expect(calls).toEqual(["advance"]);
  });

  it("ignores non-positive or non-finite dt for average updates", () => {
    expect(updateAverageStepDelta(0.1, 0)).toBe(0.1);
    expect(updateAverageStepDelta(0.1, Number.NaN)).toBe(0.1);
    expect(updateAverageStepDelta(null, -1)).toBeNull();
  });
});
