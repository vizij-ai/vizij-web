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
        id: "weights_vector",
        type: "join",
        inputs: {
          operands_1: { node_id: "weight1_input" },
          operands_2: { node_id: "weight2_input" },
        },
      },
      {
        id: "default_blend",
        type: "default-blend",
        inputs: {
          baseline: { node_id: "baseline_input" },
          offset: { node_id: "offset_input" },
          weights: { node_id: "weights_vector" },
          target_1: { node_id: "target1_input" },
          target_2: { node_id: "target2_input" },
        },
      },
      {
        id: "left_eye_output",
        type: "output",
        params: { path: LEFT_EYE_TRANSLATION_PATH },
        inputs: { in: { node_id: "default_blend" } },
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
      id: "weights_vector",
      type: "join",
      name: "Weights Vector",
      category: "Vectors",
      params: [],
      inputs: {
        operands_1: "weight1_input",
        operands_2: "weight2_input",
      },
    },
    {
      id: "default_blend",
      type: "default-blend",
      name: "Default Blend",
      category: "Blend",
      params: [],
      inputs: {
        baseline: "baseline_input",
        offset: "offset_input",
        weights: "weights_vector",
        target_1: "target1_input",
        target_2: "target2_input",
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
      inputs: { in: "default_blend" },
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
