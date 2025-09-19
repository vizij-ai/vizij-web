import type { GraphSpec } from "@vizij/node-graph-wasm";

const simpleUrdf = `
<robot name="planar_arm">
  <link name="base_link" />
  <link name="link1" />
  <link name="link2" />
  <link name="link3" />
  <link name="link4" />
  <link name="link5" />
  <link name="link6" />
  <link name="tool" />

  <joint name="joint1" type="revolute">
    <parent link="base_link" />
    <child link="link1" />
    <origin xyz="0 0 1.5" rpy="0 0 0" />
    <axis xyz="0 0 1" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint2" type="revolute">
    <parent link="link1" />
    <child link="link2" />
    <origin xyz="2.5 0 0" rpy="0 0 0" />
    <axis xyz="0 1 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint3" type="revolute">
    <parent link="link2" />
    <child link="link3" />
    <origin xyz="2.5 0 0" rpy="0 0 0" />
    <axis xyz="1 0 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint4" type="revolute">
    <parent link="link3" />
    <child link="link4" />
    <origin xyz="2.5 0 0" rpy="0 0 0" />
    <axis xyz="0 0 1" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint5" type="revolute">
    <parent link="link4" />
    <child link="link5" />
    <origin xyz="1.55 0 0" rpy="0 0 0" />
    <axis xyz="0 1 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="joint6" type="revolute">
    <parent link="link5" />
    <child link="link6" />
    <origin xyz="1.5 0 0" rpy="0 0 0" />
    <axis xyz="1 0 0" />
    <limit lower="-3.1416" upper="3.1416" effort="1" velocity="1" />
  </joint>

  <joint name="tool_joint" type="fixed">
    <parent link="link6" />
    <child link="tool" />
    <origin xyz="1.5 0 0" rpy="0 0 0" />
  </joint>
</robot>
`;

/**
 * Return the local URDF IK Position GraphSpec.
 * This is the only local sample; other samples should be loaded from @vizij/node-graph-wasm.
 */
export function getLocalUrdfSpec(): GraphSpec {
  return {
    nodes: [
      {
        id: "target_pos",
        type: "input",
        params: {
          path: "samples/pair",
          value: {
            vec3: [0.0, 2, 0.0],
          },
        },
      },
      {
        id: "seed",
        type: "vectorconstant",
        params: { value: { vector: [0.3, -0.45, 0.35, 0.15, -0.2, 0.18] } },
      },
      {
        id: "ik",
        type: "urdfikposition",
        params: {
          urdf_xml: simpleUrdf.trim(),
          root_link: "base_link",
          tip_link: "tool",
          max_iters: 200,
          tol_pos: 0.01,
        },
        inputs: {
          target_pos: { node_id: "target_pos", output_key: "out" },
          seed: { node_id: "seed", output_key: "out" },
        },
      },
      {
        id: "out",
        type: "output",
        params: { path: "samples/urdf.angles" },
        inputs: { in: { node_id: "ik", output_key: "out" } },
      },
    ],
  };
}
