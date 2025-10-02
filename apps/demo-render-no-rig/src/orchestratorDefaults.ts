import type {
  AnimationRegistrationConfig,
  GraphRegistrationInput,
} from "@vizij/orchestrator-react";
import type { AnimationEditorState, GraphEditorState } from "./types";

const LEFT_EYE_TRANSLATION_PATH = "demo/eyes/left/translation";
const PRIMARY_VECTOR_PATH = "demo/graph/l_eye/primary";
const SECONDARY_VECTOR_PATH = "demo/graph/l_eye/secondary";
const PRIMARY_WEIGHT_PATH = "demo/graph/l_eye/primary_weight";
const SECONDARY_WEIGHT_PATH = "demo/graph/l_eye/secondary_weight";
const BASELINE_VECTOR_PATH = "demo/graph/l_eye/baseline";

export const DEFAULT_ANIMATION_CONFIG: AnimationRegistrationConfig = {
  setup: {
    animation: {
      id: "baseline",
      name: "Baseline",
      duration: 1000,
      groups: [],
      tracks: [],
    },
    player: {
      name: "baseline-player",
      loop_mode: "loop",
      speed: 1,
    },
  },
};

export const DEFAULT_GRAPH_SPEC: GraphRegistrationInput = {
  spec: {
    nodes: [
      {
        id: "offset_input",
        type: "input",
        params: { path: LEFT_EYE_TRANSLATION_PATH },
      },
      {
        id: "target1_input",
        type: "input",
        params: { path: PRIMARY_VECTOR_PATH },
      },
      {
        id: "target2_input",
        type: "input",
        params: { path: SECONDARY_VECTOR_PATH },
      },
      {
        id: "weight1_input",
        type: "input",
        params: { path: PRIMARY_WEIGHT_PATH },
      },
      {
        id: "weight2_input",
        type: "input",
        params: { path: SECONDARY_WEIGHT_PATH },
      },
      {
        id: "baseline_input",
        type: "input",
        params: { path: BASELINE_VECTOR_PATH },
      },
      {
        id: "const_one",
        type: "constant",
        params: { value: { type: "float", data: 1 } },
      },
      {
        id: "weight_sum",
        type: "add",
        inputs: {
          operands_1: { node_id: "weight1_input" },
          operands_2: { node_id: "weight2_input" },
        },
      },
      {
        id: "baseline_factor_raw",
        type: "subtract",
        inputs: {
          lhs: { node_id: "const_one" },
          rhs: { node_id: "weight_sum" },
        },
      },
      {
        id: "baseline_factor",
        type: "clamp",
        inputs: { in: { node_id: "baseline_factor_raw" } },
        params: {
          min: 0,
          max: 1,
        },
      },
      {
        id: "target1_scaled",
        type: "vectorscale",
        inputs: {
          scalar: { node_id: "weight1_input" },
          v: { node_id: "target1_input" },
        },
      },
      {
        id: "target2_scaled",
        type: "vectorscale",
        inputs: {
          scalar: { node_id: "weight2_input" },
          v: { node_id: "target2_input" },
        },
      },
      {
        id: "targets_combined",
        type: "vectoradd",
        inputs: {
          a: { node_id: "target1_scaled" },
          b: { node_id: "target2_scaled" },
        },
      },
      {
        id: "baseline_scaled",
        type: "vectorscale",
        inputs: {
          scalar: { node_id: "baseline_factor" },
          v: { node_id: "baseline_input" },
        },
      },
      {
        id: "blend_sum",
        type: "vectoradd",
        inputs: {
          a: { node_id: "targets_combined" },
          b: { node_id: "baseline_scaled" },
        },
      },
      {
        id: "final_with_offset",
        type: "vectoradd",
        inputs: {
          a: { node_id: "blend_sum" },
          b: { node_id: "offset_input" },
        },
      },
      {
        id: "left_eye_output",
        type: "output",
        params: { path: LEFT_EYE_TRANSLATION_PATH },
        inputs: { in: { node_id: "final_with_offset" } },
      },
    ],
  },
  subs: {
    inputs: [
      LEFT_EYE_TRANSLATION_PATH,
      PRIMARY_VECTOR_PATH,
      SECONDARY_VECTOR_PATH,
      PRIMARY_WEIGHT_PATH,
      SECONDARY_WEIGHT_PATH,
      BASELINE_VECTOR_PATH,
    ],
    outputs: [LEFT_EYE_TRANSLATION_PATH],
  },
};

export const DEFAULT_ANIMATION_STATE: AnimationEditorState = {
  id: "baseline",
  name: "Baseline",
  duration: 1000,
  playerName: "baseline-player",
  loopMode: "loop",
  speed: 1,
  tracks: [],
};

export const DEFAULT_GRAPH_STATE: GraphEditorState = {
  nodes: [
    {
      id: "offset_input",
      type: "input",
      name: "Offset",
      category: "Vizij",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: LEFT_EYE_TRANSLATION_PATH,
        },
        {
          id: "value",
          label: "Default",
          type: "vector",
          value: [0.1378287374973297, -0.03727314993739128, -0.154551163315773],
        },
      ],
      inputs: {},
    },
    {
      id: "target1_input",
      type: "input",
      name: "Target 1",
      category: "Controls",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: PRIMARY_VECTOR_PATH,
        },
        {
          id: "value",
          label: "Default",
          type: "vector",
          value: [0.03, 0.02, 0.0],
        },
      ],
      inputs: {},
    },
    {
      id: "target2_input",
      type: "input",
      name: "Target 2",
      category: "Controls",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: SECONDARY_VECTOR_PATH,
        },
        {
          id: "value",
          label: "Default",
          type: "vector",
          value: [-0.02, 0.03, 0],
        },
      ],
      inputs: {},
    },
    {
      id: "weight1_input",
      type: "input",
      name: "Weight 1",
      category: "Controls",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: PRIMARY_WEIGHT_PATH,
        },
        { id: "value", label: "Default", type: "float", value: 0.5 },
      ],
      inputs: {},
    },
    {
      id: "weight2_input",
      type: "input",
      name: "Weight 2",
      category: "Controls",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: SECONDARY_WEIGHT_PATH,
        },
        { id: "value", label: "Default", type: "float", value: 0.3 },
      ],
      inputs: {},
    },
    {
      id: "baseline_input",
      type: "input",
      name: "Baseline",
      category: "Controls",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: BASELINE_VECTOR_PATH,
        },
        { id: "value", label: "Default", type: "vector", value: [0, 0, 0] },
      ],
      inputs: {},
    },
    {
      id: "const_one",
      type: "constant",
      name: "One",
      category: "Math",
      params: [{ id: "value", label: "Value", type: "float", value: 1 }],
      inputs: {},
    },
    {
      id: "weight_sum",
      type: "add",
      name: "Weight Sum",
      category: "Math",
      params: [],
      inputs: {
        operands_1: "weight1_input",
        operands_2: "weight2_input",
      },
    },
    {
      id: "baseline_factor_raw",
      type: "subtract",
      name: "Baseline Factor Raw",
      category: "Math",
      params: [],
      inputs: {
        lhs: "const_one",
        rhs: "weight_sum",
      },
    },
    {
      id: "baseline_factor",
      type: "clamp",
      name: "Baseline Factor",
      category: "Math",
      params: [
        { id: "min", label: "Min", type: "float", value: 0 },
        { id: "max", label: "Max", type: "float", value: 1 },
      ],
      inputs: {
        in: "baseline_factor_raw",
      },
    },
    {
      id: "target1_scaled",
      type: "vectorscale",
      name: "Target 1 Scaled",
      category: "Vectors",
      params: [],
      inputs: {
        scalar: "weight1_input",
        v: "target1_input",
      },
    },
    {
      id: "target2_scaled",
      type: "vectorscale",
      name: "Target 2 Scaled",
      category: "Vectors",
      params: [],
      inputs: {
        scalar: "weight2_input",
        v: "target2_input",
      },
    },
    {
      id: "targets_combined",
      type: "vectoradd",
      name: "Targets Combined",
      category: "Vectors",
      params: [],
      inputs: {
        a: "target1_scaled",
        b: "target2_scaled",
      },
    },
    {
      id: "baseline_scaled",
      type: "vectorscale",
      name: "Baseline Scaled",
      category: "Vectors",
      params: [],
      inputs: {
        scalar: "baseline_factor",
        v: "baseline_input",
      },
    },
    {
      id: "blend_sum",
      type: "vectoradd",
      name: "Blend Sum",
      category: "Vectors",
      params: [],
      inputs: {
        a: "targets_combined",
        b: "baseline_scaled",
      },
    },
    {
      id: "final_with_offset",
      type: "vectoradd",
      name: "Final With Offset",
      category: "Vectors",
      params: [],
      inputs: {
        a: "blend_sum",
        b: "offset_input",
      },
    },
    {
      id: "left_eye_output",
      type: "output",
      name: "Left Eye Output",
      category: "Vizij",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: LEFT_EYE_TRANSLATION_PATH,
        },
      ],
      inputs: { in: "final_with_offset" },
      outputValueKind: "vec3",
    },
  ],
  inputs: [
    LEFT_EYE_TRANSLATION_PATH,
    PRIMARY_VECTOR_PATH,
    SECONDARY_VECTOR_PATH,
    PRIMARY_WEIGHT_PATH,
    SECONDARY_WEIGHT_PATH,
    BASELINE_VECTOR_PATH,
  ],
  outputs: [LEFT_EYE_TRANSLATION_PATH],
};
