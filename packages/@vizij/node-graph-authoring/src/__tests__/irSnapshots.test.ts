import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { SELF_BINDING_ID } from "@vizij/utils";

import { buildRigGraphSpec } from "../graphBuilder";
import {
  addBindingSlot,
  bindingTargetFromInput,
  createDefaultBinding,
  createDefaultParentBinding,
  createDefaultRemap,
  updateBindingExpression,
  updateBindingWithInput,
} from "../state";
import type { IrGraph } from "../ir/types";

const COMPONENT: AnimatableComponent = {
  id: "component_1",
  safeId: "component_1",
  animatableId: "rig/robot/mouth/pos/y",
  animatableType: "number",
  label: "Mouth Pos Y",
  defaultValue: 0,
  range: {
    min: -1,
    max: 1,
  },
};

const ANIMATABLE: AnimatableValue = {
  id: "rig/robot/mouth/pos/y",
  type: "number",
  name: "Mouth Pos Y",
  default: 0,
  constraints: {
    min: -1,
    max: 1,
  },
  pub: {
    public: true,
    output: "Mouth Pos Y",
  },
};

const INPUT_A: StandardRigInput = {
  id: "input_a",
  path: "/controls/a",
  label: "Control A",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

const INPUT_B: StandardRigInput = {
  id: "input_b",
  path: "/controls/b",
  label: "Control B",
  group: "controls",
  defaultValue: 0,
  range: { min: -1, max: 1 },
};

function sanitizeIrGraph(graph: IrGraph) {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      params: node.params ?? undefined,
      inputDefaults: node.inputDefaults ?? undefined,
    })),
    edges: graph.edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
    })),
    constants: graph.constants.map((constant) => ({
      id: constant.id,
      value: constant.value,
      valueType: constant.valueType,
    })),
    summary: graph.summary,
    metadata: {
      source: graph.metadata.source,
      registryVersion: graph.metadata.registryVersion,
    },
    issues: graph.issues,
  };
}

describe("IR snapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("captures scalar binding IR graph", () => {
    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: INPUT_A.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_b",
        alias: "B",
        inputId: INPUT_B.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "A + B * 0.5";

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: { [ANIMATABLE.id]: ANIMATABLE },
      components: [COMPONENT],
      bindings: { [COMPONENT.id]: binding },
      inputsById: new Map([
        [INPUT_A.id, INPUT_A],
        [INPUT_B.id, INPUT_B],
      ]),
      inputBindings: {},
    });

    expect(result.ir).toBeDefined();
    const graph = result.ir?.graph;
    expect(graph).toBeDefined();
    expect(sanitizeIrGraph(graph!)).toMatchInlineSnapshot(`
      {
        "constants": [],
        "edges": [
          {
            "from": {
              "component": undefined,
              "nodeId": "input_input_a",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "remap_component_1_slot_a",
              "portId": "in",
            },
          },
          {
            "from": {
              "component": undefined,
              "nodeId": "input_input_b",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "remap_component_1_slot_b",
              "portId": "in",
            },
          },
          {
            "from": {
              "component": undefined,
              "nodeId": "remap_component_1_slot_b",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "expr_component_1_3",
              "portId": "operand_1",
            },
          },
          {
            "from": {
              "component": undefined,
              "nodeId": "remap_component_1_slot_a",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "expr_component_1_4",
              "portId": "operand_1",
            },
          },
          {
            "from": {
              "component": undefined,
              "nodeId": "expr_component_1_3",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "expr_component_1_4",
              "portId": "operand_2",
            },
          },
          {
            "from": {
              "component": undefined,
              "nodeId": "expr_component_1_4",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "out_rig_robot_mouth_pos_y",
              "portId": "in",
            },
          },
        ],
        "issues": [],
        "metadata": {
          "registryVersion": "1.0.0",
          "source": "graphBuilder",
        },
        "nodes": [
          {
            "id": "input_input_a",
            "inputDefaults": undefined,
            "params": {
              "path": "rig/robot/controls/a",
              "value": {
                "float": 0,
              },
            },
            "type": "input",
          },
          {
            "id": "remap_component_1_slot_a",
            "inputDefaults": {
              "in_anchor": 0,
              "in_high": 1,
              "in_low": -1,
              "out_anchor": 0,
              "out_high": 1,
              "out_low": -1,
            },
            "params": undefined,
            "type": "centered_remap",
          },
          {
            "id": "input_input_b",
            "inputDefaults": undefined,
            "params": {
              "path": "rig/robot/controls/b",
              "value": {
                "float": 0,
              },
            },
            "type": "input",
          },
          {
            "id": "remap_component_1_slot_b",
            "inputDefaults": {
              "in_anchor": 0,
              "in_high": 1,
              "in_low": -1,
              "out_anchor": 0,
              "out_high": 1,
              "out_low": -1,
            },
            "params": undefined,
            "type": "centered_remap",
          },
          {
            "id": "time_component_1_0",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "deltaTime_component_1_1",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "frame_component_1_2",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "expr_component_1_3",
            "inputDefaults": {
              "operand_2": 0.5,
            },
            "params": undefined,
            "type": "multiply",
          },
          {
            "id": "expr_component_1_4",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "add",
          },
          {
            "id": "out_rig_robot_mouth_pos_y",
            "inputDefaults": undefined,
            "params": {
              "path": "rig/robot/mouth/pos/y",
            },
            "type": "output",
          },
        ],
        "summary": {
          "bindings": [
            {
              "animatableId": "rig/robot/mouth/pos/y",
              "component": undefined,
              "expression": "A + B * 0.5",
              "inputId": "input_a",
              "issues": undefined,
              "operators": [
                {
                  "enabled": false,
                  "params": {
                    "damping": 20,
                    "mass": 1,
                    "stiffness": 120,
                  },
                  "type": "spring",
                },
                {
                  "enabled": false,
                  "params": {
                    "half_life": 0.2,
                  },
                  "type": "damp",
                },
                {
                  "enabled": false,
                  "params": {
                    "max_rate": 1,
                  },
                  "type": "slew",
                },
              ],
              "remap": {
                "inAnchor": 0,
                "inHigh": 1,
                "inLow": -1,
                "outAnchor": 0,
                "outHigh": 1,
                "outLow": -1,
              },
              "slotAlias": "A",
              "slotId": "slot_a",
              "targetId": "component_1",
              "valueType": "scalar",
            },
            {
              "animatableId": "rig/robot/mouth/pos/y",
              "component": undefined,
              "expression": "A + B * 0.5",
              "inputId": "input_b",
              "issues": undefined,
              "operators": [
                {
                  "enabled": false,
                  "params": {
                    "damping": 20,
                    "mass": 1,
                    "stiffness": 120,
                  },
                  "type": "spring",
                },
                {
                  "enabled": false,
                  "params": {
                    "half_life": 0.2,
                  },
                  "type": "damp",
                },
                {
                  "enabled": false,
                  "params": {
                    "max_rate": 1,
                  },
                  "type": "slew",
                },
              ],
              "remap": {
                "inAnchor": 0,
                "inHigh": 1,
                "inLow": -1,
                "outAnchor": 0,
                "outHigh": 1,
                "outLow": -1,
              },
              "slotAlias": "B",
              "slotId": "slot_b",
              "targetId": "component_1",
              "valueType": "scalar",
            },
          ],
          "faceId": "robot",
          "inputs": [
            "rig/robot/controls/a",
            "rig/robot/controls/b",
          ],
          "outputs": [
            "rig/robot/mouth/pos/y",
          ],
        },
      }
    `);
  });

  it("captures derived input IR graph", () => {
    const derivedInput: StandardRigInput = {
      id: "derived_input",
      path: "/controls/derived",
      label: "Derived",
      group: "controls",
      defaultValue: 0,
      range: { min: -1, max: 1 },
    };

    let parentBinding = createDefaultParentBinding(
      bindingTargetFromInput(derivedInput),
    );
    parentBinding = addBindingSlot(
      parentBinding,
      bindingTargetFromInput(derivedInput),
    );
    parentBinding = updateBindingWithInput(
      parentBinding,
      bindingTargetFromInput(derivedInput),
      INPUT_A,
    );
    parentBinding = updateBindingExpression(
      parentBinding,
      bindingTargetFromInput(derivedInput),
      "slot_1",
    );

    const binding = createDefaultBinding(COMPONENT);
    binding.slots = [
      {
        id: "slot_a",
        alias: "A",
        inputId: derivedInput.id,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
      {
        id: "slot_b",
        alias: "B",
        inputId: SELF_BINDING_ID,
        remap: { ...createDefaultRemap(COMPONENT) },
      },
    ];
    binding.expression = "A + self";

    const result = buildRigGraphSpec({
      faceId: "robot",
      animatables: { [ANIMATABLE.id]: ANIMATABLE },
      components: [COMPONENT],
      bindings: { [COMPONENT.id]: binding },
      inputsById: new Map([
        [INPUT_A.id, INPUT_A],
        [derivedInput.id, derivedInput],
      ]),
      inputBindings: {
        [derivedInput.id]: parentBinding,
      },
    });

    expect(result.ir).toBeDefined();
    expect(sanitizeIrGraph(result.ir!.graph)).toMatchInlineSnapshot(`
      {
        "constants": [
          {
            "id": "const_component_1_1",
            "value": 0,
            "valueType": "scalar",
          },
        ],
        "edges": [
          {
            "from": {
              "component": undefined,
              "nodeId": "input_input_a",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "remap_derived_input_s1",
              "portId": "in",
            },
          },
          {
            "from": {
              "component": undefined,
              "nodeId": "remap_component_1_slot_a",
              "portId": undefined,
            },
            "to": {
              "component": undefined,
              "nodeId": "out_rig_robot_mouth_pos_y",
              "portId": "in",
            },
          },
        ],
        "issues": [
          {
            "id": "issue_1",
            "message": "Unknown control "s1".",
            "severity": "error",
            "tags": [
              "fatal",
            ],
            "targetId": "derived_input",
          },
          {
            "id": "issue_2",
            "message": "Self reference unavailable for this input.",
            "severity": "error",
            "tags": [
              "fatal",
            ],
            "targetId": "component_1",
          },
          {
            "id": "issue_3",
            "message": "Reserved variable "self" is unavailable for this binding.",
            "severity": "error",
            "tags": [
              "fatal",
            ],
            "targetId": "component_1",
          },
        ],
        "metadata": {
          "registryVersion": "1.0.0",
          "source": "graphBuilder",
        },
        "nodes": [
          {
            "id": "input_input_a",
            "inputDefaults": undefined,
            "params": {
              "path": "rig/robot/controls/a",
              "value": {
                "float": 0,
              },
            },
            "type": "input",
          },
          {
            "id": "remap_derived_input_s1",
            "inputDefaults": {
              "in_anchor": 0,
              "in_high": 1,
              "in_low": -1,
              "out_anchor": 0,
              "out_high": 1,
              "out_low": -1,
            },
            "params": undefined,
            "type": "centered_remap",
          },
          {
            "id": "time_derived_input_0",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "deltaTime_derived_input_1",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "frame_derived_input_2",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "remap_component_1_slot_a",
            "inputDefaults": {
              "in": 0,
              "in_anchor": 0,
              "in_high": 1,
              "in_low": -1,
              "out_anchor": 0,
              "out_high": 1,
              "out_low": -1,
            },
            "params": undefined,
            "type": "centered_remap",
          },
          {
            "id": "const_component_1_1",
            "inputDefaults": undefined,
            "params": {
              "value": 0,
            },
            "type": "constant",
          },
          {
            "id": "time_component_1_0",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "deltaTime_component_1_1",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "frame_component_1_2",
            "inputDefaults": undefined,
            "params": undefined,
            "type": "time",
          },
          {
            "id": "out_rig_robot_mouth_pos_y",
            "inputDefaults": undefined,
            "params": {
              "path": "rig/robot/mouth/pos/y",
            },
            "type": "output",
          },
        ],
        "summary": {
          "bindings": [
            {
              "animatableId": "derived_input",
              "component": undefined,
              "expression": "s1",
              "inputId": "input_a",
              "issues": [
                "Unknown control "s1".",
              ],
              "operators": [
                {
                  "enabled": false,
                  "params": {
                    "damping": 20,
                    "mass": 1,
                    "stiffness": 120,
                  },
                  "type": "spring",
                },
                {
                  "enabled": false,
                  "params": {
                    "half_life": 0.2,
                  },
                  "type": "damp",
                },
                {
                  "enabled": false,
                  "params": {
                    "max_rate": 1,
                  },
                  "type": "slew",
                },
              ],
              "remap": {
                "inAnchor": 0,
                "inHigh": 1,
                "inLow": -1,
                "outAnchor": 0,
                "outHigh": 1,
                "outLow": -1,
              },
              "slotAlias": "self",
              "slotId": "s1",
              "targetId": "derived_input",
              "valueType": "scalar",
            },
            {
              "animatableId": "derived_input",
              "component": undefined,
              "expression": "s1",
              "inputId": null,
              "issues": [
                "Unknown control "s1".",
              ],
              "operators": [
                {
                  "enabled": false,
                  "params": {
                    "damping": 20,
                    "mass": 1,
                    "stiffness": 120,
                  },
                  "type": "spring",
                },
                {
                  "enabled": false,
                  "params": {
                    "half_life": 0.2,
                  },
                  "type": "damp",
                },
                {
                  "enabled": false,
                  "params": {
                    "max_rate": 1,
                  },
                  "type": "slew",
                },
              ],
              "remap": {
                "inAnchor": 0,
                "inHigh": 1,
                "inLow": -1,
                "outAnchor": 0,
                "outHigh": 1,
                "outLow": -1,
              },
              "slotAlias": "s2",
              "slotId": "s2",
              "targetId": "derived_input",
              "valueType": "scalar",
            },
            {
              "animatableId": "rig/robot/mouth/pos/y",
              "component": undefined,
              "expression": "A + self",
              "inputId": "derived_input",
              "issues": [
                "Self reference unavailable for this input.",
                "Reserved variable "self" is unavailable for this binding.",
              ],
              "operators": [
                {
                  "enabled": false,
                  "params": {
                    "damping": 20,
                    "mass": 1,
                    "stiffness": 120,
                  },
                  "type": "spring",
                },
                {
                  "enabled": false,
                  "params": {
                    "half_life": 0.2,
                  },
                  "type": "damp",
                },
                {
                  "enabled": false,
                  "params": {
                    "max_rate": 1,
                  },
                  "type": "slew",
                },
              ],
              "remap": {
                "inAnchor": 0,
                "inHigh": 1,
                "inLow": -1,
                "outAnchor": 0,
                "outHigh": 1,
                "outLow": -1,
              },
              "slotAlias": "A",
              "slotId": "slot_a",
              "targetId": "component_1",
              "valueType": "scalar",
            },
            {
              "animatableId": "rig/robot/mouth/pos/y",
              "component": undefined,
              "expression": "A + self",
              "inputId": "__self__",
              "issues": [
                "Self reference unavailable for this input.",
                "Reserved variable "self" is unavailable for this binding.",
              ],
              "operators": [
                {
                  "enabled": false,
                  "params": {
                    "damping": 20,
                    "mass": 1,
                    "stiffness": 120,
                  },
                  "type": "spring",
                },
                {
                  "enabled": false,
                  "params": {
                    "half_life": 0.2,
                  },
                  "type": "damp",
                },
                {
                  "enabled": false,
                  "params": {
                    "max_rate": 1,
                  },
                  "type": "slew",
                },
              ],
              "remap": {
                "inAnchor": 0,
                "inHigh": 1,
                "inLow": -1,
                "outAnchor": 0,
                "outHigh": 1,
                "outLow": -1,
              },
              "slotAlias": "B",
              "slotId": "slot_b",
              "targetId": "component_1",
              "valueType": "scalar",
            },
          ],
          "faceId": "robot",
          "inputs": [
            "rig/robot/controls/a",
            "rig/robot/controls/derived",
          ],
          "outputs": [
            "rig/robot/mouth/pos/y",
            "derived_input",
          ],
        },
      }
    `);
  });
});
