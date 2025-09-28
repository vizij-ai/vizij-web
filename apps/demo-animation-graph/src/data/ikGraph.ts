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
      inputs: {
        joints: { node_id: "joint_input" },
      },
    },
    {
      id: "fk_position_out",
      type: "output",
      params: { path: ikPaths.fkPosition },
      inputs: {
        in: { node_id: "fk", output_key: "position" },
      },
    },
    {
      id: "fk_rotation_out",
      type: "output",
      params: { path: ikPaths.fkRotation },
      inputs: {
        in: { node_id: "fk", output_key: "rotation" },
      },
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
      inputs: {
        target_pos: { node_id: "fk", output_key: "position" },
        seed: { node_id: "joint_input" },
      },
    },
    ...JOINT_IDS.map((jointId) => ({
      id: `${jointId}_out`,
      type: "output" as const,
      params: { path: ikPaths.ikJointOutputs[jointId] },
      inputs: {
        in: {
          node_id: "ik_solver",
          selector: [{ field: jointId }],
        },
      },
    })),
  ],
};
