import {
  type ValueJSON,
  type GraphRegistrationInput,
  type AnimationRegistrationConfig,
  type CreateOrchOptions,
} from "@vizij/orchestrator-react";

export interface OrchestrationDocument {
  label?: string;
  createOptions?: CreateOrchOptions;
  inputs?: Record<string, ValueJSON>;
  graphs?: GraphRegistrationInput[];
  animations?: AnimationRegistrationConfig[];
  watchPath?: string | null;
}

export const DEMO_PATHS = {
  animations: {
    rampUp: "demo/animations/ramp_up.value",
    rampDown: "demo/animations/ramp_down.value",
  },
  graphs: {
    product: "demo/graphs/product.value",
    power: "demo/graphs/ten_power.value",
  },
  constants: {
    ten: "demo/constants/base_ten",
  },
} as const;

export const makeFloatValue = (value: number): ValueJSON => ({
  type: "float",
  data: value,
});

export const MULTIPLY_GRAPH_SPEC: GraphRegistrationInput = {
  spec: {
    nodes: [
      {
        id: "ramp_up_input",
        type: "input",
        params: {
          path: DEMO_PATHS.animations.rampUp,
          value: makeFloatValue(0),
        },
      },
      {
        id: "ramp_down_input",
        type: "input",
        params: {
          path: DEMO_PATHS.animations.rampDown,
          value: makeFloatValue(1),
        },
      },
      {
        id: "product",
        type: "multiply",
      },
      {
        id: "product_out",
        type: "output",
        params: {
          path: DEMO_PATHS.graphs.product,
        },
      },
    ],
    links: [
      {
        from: { node_id: "ramp_up_input" },
        to: { node_id: "product", input: "a" },
      },
      {
        from: { node_id: "ramp_down_input" },
        to: { node_id: "product", input: "b" },
      },
      {
        from: { node_id: "product" },
        to: { node_id: "product_out", input: "in" },
      },
    ],
  },
  subs: {
    inputs: [DEMO_PATHS.animations.rampUp, DEMO_PATHS.animations.rampDown],
    outputs: [DEMO_PATHS.graphs.product],
  },
};

export const POWER_GRAPH_SPEC: GraphRegistrationInput = {
  spec: {
    nodes: [
      {
        id: "multiply_output",
        type: "input",
        params: {
          path: DEMO_PATHS.graphs.product,
          value: makeFloatValue(0),
        },
      },
      {
        id: "ten_constant",
        type: "input",
        params: {
          path: DEMO_PATHS.constants.ten,
          value: makeFloatValue(10),
        },
      },
      {
        id: "ten_power",
        type: "power",
      },
      {
        id: "ten_power_out",
        type: "output",
        params: {
          path: DEMO_PATHS.graphs.power,
        },
      },
    ],
    links: [
      {
        from: { node_id: "ten_constant" },
        to: { node_id: "ten_power", input: "base" },
      },
      {
        from: { node_id: "multiply_output" },
        to: { node_id: "ten_power", input: "exp" },
      },
      {
        from: { node_id: "ten_power" },
        to: { node_id: "ten_power_out", input: "in" },
      },
    ],
  },
  subs: {
    inputs: [DEMO_PATHS.graphs.product, DEMO_PATHS.constants.ten],
    outputs: [DEMO_PATHS.graphs.power],
  },
};

const createRampAnimationConfig = (
  id: string,
  label: string,
  animatableId: string,
  startValue: number,
  endValue: number,
): AnimationRegistrationConfig => ({
  setup: {
    animation: {
      id,
      name: label,
      duration: 4000,
      groups: [],
      tracks: [
        {
          id: `${id}-track`,
          name: `${label} Track`,
          animatableId,
          points: [
            { id: `${id}-start`, stamp: 0, value: startValue },
            { id: `${id}-end`, stamp: 1, value: endValue },
          ],
        },
      ],
    },
    player: {
      name: `${id}-player`,
      loop_mode: "loop",
    },
  },
});

export const RAMP_UP_ANIMATION_CONFIG = createRampAnimationConfig(
  "demo-ramp-up",
  "Ramp Up",
  DEMO_PATHS.animations.rampUp,
  0,
  1,
);

export const RAMP_DOWN_ANIMATION_CONFIG = createRampAnimationConfig(
  "demo-ramp-down",
  "Ramp Down",
  DEMO_PATHS.animations.rampDown,
  1,
  0,
);

export const DEFAULT_ORCHESTRATION: OrchestrationDocument = {
  label: "Dual animation multiply example",
  inputs: {
    [DEMO_PATHS.constants.ten]: makeFloatValue(10),
  },
  graphs: [MULTIPLY_GRAPH_SPEC, POWER_GRAPH_SPEC],
  animations: [RAMP_UP_ANIMATION_CONFIG, RAMP_DOWN_ANIMATION_CONFIG],
  watchPath: DEMO_PATHS.graphs.product,
};
