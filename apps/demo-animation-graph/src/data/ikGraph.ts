import type { GraphSpec } from "@vizij/node-graph-wasm";
import { ikPaths, JOINT_IDS, JOINT_SAMPLES } from "./ikAnimation";

const defaultJointSample = JOINT_SAMPLES[0]
  ? Array.from(JOINT_SAMPLES[0])
  : [0, 0, 0, 0, 0, 0];

export const ikGraphSpec: GraphSpec = {
  nodes: [
    {
      id: "joint_input",
      type: "input",
      params: {
        path: ikPaths.jointInput,
        value: { vector: defaultJointSample },
      },
    },
    {
      id: "fk",
      type: "urdffk",
      params: {
        urdf_xml: "",
        root_link: "",
        tip_link: "",
        joint_defaults: [],
      },
    },
    {
      id: "fk_position_out",
      type: "output",
      params: { path: ikPaths.fkPosition },
    },
    {
      id: "fk_rotation_out",
      type: "output",
      params: { path: ikPaths.fkRotation },
    },
    {
      id: "ik_solver",
      type: "urdfikposition",
      params: {
        urdf_xml: "",
        root_link: "",
        tip_link: "",
        max_iters: 256,
        tol_pos: 0.0005,
      },
    },
    ...JOINT_IDS.map((jointId) => ({
      id: `${jointId}_out`,
      type: "output" as const,
      params: { path: ikPaths.ikJointOutputs[jointId] },
    })),
  ],
  edges: [
    {
      from: { node_id: "joint_input" },
      to: { node_id: "fk", input: "joints" },
    },
    {
      from: { node_id: "fk", output: "position" },
      to: { node_id: "fk_position_out", input: "in" },
    },
    {
      from: { node_id: "fk", output: "rotation" },
      to: { node_id: "fk_rotation_out", input: "in" },
    },
    {
      from: { node_id: "fk", output: "position" },
      to: { node_id: "ik_solver", input: "target_pos" },
    },
    {
      from: { node_id: "joint_input" },
      to: { node_id: "ik_solver", input: "seed" },
    },
    ...JOINT_IDS.map((jointId) => ({
      from: { node_id: "ik_solver" },
      to: { node_id: `${jointId}_out`, input: "in" },
      selector: [{ field: jointId }],
    })),
  ],
};
