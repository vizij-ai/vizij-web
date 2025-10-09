import type { FaceConfig } from "../data/faces";

export type BasicEmotion =
  | "joy"
  | "sadness"
  | "anger"
  | "fear"
  | "surprise"
  | "disgust";

export const BASIC_EMOTIONS: BasicEmotion[] = [
  "joy",
  "sadness",
  "anger",
  "fear",
  "surprise",
  "disgust",
];

export type PoseValue = {
  /** Blackboard path that the emotion graph should write to. */
  path: string;
  /** Target value for the pose under the current emotion or baseline. */
  value: number;
};

export type EmotionTargetPreset = {
  target: BasicEmotion;
  poses: PoseValue[];
};

export type FaceExpressionConfig = {
  baseline: PoseValue[];
  emotions: EmotionTargetPreset[];
};

type FaceExpressionMap = Record<string, FaceExpressionConfig>;

const QUORI_BASELINE: PoseValue[] = [
  { path: "rig/quori/mouth/morph", value: 0 },
  { path: "rig/quori/mouth/pos/x", value: 0 },
  { path: "rig/quori/mouth/pos/y", value: 0 },
  { path: "rig/quori/mouth/scale/x", value: 1 },
  { path: "rig/quori/mouth/scale/y", value: 1 },
  { path: "rig/quori/left_eye_top_eyelid/pos/y", value: 0 },
  { path: "rig/quori/left_eye_top_eyelid/rot/z", value: 0 },
  { path: "rig/quori/right_eye_top_eyelid/pos/y", value: 0 },
  { path: "rig/quori/right_eye_top_eyelid/rot/z", value: 0 },
  { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: 0 },
  { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: 0 },
  { path: "rig/quori/left_eye_highlight/scale/x", value: 1 },
  { path: "rig/quori/left_eye_highlight/scale/y", value: 1 },
  { path: "rig/quori/right_eye_highlight/scale/x", value: 1 },
  { path: "rig/quori/right_eye_highlight/scale/y", value: 1 },
];

const QUORI_EMOTIONS: EmotionTargetPreset[] = [
  {
    target: "joy",
    poses: [
      { path: "rig/quori/mouth/pos/x", value: -0.006 },
      { path: "rig/quori/mouth/pos/y", value: -0.03 },
      { path: "rig/quori/mouth/scale/x", value: 3.1 },
      { path: "rig/quori/mouth/scale/y", value: 5 },
      { path: "rig/quori/mouth/morph", value: -0.36 },
      { path: "rig/quori/left_eye/pos/x", value: -0.006 },
      { path: "rig/quori/left_eye/pos/y", value: 0 },
      { path: "rig/quori/left_eye_highlight/scale/x", value: 1.6 },
      { path: "rig/quori/left_eye_highlight/scale/y", value: 0.85 },
      { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: 0 },
      { path: "rig/quori/left_eye_bottom_eyelid/rot/z", value: -0.032 },
      { path: "rig/quori/left_eye_bottom_eyelid_curve/scale/y", value: 1.15 },
      { path: "rig/quori/left_eye_top_eyelid/pos/y", value: 0 },
      { path: "rig/quori/left_eye_top_eyelid/rot/z", value: -0.096 },
      { path: "rig/quori/right_eye/pos/x", value: 0.006 },
      { path: "rig/quori/right_eye/pos/y", value: 0.006 },
      { path: "rig/quori/right_eye_highlight/scale/x", value: 1 },
      { path: "rig/quori/right_eye_highlight/scale/y", value: 0.95 },
      { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: 0 },
      { path: "rig/quori/right_eye_bottom_eyelid/rot/z", value: -0.032 },
      { path: "rig/quori/right_eye_bottom_eyelid_curve/scale/y", value: 1.2 },
      { path: "rig/quori/right_eye_top_eyelid/pos/y", value: 0.006 },
      { path: "rig/quori/right_eye_top_eyelid/rot/z", value: 0 },
    ],
  },
  {
    target: "sadness",
    poses: [
      { path: "rig/quori/mouth/pos/x", value: 0.05 },
      { path: "rig/quori/mouth/pos/y", value: -0.02 },
      { path: "rig/quori/mouth/scale/x", value: 1.62 },
      { path: "rig/quori/mouth/scale/y", value: 1 },
      { path: "rig/quori/mouth/morph", value: 1.97 },
      { path: "rig/quori/left_eye/pos/x", value: 0.02 },
      { path: "rig/quori/left_eye/pos/y", value: -0.03 },
      { path: "rig/quori/left_eye_highlight/scale/x", value: 0.76 },
      { path: "rig/quori/left_eye_highlight/scale/y", value: 0.68 },
      { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: -0.01 },
      { path: "rig/quori/left_eye_bottom_eyelid/rot/z", value: -0.05 },
      { path: "rig/quori/left_eye_bottom_eyelid_curve/scale/y", value: 1 },
      { path: "rig/quori/left_eye_top_eyelid/pos/y", value: -0.03 },
      { path: "rig/quori/left_eye_top_eyelid/rot/z", value: -0.01 },
      { path: "rig/quori/right_eye/pos/x", value: 0.03 },
      { path: "rig/quori/right_eye/pos/y", value: -0.03 },
      { path: "rig/quori/right_eye_highlight/scale/x", value: 0.82 },
      { path: "rig/quori/right_eye_highlight/scale/y", value: 0.88 },
      { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: -0.02 },
      { path: "rig/quori/right_eye_bottom_eyelid/rot/z", value: 0.12 },
      { path: "rig/quori/right_eye_bottom_eyelid_curve/scale/y", value: 1 },
      { path: "rig/quori/right_eye_top_eyelid/pos/y", value: -0.03 },
      { path: "rig/quori/right_eye_top_eyelid/rot/z", value: 0 },
    ],
  },
  {
    target: "anger",
    poses: [
      { path: "rig/quori/mouth/pos/x", value: 0 },
      { path: "rig/quori/mouth/pos/y", value: 0 },
      { path: "rig/quori/mouth/scale/x", value: 2.45 },
      { path: "rig/quori/mouth/scale/y", value: 3.5 },
      { path: "rig/quori/mouth/morph", value: 0.9 },
      { path: "rig/quori/left_eye/pos/x", value: -0.012 },
      { path: "rig/quori/left_eye/pos/y", value: -0.006 },
      { path: "rig/quori/left_eye_highlight/scale/x", value: 0.45 },
      { path: "rig/quori/left_eye_highlight/scale/y", value: 1 },
      { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: 0 },
      { path: "rig/quori/left_eye_bottom_eyelid/rot/z", value: -0.192 },
      { path: "rig/quori/left_eye_bottom_eyelid_curve/scale/y", value: 1.2 },
      { path: "rig/quori/left_eye_top_eyelid/pos/y", value: -0.006 },
      { path: "rig/quori/left_eye_top_eyelid/rot/z", value: 0.096 },
      { path: "rig/quori/right_eye/pos/x", value: 0.024 },
      { path: "rig/quori/right_eye/pos/y", value: 0 },
      { path: "rig/quori/right_eye_highlight/scale/x", value: 0.3 },
      { path: "rig/quori/right_eye_highlight/scale/y", value: 1.1 },
      { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: 0.006 },
      { path: "rig/quori/right_eye_bottom_eyelid/rot/z", value: 0.224 },
      { path: "rig/quori/right_eye_bottom_eyelid_curve/scale/y", value: 1.05 },
      { path: "rig/quori/right_eye_top_eyelid/pos/y", value: 0 },
      { path: "rig/quori/right_eye_top_eyelid/rot/z", value: -0.192 },
    ],
  },
  {
    target: "fear",
    poses: [
      { path: "rig/quori/mouth/pos/x", value: 0 },
      { path: "rig/quori/mouth/pos/y", value: -0.048 },
      { path: "rig/quori/mouth/scale/x", value: 0.85 },
      { path: "rig/quori/mouth/scale/y", value: 6.95 },
      { path: "rig/quori/mouth/morph", value: 0.42 },
      { path: "rig/quori/left_eye/pos/x", value: 0 },
      { path: "rig/quori/left_eye/pos/y", value: 0 },
      { path: "rig/quori/left_eye_highlight/scale/x", value: 1.8 },
      { path: "rig/quori/left_eye_highlight/scale/y", value: 1 },
      { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: -0.018 },
      { path: "rig/quori/left_eye_bottom_eyelid/rot/z", value: 0 },
      { path: "rig/quori/left_eye_bottom_eyelid_curve/scale/y", value: 1 },
      { path: "rig/quori/left_eye_top_eyelid/pos/y", value: 0.018 },
      { path: "rig/quori/left_eye_top_eyelid/rot/z", value: -0.16 },
      { path: "rig/quori/right_eye/pos/x", value: 0 },
      { path: "rig/quori/right_eye/pos/y", value: 0 },
      { path: "rig/quori/right_eye_highlight/scale/x", value: 2.95 },
      { path: "rig/quori/right_eye_highlight/scale/y", value: 1 },
      { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: -0.024 },
      { path: "rig/quori/right_eye_bottom_eyelid/rot/z", value: 0.224 },
      { path: "rig/quori/right_eye_bottom_eyelid_curve/scale/y", value: 1.65 },
      { path: "rig/quori/right_eye_top_eyelid/pos/y", value: 0.012 },
      { path: "rig/quori/right_eye_top_eyelid/rot/z", value: -0.16 },
    ],
  },
  {
    target: "surprise",
    poses: [
      { path: "rig/quori/mouth/pos/x", value: 0 },
      { path: "rig/quori/mouth/pos/y", value: 0 },
      { path: "rig/quori/mouth/scale/x", value: 0.25 },
      { path: "rig/quori/mouth/scale/y", value: 2.4 },
      { path: "rig/quori/mouth/morph", value: 0.54 },
      { path: "rig/quori/left_eye/pos/x", value: -0.024 },
      { path: "rig/quori/left_eye/pos/y", value: -0.018 },
      { path: "rig/quori/left_eye_highlight/scale/x", value: 1.2 },
      { path: "rig/quori/left_eye_highlight/scale/y", value: 1 },
      { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: -0.024 },
      { path: "rig/quori/left_eye_bottom_eyelid/rot/z", value: -0.256 },
      { path: "rig/quori/left_eye_bottom_eyelid_curve/scale/y", value: 1.05 },
      { path: "rig/quori/left_eye_top_eyelid/pos/y", value: 0.018 },
      { path: "rig/quori/left_eye_top_eyelid/rot/z", value: 0 },
      { path: "rig/quori/right_eye/pos/x", value: -0.024 },
      { path: "rig/quori/right_eye/pos/y", value: -0.012 },
      { path: "rig/quori/right_eye_highlight/scale/x", value: 1.15 },
      { path: "rig/quori/right_eye_highlight/scale/y", value: 1 },
      { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: -0.018 },
      { path: "rig/quori/right_eye_bottom_eyelid/rot/z", value: -0.224 },
      { path: "rig/quori/right_eye_bottom_eyelid_curve/scale/y", value: 1.65 },
      { path: "rig/quori/right_eye_top_eyelid/pos/y", value: 0.018 },
      { path: "rig/quori/right_eye_top_eyelid/rot/z", value: -0.064 },
    ],
  },
  {
    target: "disgust",
    poses: [
      { path: "rig/quori/mouth/pos/x", value: 0 },
      { path: "rig/quori/mouth/pos/y", value: 0 },
      { path: "rig/quori/mouth/scale/x", value: 2.4 },
      { path: "rig/quori/mouth/scale/y", value: 2.9 },
      { path: "rig/quori/mouth/morph", value: 2.4 },
      { path: "rig/quori/left_eye/pos/x", value: -0.024 },
      { path: "rig/quori/left_eye/pos/y", value: -0.018 },
      { path: "rig/quori/left_eye_highlight/scale/x", value: 0.75 },
      { path: "rig/quori/left_eye_highlight/scale/y", value: 1.15 },
      { path: "rig/quori/left_eye_bottom_eyelid/pos/y", value: 0 },
      { path: "rig/quori/left_eye_bottom_eyelid/rot/z", value: -0.256 },
      { path: "rig/quori/left_eye_bottom_eyelid_curve/scale/y", value: 0.7 },
      { path: "rig/quori/left_eye_top_eyelid/pos/y", value: -0.012 },
      { path: "rig/quori/left_eye_top_eyelid/rot/z", value: 0 },
      { path: "rig/quori/right_eye/pos/x", value: -0.024 },
      { path: "rig/quori/right_eye/pos/y", value: 0 },
      { path: "rig/quori/right_eye_highlight/scale/x", value: 0.45 },
      { path: "rig/quori/right_eye_highlight/scale/y", value: 1 },
      { path: "rig/quori/right_eye_bottom_eyelid/pos/y", value: 0 },
      { path: "rig/quori/right_eye_bottom_eyelid/rot/z", value: -0.224 },
      { path: "rig/quori/right_eye_bottom_eyelid_curve/scale/y", value: 1.85 },
      { path: "rig/quori/right_eye_top_eyelid/pos/y", value: 0.012 },
      { path: "rig/quori/right_eye_top_eyelid/rot/z", value: -0.384 },
    ],
  },
];

const HUGO_BASELINE: PoseValue[] = [
  { path: "rig/hugo/mouth/morph", value: 0 },
  { path: "rig/hugo/mouth/pos/x", value: 0 },
  { path: "rig/hugo/mouth/pos/y", value: 0 },
  { path: "rig/hugo/mouth/scale/x", value: 1 },
  { path: "rig/hugo/mouth/scale/y", value: 1 },
  { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: 0 },
  { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: 0 },
  { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: 0 },
  { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: 0 },
  { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: 0 },
  { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: 0 },
  { path: "rig/hugo/left_eye_brow/pos/y", value: 0 },
  { path: "rig/hugo/right_eye_brow/pos/y", value: 0 },
];

const HUGO_EMOTIONS: EmotionTargetPreset[] = [
  {
    target: "joy",
    poses: [
      { path: "rig/hugo/mouth/morph", value: 0.65 },
      { path: "rig/hugo/mouth/pos/x", value: 0.015 },
      { path: "rig/hugo/mouth/pos/y", value: 0.06 },
      { path: "rig/hugo/mouth/scale/x", value: 1.12 },
      { path: "rig/hugo/mouth/scale/y", value: 1.05 },
      { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: -0.035 },
      { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: -0.08 },
      { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: -0.035 },
      { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: -0.08 },
      { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: 0.035 },
      { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: 0.035 },
      { path: "rig/hugo/left_eye_brow/pos/y", value: 0.02 },
      { path: "rig/hugo/right_eye_brow/pos/y", value: 0.02 },
    ],
  },
  {
    target: "sadness",
    poses: [
      { path: "rig/hugo/mouth/morph", value: -0.45 },
      { path: "rig/hugo/mouth/pos/y", value: -0.04 },
      { path: "rig/hugo/mouth/scale/x", value: 0.93 },
      { path: "rig/hugo/mouth/scale/y", value: 0.88 },
      { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: 0.05 },
      { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: 0.06 },
      { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: 0.05 },
      { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: 0.06 },
      { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: -0.02 },
      { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: -0.02 },
      { path: "rig/hugo/left_eye_brow/pos/y", value: 0.08 },
      { path: "rig/hugo/right_eye_brow/pos/y", value: 0.08 },
    ],
  },
  {
    target: "anger",
    poses: [
      { path: "rig/hugo/mouth/morph", value: 0.25 },
      { path: "rig/hugo/mouth/pos/x", value: -0.05 },
      { path: "rig/hugo/mouth/pos/y", value: 0.025 },
      { path: "rig/hugo/mouth/scale/x", value: 1.06 },
      { path: "rig/hugo/mouth/scale/y", value: 0.94 },
      { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: -0.055 },
      { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: -0.12 },
      { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: -0.06 },
      { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: -0.13 },
      { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: 0.05 },
      { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: 0.055 },
      { path: "rig/hugo/left_eye_brow/pos/y", value: -0.06 },
      { path: "rig/hugo/right_eye_brow/pos/y", value: -0.06 },
    ],
  },
  {
    target: "fear",
    poses: [
      { path: "rig/hugo/mouth/morph", value: 0.35 },
      { path: "rig/hugo/mouth/pos/y", value: 0.08 },
      { path: "rig/hugo/mouth/scale/x", value: 1.08 },
      { path: "rig/hugo/mouth/scale/y", value: 1.02 },
      { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: 0.08 },
      { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: 0.04 },
      { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: 0.08 },
      { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: 0.05 },
      { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: 0.1 },
      { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: 0.1 },
      { path: "rig/hugo/left_eye_brow/pos/y", value: 0.05 },
      { path: "rig/hugo/right_eye_brow/pos/y", value: 0.05 },
    ],
  },
  {
    target: "surprise",
    poses: [
      { path: "rig/hugo/mouth/morph", value: 0.55 },
      { path: "rig/hugo/mouth/pos/y", value: 0.13 },
      { path: "rig/hugo/mouth/scale/x", value: 1.15 },
      { path: "rig/hugo/mouth/scale/y", value: 1.12 },
      { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: 0.11 },
      { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: 0.05 },
      { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: 0.12 },
      { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: 0.06 },
      { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: 0.08 },
      { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: 0.08 },
      { path: "rig/hugo/left_eye_brow/pos/y", value: 0.09 },
      { path: "rig/hugo/right_eye_brow/pos/y", value: 0.09 },
    ],
  },
  {
    target: "disgust",
    poses: [
      { path: "rig/hugo/mouth/morph", value: -0.35 },
      { path: "rig/hugo/mouth/pos/x", value: 0.035 },
      { path: "rig/hugo/mouth/pos/y", value: -0.045 },
      { path: "rig/hugo/mouth/scale/x", value: 0.9 },
      { path: "rig/hugo/mouth/scale/y", value: 0.82 },
      { path: "rig/hugo/left_eye_top_eyelid/pos/y", value: -0.025 },
      { path: "rig/hugo/left_eye_top_eyelid/rot/z", value: -0.06 },
      { path: "rig/hugo/right_eye_top_eyelid/pos/y", value: -0.025 },
      { path: "rig/hugo/right_eye_top_eyelid/rot/z", value: -0.07 },
      { path: "rig/hugo/left_eye_bottom_eyelid/pos/y", value: 0.02 },
      { path: "rig/hugo/right_eye_bottom_eyelid/pos/y", value: 0.025 },
      { path: "rig/hugo/left_eye_brow/pos/y", value: -0.03 },
      { path: "rig/hugo/right_eye_brow/pos/y", value: -0.03 },
    ],
  },
];

const FACE_EXPRESSION_CONFIGS: FaceExpressionMap = {
  quori: {
    baseline: QUORI_BASELINE,
    emotions: QUORI_EMOTIONS,
  },
  hugo: {
    baseline: HUGO_BASELINE,
    emotions: HUGO_EMOTIONS,
  },
};

export function getFaceExpressionConfig(
  faceId: FaceConfig["id"],
): FaceExpressionConfig | null {
  return FACE_EXPRESSION_CONFIGS[faceId] ?? null;
}
