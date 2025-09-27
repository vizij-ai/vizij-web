import type { GraphSpec } from "@vizij/node-graph-wasm";
import { ikPaths } from "./ikAnimation";

export const ikGraphSpec: GraphSpec = {
  nodes: [
    {
      id: "target_in",
      type: "input",
      params: {
        path: ikPaths.target,
        value: { vec3: [0.3, 0.2, 0.4] },
      },
    },
    { id: "idx_x", type: "constant", params: { value: 0 } },
    { id: "idx_y", type: "constant", params: { value: 1 } },
    { id: "idx_z", type: "constant", params: { value: 2 } },
    {
      id: "target_length",
      type: "vectorlength",
      inputs: { in: { node_id: "target_in" } },
    },
    {
      id: "shoulder_gain",
      type: "constant",
      params: { value: 0.8 },
    },
    {
      id: "elbow_gain",
      type: "constant",
      params: { value: 1.1 },
    },
    {
      id: "wrist_gain",
      type: "constant",
      params: { value: 0.6 },
    },
    {
      id: "target_x",
      type: "vectorindex",
      inputs: { v: { node_id: "target_in" }, index: { node_id: "idx_x" } },
    },
    {
      id: "target_y",
      type: "vectorindex",
      inputs: { v: { node_id: "target_in" }, index: { node_id: "idx_y" } },
    },
    {
      id: "target_z",
      type: "vectorindex",
      inputs: { v: { node_id: "target_in" }, index: { node_id: "idx_z" } },
    },
    {
      id: "shoulder_angle",
      type: "multiply",
      inputs: {
        operands_1: { node_id: "target_length" },
        operands_2: { node_id: "shoulder_gain" },
      },
    },
    {
      id: "elbow_angle",
      type: "multiply",
      inputs: {
        operands_1: { node_id: "target_y" },
        operands_2: { node_id: "elbow_gain" },
      },
    },
    {
      id: "wrist_angle",
      type: "multiply",
      inputs: {
        operands_1: { node_id: "target_z" },
        operands_2: { node_id: "wrist_gain" },
      },
    },
    {
      id: "reach_out",
      type: "output",
      params: { path: ikPaths.reach },
      inputs: { in: { node_id: "target_length" } },
    },
    {
      id: "shoulder_out",
      type: "output",
      params: { path: ikPaths.shoulder },
      inputs: { in: { node_id: "shoulder_angle" } },
    },
    {
      id: "elbow_out",
      type: "output",
      params: { path: ikPaths.elbow },
      inputs: { in: { node_id: "elbow_angle" } },
    },
    {
      id: "wrist_out",
      type: "output",
      params: { path: ikPaths.wrist },
      inputs: { in: { node_id: "wrist_angle" } },
    },
  ],
};
