import { VizijStandardControlVector } from "./models";
import { Pose } from "./pose";

export type Expression =
  | "neutral"
  | "smile"
  | "frown"
  | "surprise"
  | "anger"
  | "disgust";

// Convert expressions to Pose objects using the existing VizijStandardControlVector
// Only the mouth channel tracks (x_scale, y_scale, morph) will be set, others remain null
export const expressionPoses: { [key in Expression]: Pose } = {
  neutral: Pose.createWith(VizijStandardControlVector, {
    mouth: {
      x_scale: 1.0,
      y_scale: 1.0,
    },
    left_eye_highlight: {
      x_scale: 1.0,
      y_scale: 1.0,
    },
    right_eye_highlight: {
      x_scale: 1.0,
      y_scale: 1.0,
    },
    left_eye_bottom_eyelid_curve: {
      y_scale: 1.0,
    },
    right_eye_bottom_eyelid_curve: {
      y_scale: 1.0,
    },
    left_eye_brow: {
      x_scale: 1.0,
    },
    right_eye_brow: {
      x_scale: 1.0,
    },
  }),

  smile: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 2.5,
    "mouth.y_scale": 3.5,
    "mouth.morph": -2,

    "left_eye_highlight.x_scale": 1.3,
    "left_eye_highlight.y_scale": 1.3,

    "right_eye_highlight.x_scale": 1.3,
    "right_eye_highlight.y_scale": 1.3,

    "left_eye_bottom_eyelid.z_rot": -0.1,
    "right_eye_bottom_eyelid.z_rot": 0.1,

    "left_eye_bottom_eyelid.y_pos": 0.02,
    "right_eye_bottom_eyelid.y_pos": 0.02,

    "left_eye_bottom_eyelid_curve.y_scale": 0.5,
    "right_eye_bottom_eyelid_curve.y_scale": 0.5,

    "left_eye_top_eyelid.y_pos": -0.001,
    "right_eye_top_eyelid.y_pos": -0.001,

    "left_eye_top_eyelid.z_rot": -0.2,
    "right_eye_top_eyelid.z_rot": 0.2,

    "left_eye_brow.y_pos": 0.1,
    "right_eye_brow.y_pos": 0.1,
    "left_eye_brow.z_rot": -0.3,
    "right_eye_brow.z_rot": 0.3,
    "left_eye_brow.x_scale": 1.3,
    "right_eye_brow.x_scale": 1.3,
  }),

  frown: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.8,
    "mouth.y_scale": 3.5,
    "mouth.morph": 3,

    "left_eye_bottom_eyelid.z_rot": -0.15,
    "right_eye_bottom_eyelid.z_rot": 0.15,

    "left_eye_bottom_eyelid.y_pos": 0.02,
    "right_eye_bottom_eyelid.y_pos": 0.02,

    "left_eye_bottom_eyelid_curve.y_scale": 0.7,
    "right_eye_bottom_eyelid_curve.y_scale": 0.7,

    "left_eye_top_eyelid.y_pos": -0.01,
    "right_eye_top_eyelid.y_pos": -0.01,

    "left_eye_top_eyelid.z_rot": -0.3,
    "right_eye_top_eyelid.z_rot": 0.3,

    "left_eye_highlight.y_scale": 0.6,
    "right_eye_highlight.y_scale": 0.6,

    "left_eye_brow.y_pos": 0.2,
    "right_eye_brow.y_pos": 0.2,
    "left_eye_brow.z_rot": -0.4,
    "right_eye_brow.z_rot": 0.4,
    "left_eye_brow.x_scale": 1.3,
    "right_eye_brow.x_scale": 1.3,
  }),

  surprise: Pose.createWith(VizijStandardControlVector, {
    "mouth.y_pos": -0.01,
    "mouth.x_scale": 2,
    "mouth.y_scale": 15,
    "mouth.morph": 0.7,

    "left_eye_highlight.x_scale": 1.5,
    "left_eye_highlight.y_scale": 1.5,

    "right_eye_highlight.x_scale": 1.5,
    "right_eye_highlight.y_scale": 1.5,

    "left_eye_brow.y_pos": 0.2,
    "right_eye_brow.y_pos": 0.2,
    "left_eye_brow.z_rot": -0.1,
    "right_eye_brow.z_rot": 0.1,
  }),

  anger: Pose.createWith(VizijStandardControlVector, {
    "mouth.y_pos": -0.05,
    "mouth.x_scale": 4,
    "mouth.y_scale": 5,
    "mouth.morph": 2,

    "left_eye_bottom_eyelid.z_rot": 0.2,
    "right_eye_bottom_eyelid.z_rot": -0.2,

    "left_eye_bottom_eyelid.y_pos": 0.02,
    "right_eye_bottom_eyelid.y_pos": 0.02,

    "left_eye_bottom_eyelid_curve.y_scale": 0.6,
    "right_eye_bottom_eyelid_curve.y_scale": 0.6,

    "left_eye_top_eyelid.y_pos": -0.015,
    "right_eye_top_eyelid.y_pos": -0.015,

    "left_eye_top_eyelid.z_rot": 0.5,
    "right_eye_top_eyelid.z_rot": -0.5,

    "left_eye_brow.y_pos": -0.1,
    "right_eye_brow.y_pos": -0.1,
    "left_eye_brow.z_rot": 0.4,
    "right_eye_brow.z_rot": -0.4,
    "left_eye_brow.x_scale": 1.5,
    "right_eye_brow.x_scale": 1.5,
  }),

  disgust: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.7,
    "mouth.y_scale": 8,
    "mouth.morph": 0.9,

    "left_eye_top_eyelid.z_rot": 0.2,
    "right_eye_top_eyelid.z_rot": -0.2,

    "left_eye_highlight.x_scale": 0.8,
    "left_eye_highlight.y_scale": 0.6,

    "right_eye_highlight.x_scale": 0.8,
    "right_eye_highlight.y_scale": 0.6,

    "left_eye_bottom_eyelid_curve.y_scale": 0.8,
    "right_eye_bottom_eyelid_curve.y_scale": 0.8,

    "left_eye_bottom_eyelid.y_pos": 0.01,
    "right_eye_bottom_eyelid.y_pos": 0.01,

    "left_eye_bottom_eyelid.z_rot": 0.1,
    "right_eye_bottom_eyelid.z_rot": -0.1,

    "left_eye_brow.y_pos": -0.2,
    "right_eye_brow.y_pos": -0.2,
    "left_eye_brow.z_rot": -0.2,
    "right_eye_brow.z_rot": 0.2,
    "left_eye_brow.x_scale": 2,
    "right_eye_brow.x_scale": 2,
  }),
};

// Backward compatibility - maintain the same API
export const expressionMapper: {
  [key in Expression]: {
    x_scale: number;
    y_scale: number;
    morph: number;
  };
} = Object.fromEntries(
  Object.entries(expressionPoses).map(([key, pose]) => [
    key,
    {
      x_scale: Pose.getValue(pose, "mouth.x_scale") ?? 0,
      y_scale: Pose.getValue(pose, "mouth.y_scale") ?? 0,
      morph: Pose.getValue(pose, "mouth.morph") ?? 0,
    },
  ]),
) as any;
