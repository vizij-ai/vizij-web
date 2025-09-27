import type { StoredAnimation } from "@vizij/animation-wasm";
import { makeTypedPath } from "../utils/typedPath";

export const ikPaths = {
  target: makeTypedPath("vec3", "rig", "hand", "ikTarget"),
  shoulder: makeTypedPath("float", "rig", "joints", "shoulder"),
  elbow: makeTypedPath("float", "rig", "joints", "elbow"),
  wrist: makeTypedPath("float", "rig", "joints", "wristTwist"),
  reach: makeTypedPath("float", "rig", "hand", "reachMagnitude"),
} as const;

export const ikAnimation: StoredAnimation = {
  name: "IK Target Sweep",
  id: "ik_demo",
  duration: 6000,
  tracks: [
    {
      id: "ik_target_track",
      name: "IK Target",
      animatableId: ikPaths.target,
      points: [
        { id: "ik0", stamp: 0.0, value: { x: 0.3, y: 0.2, z: 0.4 } },
        { id: "ik1", stamp: 0.25, value: { x: 0.6, y: 0.1, z: 0.1 } },
        { id: "ik2", stamp: 0.5, value: { x: 0.2, y: 0.6, z: -0.2 } },
        { id: "ik3", stamp: 0.75, value: { x: -0.3, y: 0.4, z: 0.2 } },
        { id: "ik4", stamp: 1.0, value: { x: 0.3, y: 0.2, z: 0.4 } },
      ],
      settings: { color: "#93c5fd" },
    },
  ],
  groups: {},
};
