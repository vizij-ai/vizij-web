import type { StoredAnimation } from "@vizij/animation-wasm";
import { makeTypedPath } from "../utils/typedPath";

export const JOINT_IDS = [
  "joint1",
  "joint2",
  "joint3",
  "joint4",
  "joint5",
  "joint6",
] as const;

export type JointId = (typeof JOINT_IDS)[number];

export const JOINT_SAMPLES: readonly number[][] = [
  [0, 0, 0, 0, 0, 0],
  [0.2, -0.1, 0.15, -0.2, 0.1, -0.05],
  [-0.25, 0.2, -0.18, 0.22, -0.12, 0.08],
  [0.35, -0.28, 0.24, 0.18, -0.16, 0.12],
  [-0.3, 0.18, 0.12, -0.26, 0.2, -0.14],
] as const;

const jointAnimationPaths = JOINT_IDS.reduce<Record<JointId, string>>(
  (acc, jointId) => {
    acc[jointId] = makeTypedPath(
      "float",
      "rig",
      "joints",
      jointId,
      "animation",
    );
    return acc;
  },
  {} as Record<JointId, string>,
);

const jointOutputPaths = JOINT_IDS.reduce<Record<JointId, string>>(
  (acc, jointId) => {
    acc[jointId] = makeTypedPath("float", "rig", "joints", jointId, "ikResult");
    return acc;
  },
  {} as Record<JointId, string>,
);

export const ikPaths = {
  jointInput: makeTypedPath("vector", "tests", "urdf", "joints"),
  jointAnimation: jointAnimationPaths,
  fkPosition: makeTypedPath("vec3", "tests", "urdf", "fk", "position"),
  fkRotation: makeTypedPath("quat", "tests", "urdf", "fk", "rotation"),
  ikJointOutputs: jointOutputPaths,
} as const;

export const JOINT_COLORS = [
  "#60a5fa",
  "#38bdf8",
  "#22d3ee",
  "#c084fc",
  "#f9a8d4",
  "#f97316",
];

const sampleCount = JOINT_SAMPLES.length;
const durationMs = Math.max(sampleCount - 1, 1) * 1000;

export const ikAnimation: StoredAnimation = {
  name: "FK/IK Replay",
  id: "ik_demo",
  duration: durationMs,
  tracks: JOINT_IDS.map((jointId, jointIdx) => ({
    id: `joint_${jointId}`,
    name: jointId,
    animatableId: jointAnimationPaths[jointId],
    points: JOINT_SAMPLES.map((sample, sampleIdx) => ({
      id: `p_${jointIdx}_${sampleIdx}`,
      stamp: sampleCount > 1 ? sampleIdx / (sampleCount - 1) : 0,
      value: sample[jointIdx] ?? 0,
    })),
    settings: { color: JOINT_COLORS[jointIdx % JOINT_COLORS.length] },
  })),
  groups: {},
};
