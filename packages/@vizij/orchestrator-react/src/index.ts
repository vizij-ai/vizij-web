import {
  listOrchestrationFixtures,
  loadOrchestrationBundle,
  loadOrchestrationDescriptor,
  loadOrchestrationJson,
} from "@vizij/orchestrator-wasm";

export { OrchestratorProvider } from "./OrchestratorProvider";
export type { OrchestratorProviderProps } from "./OrchestratorProvider";

export { useOrchestrator, useOrchTarget, useOrchFrame } from "./hooks";

export { valueAsNumber, valueAsVec3, valueAsBool } from "./valueHelpers";
export type {
  ValueJSON,
  ShapeJSON,
  WriteOp,
  OrchestratorTimings,
  OrchestratorFrame,
  OrchestratorConflict,
  InitInput,
  PrebindResolver,
  CreateOrchOptions,
  ControllerId,
  GraphRegistrationInput,
  GraphRegistrationConfig,
  GraphSubscriptions,
  MergedGraphRegistrationConfig,
  MergeStrategyOptions,
  MergeConflictStrategy,
  AnimationRegistrationConfig,
  AnimationSetup,
  OrchestratorReactCtx,
} from "./types";

export {
  init as initOrchestratorWasm,
  createOrchestrator as createOrchestratorRuntime,
  Orchestrator as OrchestratorRuntime,
} from "@vizij/orchestrator-wasm";
export {
  listOrchestrationFixtures,
  loadOrchestrationBundle,
  loadOrchestrationDescriptor,
  loadOrchestrationJson,
};
export type {
  OrchestratorFrame as WasmOrchestratorFrame,
  Value as WasmValue,
  Shape as WasmShape,
  ConflictLog as WasmConflictLog,
  GraphRegistrationInput as WasmGraphRegistration,
  GraphRegistrationConfig as WasmGraphRegistrationConfig,
  GraphSubscriptions as WasmGraphSubscriptions,
  MergedGraphRegistrationConfig as WasmMergedGraphRegistrationConfig,
  MergeStrategyOptions as WasmMergeStrategyOptions,
  MergeConflictStrategy as WasmMergeConflictStrategy,
  AnimationRegistrationConfig as WasmAnimationRegistration,
  AnimationSetup as WasmAnimationSetup,
} from "@vizij/orchestrator-wasm";

const FALLBACK_ANIMATIONS: Record<string, unknown> = {
  "simple-scalar-ramp": {
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
  },
};

const FALLBACK_GRAPH_CONFIGS: Record<string, unknown> = {
  "simple-gain-offset": {
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
      links: [
        {
          from: { node_id: "anim_input" },
          to: { node_id: "scaled", input: "a" },
        },
        {
          from: { node_id: "gain_input" },
          to: { node_id: "scaled", input: "b" },
        },
        {
          from: { node_id: "scaled" },
          to: { node_id: "output_sum", input: "lhs" },
        },
        {
          from: { node_id: "offset_input" },
          to: { node_id: "output_sum", input: "rhs" },
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
    },
  },
};

const FALLBACK_ORCHESTRATIONS: Record<
  string,
  {
    descriptor: {
      description: string;
      animation: string;
      graph: string;
      initial_inputs: Array<{ path: string; value: number }>;
      steps: Array<{ delta: number; expect: Record<string, number> }>;
    };
    animationKey: string;
    graphKey: string;
  }
> = {
  "scalar-ramp-pipeline": {
    descriptor: {
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
    },
    animationKey: "simple-scalar-ramp",
    graphKey: "simple-gain-offset",
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function listOrchestrationSamples(): Promise<string[]> {
  if (typeof listOrchestrationFixtures === "function") {
    return listOrchestrationFixtures();
  }
  return Object.keys(FALLBACK_ORCHESTRATIONS);
}

async function loadOrchestrationDescriptorSample(name: string): Promise<any> {
  if (typeof loadOrchestrationDescriptor === "function") {
    return loadOrchestrationDescriptor(name);
  }
  const fallback = FALLBACK_ORCHESTRATIONS[name];
  if (!fallback) {
    throw new Error(`Unknown orchestration fixture: ${name}`);
  }
  return clone(fallback.descriptor);
}

async function loadOrchestrationJsonSample(name: string): Promise<string> {
  if (typeof loadOrchestrationJson === "function") {
    return loadOrchestrationJson(name);
  }
  const descriptor = await loadOrchestrationDescriptorSample(name);
  return JSON.stringify(descriptor);
}

async function loadOrchestrationBundleSample(name: string) {
  if (typeof loadOrchestrationBundle === "function") {
    return loadOrchestrationBundle(name);
  }
  const fallback = FALLBACK_ORCHESTRATIONS[name];
  if (!fallback) {
    throw new Error(`Unknown orchestration fixture: ${name}`);
  }
  const animation = clone(FALLBACK_ANIMATIONS[fallback.animationKey]);
  const graphConfig = clone(FALLBACK_GRAPH_CONFIGS[fallback.graphKey]);
  return {
    descriptor: clone(fallback.descriptor),
    animation,
    graphSpec: graphConfig,
  };
}

/**
 * Standardised access to embedded orchestration samples for quick-start demos and tests.
 * Falls back to baked sample data when the wasm build does not embed fixture helpers.
 */
export const samples = {
  list: listOrchestrationSamples,
  load: loadOrchestrationDescriptorSample,
  loadJson: loadOrchestrationJsonSample,
  loadBundle: loadOrchestrationBundleSample,
} as const;
