import type {
  AnimationRegistrationConfig,
  GraphRegistrationInput,
  ValueJSON,
} from "@vizij/orchestrator-react";
import type { AnimationEditorState, GraphEditorState } from "./types";
import { defaultValueForKind } from "./utils/valueHelpers";

const LEFT_EYE_TRANSLATION_PATH = "demo/eyes/left/translation";
const RIGHT_EYE_TRANSLATION_PATH = "demo/eyes/right/translation";
const EYE_BASE_X_PATH = "demo/animation/eye_roll/base_x";
const EYE_BASE_Y_PATH = "demo/animation/eye_roll/base_y";
const XY_GAIN_PATH = "demo/graph/eye_roll/xy_gain";
const X_OFFSET_PATH = "demo/graph/eye_roll/x_offset";
const Y_OFFSET_PATH = "demo/graph/eye_roll/y_offset";
const Z_DEFAULT_PATH = "demo/graph/eye_roll/z_default";

const makeFloatValue = (value: number): ValueJSON => ({
  type: "float",
  data: value,
});

export const DEFAULT_ANIMATION_CONFIG: AnimationRegistrationConfig = {
  setup: {
    animation: {
      id: "eye-roll",
      name: "Eye Roll",
      duration: 4000,
      groups: [],
      tracks: [
        {
          id: "eye-roll-x",
          name: "Eye Roll X",
          animatableId: EYE_BASE_X_PATH,
          points: [
            { id: "eye-roll-x-start", stamp: 0, value: 0 },
            { id: "eye-roll-x-rise", stamp: 0.2, value: 0.12 },
            { id: "eye-roll-x-peak", stamp: 0.45, value: 0.38 },
            { id: "eye-roll-x-turn", stamp: 0.65, value: 0.22 },
            { id: "eye-roll-x-descend", stamp: 0.85, value: 0.05 },
            { id: "eye-roll-x-end", stamp: 1, value: 0 },
          ],
        },
        {
          id: "eye-roll-y",
          name: "Eye Roll Y",
          animatableId: EYE_BASE_Y_PATH,
          points: [
            { id: "eye-roll-y-start", stamp: 0, value: 0 },
            { id: "eye-roll-y-rise", stamp: 0.2, value: 0.26 },
            { id: "eye-roll-y-glide", stamp: 0.45, value: 0.12 },
            { id: "eye-roll-y-drop", stamp: 0.65, value: -0.12 },
            { id: "eye-roll-y-swoop", stamp: 0.85, value: -0.2 },
            { id: "eye-roll-y-end", stamp: 1, value: 0 },
          ],
        },
      ],
    },
    player: {
      name: "eye-roll-player",
      loop_mode: "loop",
      speed: 1,
    },
  },
};

export const DEFAULT_GRAPH_SPEC: GraphRegistrationInput = {
  spec: {
    nodes: [
      {
        id: "anim_x_input",
        type: "input",
        params: {
          path: EYE_BASE_X_PATH,
          value: makeFloatValue(0),
        },
      },
      {
        id: "anim_y_input",
        type: "input",
        params: {
          path: EYE_BASE_Y_PATH,
          value: makeFloatValue(0),
        },
      },
      {
        id: "xy_gain_input",
        type: "input",
        params: {
          path: XY_GAIN_PATH,
          value: makeFloatValue(0.5),
        },
      },
      {
        id: "x_offset_input",
        type: "input",
        params: {
          path: X_OFFSET_PATH,
          value: makeFloatValue(0),
        },
      },
      {
        id: "y_offset_input",
        type: "input",
        params: {
          path: Y_OFFSET_PATH,
          value: makeFloatValue(0),
        },
      },
      {
        id: "z_default_input",
        type: "input",
        params: {
          path: Z_DEFAULT_PATH,
          value: makeFloatValue(0.05),
        },
      },
      {
        id: "scaled_x",
        type: "multiply",
        inputs: {
          lhs: { node_id: "anim_x_input" },
          rhs: { node_id: "xy_gain_input" },
        },
      },
      {
        id: "scaled_y",
        type: "multiply",
        inputs: {
          lhs: { node_id: "anim_y_input" },
          rhs: { node_id: "xy_gain_input" },
        },
      },
      {
        id: "sum_x",
        type: "add",
        inputs: {
          lhs: { node_id: "scaled_x" },
          rhs: { node_id: "x_offset_input" },
        },
      },
      {
        id: "sum_y",
        type: "add",
        inputs: {
          lhs: { node_id: "scaled_y" },
          rhs: { node_id: "y_offset_input" },
        },
      },
      {
        id: "join_translation",
        type: "join",
        inputs: {
          operands_1: { node_id: "sum_x" },
          operands_2: { node_id: "sum_y" },
          operands_3: { node_id: "z_default_input" },
        },
      },
      {
        id: "left_eye_output",
        type: "output",
        params: { path: LEFT_EYE_TRANSLATION_PATH },
        inputs: { in: { node_id: "join_translation" } },
      },
      {
        id: "right_eye_output",
        type: "output",
        params: { path: RIGHT_EYE_TRANSLATION_PATH },
        inputs: { in: { node_id: "join_translation" } },
      },
    ],
  },
  subs: {
    inputs: [
      EYE_BASE_X_PATH,
      EYE_BASE_Y_PATH,
      XY_GAIN_PATH,
      X_OFFSET_PATH,
      Y_OFFSET_PATH,
      Z_DEFAULT_PATH,
    ],
    outputs: [LEFT_EYE_TRANSLATION_PATH, RIGHT_EYE_TRANSLATION_PATH],
  },
};

export const DEFAULT_LEFT_EYE_TRANSLATION_TARGET = LEFT_EYE_TRANSLATION_PATH;
export const DEFAULT_RIGHT_EYE_TRANSLATION_TARGET = RIGHT_EYE_TRANSLATION_PATH;
export const DEFAULT_EYE_ROLL_BASE_X_PATH = EYE_BASE_X_PATH;
export const DEFAULT_EYE_ROLL_BASE_Y_PATH = EYE_BASE_Y_PATH;
export const DEFAULT_EYE_ROLL_XY_GAIN_PATH = XY_GAIN_PATH;
export const DEFAULT_EYE_ROLL_X_OFFSET_PATH = X_OFFSET_PATH;
export const DEFAULT_EYE_ROLL_Y_OFFSET_PATH = Y_OFFSET_PATH;
export const DEFAULT_EYE_ROLL_Z_DEFAULT_PATH = Z_DEFAULT_PATH;
export const DEFAULT_GRAPH_OUTPUT_PATH = LEFT_EYE_TRANSLATION_PATH;

export const DEFAULT_ANIMATION_STATE: AnimationEditorState = {
  id: "eye-roll",
  name: "Eye Roll",
  duration: 4000,
  playerName: "eye-roll-player",
  loopMode: "loop",
  speed: 1,
  tracks: [
    {
      id: "eye-roll-x",
      name: "Eye Roll X",
      animatableId: EYE_BASE_X_PATH,
      optionId: EYE_BASE_X_PATH,
      componentKey: null,
      valueKind: "float",
      keyframes: [
        { id: "eye-roll-x-start", stamp: 0, value: 0 },
        { id: "eye-roll-x-rise", stamp: 0.2, value: 0.12 },
        { id: "eye-roll-x-peak", stamp: 0.45, value: 0.38 },
        { id: "eye-roll-x-turn", stamp: 0.65, value: 0.22 },
        { id: "eye-roll-x-descend", stamp: 0.85, value: 0.05 },
        { id: "eye-roll-x-end", stamp: 1, value: 0 },
      ],
    },
    {
      id: "eye-roll-y",
      name: "Eye Roll Y",
      animatableId: EYE_BASE_Y_PATH,
      optionId: EYE_BASE_Y_PATH,
      componentKey: null,
      valueKind: "float",
      keyframes: [
        { id: "eye-roll-y-start", stamp: 0, value: 0 },
        { id: "eye-roll-y-rise", stamp: 0.2, value: 0.26 },
        { id: "eye-roll-y-glide", stamp: 0.45, value: 0.12 },
        { id: "eye-roll-y-drop", stamp: 0.65, value: -0.12 },
        { id: "eye-roll-y-swoop", stamp: 0.85, value: -0.2 },
        { id: "eye-roll-y-end", stamp: 1, value: 0 },
      ],
    },
  ],
};

export const DEFAULT_GRAPH_STATE: GraphEditorState = {
  nodes: [
    {
      id: "anim_x_input",
      type: "input",
      name: "Base X",
      category: "Animation",
      params: [
        { id: "path", label: "Path", type: "custom", value: EYE_BASE_X_PATH },
        {
          id: "value",
          label: "Default",
          type: "float",
          value: defaultValueForKind("float"),
        },
      ],
      inputs: {},
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "anim_y_input",
      type: "input",
      name: "Base Y",
      category: "Animation",
      params: [
        { id: "path", label: "Path", type: "custom", value: EYE_BASE_Y_PATH },
        {
          id: "value",
          label: "Default",
          type: "float",
          value: defaultValueForKind("float"),
        },
      ],
      inputs: {},
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "xy_gain_input",
      type: "input",
      name: "XY Gain",
      category: "Controls",
      params: [
        { id: "path", label: "Path", type: "custom", value: XY_GAIN_PATH },
        { id: "value", label: "Default", type: "float", value: 0.5 },
      ],
      inputs: {},
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "x_offset_input",
      type: "input",
      name: "X Offset",
      category: "Controls",
      params: [
        { id: "path", label: "Path", type: "custom", value: X_OFFSET_PATH },
        { id: "value", label: "Default", type: "float", value: 0 },
      ],
      inputs: {},
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "y_offset_input",
      type: "input",
      name: "Y Offset",
      category: "Controls",
      params: [
        { id: "path", label: "Path", type: "custom", value: Y_OFFSET_PATH },
        {
          id: "value",
          label: "Default",
          type: "float",
          value: 0.03727314993739128,
        },
      ],
      inputs: {},
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "z_default_input",
      type: "input",
      name: "Z Default",
      category: "Controls",
      params: [
        { id: "path", label: "Path", type: "custom", value: Z_DEFAULT_PATH },
        { id: "value", label: "Default", type: "float", value: 0.05 },
      ],
      inputs: {},
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "scaled_x",
      type: "multiply",
      name: "Scale X",
      category: "Math",
      params: [],
      inputs: {
        lhs: "anim_x_input",
        rhs: "xy_gain_input",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "scaled_y",
      type: "multiply",
      name: "Scale Y",
      category: "Math",
      params: [],
      inputs: {
        lhs: "anim_y_input",
        rhs: "xy_gain_input",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "sum_x",
      type: "add",
      name: "Add X",
      category: "Math",
      params: [],
      inputs: {
        lhs: "scaled_x",
        rhs: "x_offset_input",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "sum_y",
      type: "add",
      name: "Add Y",
      category: "Math",
      params: [],
      inputs: {
        lhs: "scaled_y",
        rhs: "y_offset_input",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "join_translation",
      type: "join",
      name: "Compose Vec3",
      category: "Vectors",
      params: [],
      inputs: {
        operands_1: "sum_x",
        operands_2: "sum_y",
        operands_3: "z_default_input",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
    },
    {
      id: "left_eye_output",
      type: "output",
      name: "Left Eye",
      category: "Sinks",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: LEFT_EYE_TRANSLATION_PATH,
        },
      ],
      inputs: {
        in: "join_translation",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
      outputValueKind: "vec3",
    },
    {
      id: "right_eye_output",
      type: "output",
      name: "Right Eye",
      category: "Sinks",
      params: [
        {
          id: "path",
          label: "Path",
          type: "custom",
          value: RIGHT_EYE_TRANSLATION_PATH,
        },
      ],
      inputs: {
        in: "join_translation",
      },
      inputShapeJson: undefined,
      outputShapeJson: undefined,
      outputValueKind: "vec3",
    },
  ],
  inputs: [
    EYE_BASE_X_PATH,
    EYE_BASE_Y_PATH,
    XY_GAIN_PATH,
    X_OFFSET_PATH,
    Y_OFFSET_PATH,
    Z_DEFAULT_PATH,
  ],
  outputs: [LEFT_EYE_TRANSLATION_PATH, RIGHT_EYE_TRANSLATION_PATH],
};
