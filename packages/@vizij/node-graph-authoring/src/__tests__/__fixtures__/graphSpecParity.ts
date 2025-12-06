export const DERIVED_GRAPH_SPEC_FIXTURE = {
  nodes: [
    {
      id: "input_input_a",
      type: "input",
      params: {
        path: "rig/robot/controls/a",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "reserved_time_1",
      type: "time",
      metadata: {
        reservedVariable: "time",
      },
    },
    {
      id: "input_input_b",
      type: "input",
      params: {
        path: "rig/robot/controls/b",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "expr_component_1_0",
      type: "subtract",
      inputDefaults: {
        lhs: 0,
      },
    },
    {
      id: "out_rig_robot_mouth_pos_y",
      type: "output",
      params: {
        path: "rig/robot/mouth/pos/y",
      },
    },
  ],
  edges: [
    {
      from: "input_input_b",
      to: "expr_component_1_0",
      input: "rhs",
    },
    {
      from: "expr_component_1_0",
      to: "out_rig_robot_mouth_pos_y",
      input: "in",
    },
  ],
} as const;

export const RESERVED_GRAPH_SPEC_FIXTURE = {
  nodes: [
    {
      id: "input_input_a",
      type: "input",
      params: {
        path: "rig/robot/controls/a",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "const_component_1_1",
      type: "constant",
      params: {
        value: 0,
      },
    },
    {
      id: "reserved_time_1",
      type: "time",
      metadata: {
        reservedVariable: "time",
      },
    },
    {
      id: "out_rig_robot_mouth_pos_y",
      type: "output",
      params: {
        path: "rig/robot/mouth/pos/y",
      },
    },
  ],
  edges: [
    {
      from: "input_input_a",
      to: "out_rig_robot_mouth_pos_y",
      input: "in",
    },
  ],
} as const;

export const VECTOR_GRAPH_SPEC_FIXTURE = {
  nodes: [
    {
      id: "input_input_a",
      type: "input",
      params: {
        path: "rig/robot/controls/a",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "reserved_time_1",
      type: "time",
      metadata: {
        reservedVariable: "time",
      },
    },
    {
      id: "input_input_b",
      type: "input",
      params: {
        path: "rig/robot/controls/b",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "input_input_c",
      type: "input",
      params: {
        path: "rig/robot/controls/c",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "join_rig_robot_head_pos",
      type: "join",
    },
    {
      id: "out_rig_robot_head_pos",
      type: "output",
      params: {
        path: "rig/robot/head/pos",
      },
    },
  ],
  edges: [
    {
      from: "input_input_a",
      to: "join_rig_robot_head_pos",
      input: "operand_1",
    },
    {
      from: "input_input_b",
      to: "join_rig_robot_head_pos",
      input: "operand_2",
    },
    {
      from: "input_input_c",
      to: "join_rig_robot_head_pos",
      input: "operand_3",
    },
    {
      from: "join_rig_robot_head_pos",
      to: "out_rig_robot_head_pos",
      input: "in",
    },
  ],
} as const;

export const CASE_GRAPH_SPEC_FIXTURE = {
  nodes: [
    {
      id: "input_selector_input",
      type: "input",
      params: {
        path: "rig/robot/controls/selector",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "reserved_time_1",
      type: "time",
      metadata: {
        reservedVariable: "time",
      },
    },
    {
      id: "input_input_b",
      type: "input",
      params: {
        path: "rig/robot/controls/b",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "input_input_c",
      type: "input",
      params: {
        path: "rig/robot/controls/c",
        value: {
          float: 0,
        },
      },
    },
    {
      id: "expr_component_1_0",
      type: "case",
      params: {
        case_labels: ["happy"],
      },
      inputDefaults: {
        selector: 0,
      },
    },
    {
      id: "out_rig_robot_mouth_pos_y",
      type: "output",
      params: {
        path: "rig/robot/mouth/pos/y",
      },
    },
  ],
  edges: [
    {
      from: "input_input_c",
      to: "expr_component_1_0",
      input: "default",
    },
    {
      from: "input_input_b",
      to: "expr_component_1_0",
      input: "operand_1",
    },
    {
      from: "expr_component_1_0",
      to: "out_rig_robot_mouth_pos_y",
      input: "in",
    },
  ],
} as const;

export const CASE_METADATA_FIXTURE = {
  expression: {
    case: {
      kind: "case",
      selector: {
        kind: "slot",
        ref: "selector",
        alias: "selector",
        slotId: "slot_selector",
        inputId: "derived_case_slot",
        valueType: "scalar",
      },
      defaultBranch: {
        kind: "slot",
        ref: "sad",
        alias: "sad",
        slotId: "slot_sad",
        inputId: "input_c",
        valueType: "scalar",
      },
      branches: [
        {
          kind: "slot",
          ref: "happy",
          alias: "happy",
          slotId: "slot_happy",
          inputId: "input_b",
          valueType: "scalar",
        },
      ],
    },
  },
} as const;
