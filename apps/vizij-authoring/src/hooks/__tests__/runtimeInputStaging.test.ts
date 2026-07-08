import { describe, expect, it, vi } from "vitest";
import {
  flushQueuedRuntimeInputs,
  queueRuntimeInputWrite,
  queueRuntimeInputsFromState,
} from "../rigController/runtimeInputStaging";

describe("queueRuntimeInputWrite", () => {
  it("deduplicates identical writes for a graph path", () => {
    const queue = new Map<string, number>();
    expect(queueRuntimeInputWrite(queue, "rig/face/jaw/open", 0.42)).toBe(true);
    expect(queueRuntimeInputWrite(queue, "rig/face/jaw/open", 0.42)).toBe(
      false,
    );
    expect(queue.get("rig/face/jaw/open")).toBe(0.42);
  });

  it("overwrites changed values for a graph path", () => {
    const queue = new Map<string, number>();
    queueRuntimeInputWrite(queue, "rig/face/jaw/open", 0.1);
    expect(queueRuntimeInputWrite(queue, "rig/face/jaw/open", 0.2)).toBe(true);
    expect(queue.get("rig/face/jaw/open")).toBe(0.2);
  });
});

describe("queueRuntimeInputsFromState", () => {
  it("queues resolved route values and falls back to defaults", () => {
    const queue = new Map<string, number>([["rig/face/jaw/open", 0.6]]);
    const queuedCount = queueRuntimeInputsFromState({
      routesByCanonicalId: new Map([
        [
          "jaw_open",
          {
            graphPath: "rig/face/jaw/open",
            defaultValue: 0.6,
          },
        ],
        [
          "smile",
          {
            graphPath: "rig/face/mouth/smile",
            defaultValue: 0.25,
          },
        ],
      ]),
      inputValues: {
        jaw_open: 0.6,
        smile: Number.NaN,
      },
      queueByGraphPath: queue,
    });

    expect(queuedCount).toBe(1);
    expect(queue.get("rig/face/jaw/open")).toBe(0.6);
    expect(queue.get("rig/face/mouth/smile")).toBe(0.25);
  });
});

describe("flushQueuedRuntimeInputs", () => {
  it("writes only non-staged changes and clears the queue", () => {
    const queue = new Map<string, number>([
      ["rig/face/jaw/open", 0.5],
      ["rig/face/mouth/smile", 0.8],
    ]);
    const staged = new Map<string, number>([["rig/face/jaw/open", 0.5]]);
    const stageRuntimeInput = vi.fn();

    const writeCount = flushQueuedRuntimeInputs({
      queueByGraphPath: queue,
      stagedByGraphPath: staged,
      stageRuntimeInput,
    });

    expect(writeCount).toBe(1);
    expect(stageRuntimeInput).toHaveBeenCalledTimes(1);
    expect(stageRuntimeInput).toHaveBeenCalledWith("rig/face/mouth/smile", 0.8);
    expect(staged.get("rig/face/jaw/open")).toBe(0.5);
    expect(staged.get("rig/face/mouth/smile")).toBe(0.8);
    expect(queue.size).toBe(0);
  });
});
