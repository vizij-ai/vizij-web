/* @vitest-environment jsdom */
import React from "react";
import type { FC } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { toValueJSON, type ValueInput } from "@vizij/value-json";
import { cloneDeepSafe } from "@vizij/utils";
import {
  OrchestratorProvider,
  useOrchestrator,
  valueAsNumber,
  samples,
} from "../index";
import type { GraphRegistrationInput, GraphRegistrationConfig } from "../index";

const SAMPLE_DESCRIPTOR = {
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

const SAMPLE_ANIMATION = {
  id: "ramp-1",
  name: "ramp",
  tracks: [
    {
      id: "t-ramp-scalar",
      name: "Scalar Ramp",
      animatableId: "node.t",
      points: [
        {
          id: "k0",
          stamp: 0.0,
          value: 0.0,
          transitions: { out: { x: 0.0, y: 0.0 } },
        },
        {
          id: "k1",
          stamp: 1.0,
          value: 1.0,
          transitions: { in: { x: 1.0, y: 1.0 } },
        },
      ],
      settings: {},
    },
  ],
  groups: {},
  duration: 1000,
} as const;

const SAMPLE_GRAPH_SPEC: GraphRegistrationInput = {
  spec: {
    nodes: [
      {
        id: "anim_input",
        type: "input",
        params: {
          path: "node.t",
          value: 0,
        },
      },
      {
        id: "gain_input",
        type: "input",
        params: {
          path: "demo/graph/gain",
          value: 1.5,
        },
      },
      {
        id: "offset_input",
        type: "input",
        params: {
          path: "demo/graph/offset",
          value: 0.25,
        },
      },
      { id: "scaled", type: "multiply" },
      { id: "output_sum", type: "add" },
      {
        id: "out",
        type: "output",
        params: {
          path: "demo/output/value",
        },
      },
    ],
    edges: [
      {
        from: { node_id: "anim_input" },
        to: { node_id: "scaled", input: "operand_1" },
      },
      {
        from: { node_id: "gain_input" },
        to: { node_id: "scaled", input: "operand_2" },
      },
      {
        from: { node_id: "scaled" },
        to: { node_id: "output_sum", input: "operand_1" },
      },
      {
        from: { node_id: "offset_input" },
        to: { node_id: "output_sum", input: "operand_2" },
      },
      {
        from: { node_id: "output_sum" },
        to: { node_id: "out", input: "in" },
      },
    ],
  },
  subs: {
    inputs: ["node.t", "demo/graph/gain", "demo/graph/offset"],
    outputs: ["demo/output/value"],
    mirrorWrites: true,
  },
};

const SAMPLE_FIXTURES = {
  "scalar-ramp-pipeline": {
    descriptor: SAMPLE_DESCRIPTOR,
    animations: [
      {
        key: "simple-scalar-ramp",
        id: "anim-1",
        animation: SAMPLE_ANIMATION,
        setup: {
          animation: SAMPLE_ANIMATION,
          player: { name: "fixture-player", loop_mode: "once" },
        },
      },
    ],
    graphs: [
      {
        key: "simple-gain-offset",
        id: "graph-1",
        config: SAMPLE_GRAPH_SPEC as GraphRegistrationConfig,
        mirrorWrites: true,
        stage: [
          { path: "demo/graph/gain", value: 1.5 },
          { path: "demo/graph/offset", value: 0.25 },
        ],
      },
    ],
    mergedGraphs: [],
    initialInputs: SAMPLE_DESCRIPTOR.initial_inputs.map((entry) => ({
      path: entry.path,
      value: entry.value,
    })),
  },
} as const;

const clone = <T,>(value: T): T => cloneDeepSafe(value);

vi.mock("@vizij/orchestrator-wasm", () => {
  type Step = (typeof SAMPLE_DESCRIPTOR.steps)[number];

  const listOrchestrationFixtures = vi.fn(async () =>
    Object.keys(SAMPLE_FIXTURES),
  );

  const loadOrchestrationDescriptor = vi.fn(async (name: string) => {
    const fixture = SAMPLE_FIXTURES[name as keyof typeof SAMPLE_FIXTURES];
    if (!fixture) {
      throw new Error(`Unknown orchestration fixture: ${name}`);
    }
    return clone(fixture.descriptor);
  });

  const loadOrchestrationJson = vi.fn(async (name: string) => {
    const descriptor = await loadOrchestrationDescriptor(name);
    return JSON.stringify(descriptor);
  });

  const loadOrchestrationBundle = vi.fn(async (name: string) => {
    const fixture = SAMPLE_FIXTURES[name as keyof typeof SAMPLE_FIXTURES];
    if (!fixture) {
      throw new Error(`Unknown orchestration fixture: ${name}`);
    }
    return clone(fixture);
  });

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
        SAMPLE_DESCRIPTOR.steps[this.stepIndex] ??
        SAMPLE_DESCRIPTOR.steps[SAMPLE_DESCRIPTOR.steps.length - 1];
      this.stepIndex = Math.min(
        this.stepIndex + 1,
        SAMPLE_DESCRIPTOR.steps.length - 1,
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
    listOrchestrationFixtures,
    loadOrchestrationBundle,
    loadOrchestrationDescriptor,
    loadOrchestrationJson,
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

    const Harness: FC = () => {
      const orch = useOrchestrator();
      const registeredRef = React.useRef(false);

      React.useEffect(() => {
        if (!orch.ready || registeredRef.current) return;
        registeredRef.current = true;
        (async () => {
          orch.prebind?.((path) => path);
          bundle.graphs.forEach((binding) => {
            const config = clone(binding.config) as GraphRegistrationConfig;
            if (binding.id) {
              config.id = binding.id;
            }
            orch.registerGraph(config);
          });

          bundle.mergedGraphs.forEach((merged) => {
            const mergedConfig = {
              id: merged.id,
              strategy: merged.strategy,
              graphs: merged.graphs.map((binding) => {
                const config = clone(binding.config) as GraphRegistrationConfig;
                if (binding.id) {
                  config.id = binding.id;
                }
                return config;
              }),
            };
            orch.registerMergedGraph(mergedConfig);
          });

          bundle.animations.forEach((binding) => {
            orch.registerAnimation({
              ...(binding.id ? { id: binding.id } : {}),
              setup: clone(binding.setup),
            });
          });

          for (const input of bundle.initialInputs) {
            orch.setInput(
              input.path,
              toValueJSON(input.value as ValueInput),
              input.shape as any,
            );
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

    let renderResult: ReturnType<typeof render>;
    await act(async () => {
      renderResult = render(
        <OrchestratorProvider autostart={false}>
          <Harness />
        </OrchestratorProvider>,
      );
    });

    const captured = await deferred.promise;
    await act(async () => {
      renderResult.unmount();
    });
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
