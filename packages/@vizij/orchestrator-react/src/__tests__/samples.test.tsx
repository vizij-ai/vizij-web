/* @vitest-environment jsdom */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  OrchestratorProvider,
  useOrchestrator,
  valueAsNumber,
  samples,
} from "../index";
import { toValueJSON, type ValueInput } from "@vizij/value-json";

const FALLBACK_DESCRIPTOR = {
  description: "Scalar ramp animation drives a gain/offset graph",
  animation: "simple-scalar-ramp",
  graph: "simple-gain-offset",
  initial_inputs: [
    { path: "demo/graph/gain", value: 1.5 },
    { path: "demo/graph/offset", value: 0.25 },
  ],
  steps: [
    {
      delta: 0.0,
      expect: { "node.t": 0.0, "demo/output/value": 0.25 },
    },
    {
      delta: 0.5,
      expect: { "node.t": 0.5, "demo/output/value": 1.0 },
    },
    {
      delta: 1.0,
      expect: { "node.t": 1.0, "demo/output/value": 1.75 },
    },
  ],
} as const;

vi.mock("@vizij/orchestrator-wasm", () => {
  type Step = (typeof FALLBACK_DESCRIPTOR.steps)[number];

  class StubOrchestrator {
    private stepIndex = 0;

    registerGraph(): string {
      return "graph-1";
    }

    registerMergedGraph(): string {
      return "merged-graph-1";
    }

    registerAnimation(): string {
      return "anim-1";
    }

    prebind(): void {}

    setInput(): void {}

    removeInput(): boolean {
      return true;
    }

    listControllers(): { graphs: string[]; anims: string[] } {
      return { graphs: ["graph-1"], anims: ["anim-1"] };
    }

    removeGraph(): boolean {
      return true;
    }

    removeAnimation(): boolean {
      return true;
    }

    normalizeGraphSpec(spec: unknown): Promise<unknown> {
      return Promise.resolve(spec);
    }

    step(delta: number): any {
      const step: Step =
        FALLBACK_DESCRIPTOR.steps[this.stepIndex] ??
        FALLBACK_DESCRIPTOR.steps[FALLBACK_DESCRIPTOR.steps.length - 1];
      this.stepIndex = Math.min(
        this.stepIndex + 1,
        FALLBACK_DESCRIPTOR.steps.length - 1,
      );

      const merged_writes = Object.entries(step.expect ?? {}).map(
        ([path, value]) => ({
          path,
          value: { float: value },
          shape: { id: "Scalar" },
        }),
      );

      return {
        epoch: this.stepIndex,
        dt: delta,
        merged_writes,
        conflicts: [],
        events: [],
        timings_ms: { total_ms: 0 },
      };
    }
  }

  return {
    init: vi.fn(async () => {}),
    createOrchestrator: vi.fn(async () => new StubOrchestrator()),
    Orchestrator: StubOrchestrator,
    abi_version: vi.fn(() => 2),
    listOrchestrationFixtures: undefined,
    loadOrchestrationBundle: undefined,
    loadOrchestrationDescriptor: undefined,
    loadOrchestrationJson: undefined,
  };
});

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("@vizij/orchestrator-react samples", () => {
  it("runs the scalar ramp orchestration bundle end-to-end", async () => {
    // eslint-disable-next-line no-console
    const bundle = await samples.loadBundle("scalar-ramp-pipeline");
    const deferred = createDeferred<Array<Record<string, number>>>();

    const Harness: React.FC = () => {
      const orch = useOrchestrator();
      const registeredRef = React.useRef(false);

      React.useEffect(() => {
        if (!orch.ready || registeredRef.current) return;
        registeredRef.current = true;
        (async () => {
          orch.prebind?.((path) => path);
          orch.registerGraph(bundle.graphSpec);
          orch.registerAnimation({
            setup: {
              animation: bundle.animation,
              player: { name: "fixture-player", loop_mode: "once" },
            },
          });

          for (const input of bundle.descriptor.initial_inputs ?? []) {
            orch.setInput(input.path, toValueJSON(input.value as ValueInput));
          }

          const captures: Array<Record<string, number>> = [];
          for (const step of bundle.descriptor.steps ?? []) {
            const frame = orch.step(step.delta);
            const snapshot: Record<string, number> = {};
            frame?.merged_writes?.forEach((write) => {
              const num = valueAsNumber(write.value);
              if (typeof num === "number") {
                snapshot[write.path] = num;
              }
            });
            captures.push(snapshot);
          }

          deferred.resolve(captures);
        })().catch((err) => deferred.reject(err));
      }, [orch.ready]);

      return null;
    };

    render(
      <OrchestratorProvider autostart={false}>
        <Harness />
      </OrchestratorProvider>,
    );

    const captured = await deferred.promise;
    const steps = bundle.descriptor.steps ?? [];
    expect(captured.length).toBe(steps.length);
    steps.forEach((step, idx) => {
      const snapshot = captured[idx] ?? {};
      Object.entries(step.expect ?? {}).forEach(([path, expectedValue]) => {
        expect(snapshot[path]).toBeCloseTo(Number(expectedValue), 3);
      });
    });
  });
});
