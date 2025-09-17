import { VizijStandardControlVector } from "./models";
import { Pose } from "./pose";

export type Viseme =
  | "sil"
  | "p"
  | "t"
  | "T"
  | "s"
  | "S"
  | "f"
  | "k"
  | "l"
  | "r"
  | "a"
  | "@"
  | "e"
  | "E"
  | "i"
  | "o"
  | "O"
  | "u";

// Convert visemes to Pose objects using the existing VizijStandardControlVector
// Only the mouth channel tracks (x_scale, y_scale, morph) will be set, others remain null
export const visemePoses: { [key in Viseme]: Pose } = {
  sil: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1,
    "mouth.y_scale": 1,
    "mouth.morph": 0,
  }),
  p: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.82,
    "mouth.y_scale": 0.37,
    "mouth.morph": 0.2,
  }),
  t: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1,
    "mouth.y_scale": 2.77,
    "mouth.morph": 0.35,
  }),
  T: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1,
    "mouth.y_scale": 2.77,
    "mouth.morph": 0.35,
  }),
  s: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1.6,
    "mouth.y_scale": 2.2,
    "mouth.morph": 0.2,
  }),
  S: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1.6,
    "mouth.y_scale": 2.2,
    "mouth.morph": 0.2,
  }),
  f: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.7,
    "mouth.y_scale": 3.18,
    "mouth.morph": 0.9,
  }),
  k: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1.2,
    "mouth.y_scale": 2.9,
    "mouth.morph": 0.2,
  }),
  l: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.79,
    "mouth.y_scale": 3.7,
    "mouth.morph": 0.35,
  }),
  r: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.85,
    "mouth.y_scale": 2.9,
    "mouth.morph": 0.61,
  }),
  a: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1.18,
    "mouth.y_scale": 5.14,
    "mouth.morph": 0.5,
  }),
  "@": Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.95,
    "mouth.y_scale": 3.3,
    "mouth.morph": 0.61,
  }),
  e: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1,
    "mouth.y_scale": 5,
    "mouth.morph": 0.37,
  }),
  E: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1,
    "mouth.y_scale": 5,
    "mouth.morph": 0.37,
  }),
  i: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 1.7,
    "mouth.y_scale": 3.89,
    "mouth.morph": 0.44,
  }),
  o: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.9,
    "mouth.y_scale": 6,
    "mouth.morph": 0.5,
  }),
  O: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.9,
    "mouth.y_scale": 6,
    "mouth.morph": 0.5,
  }),
  u: Pose.createWith(VizijStandardControlVector, {
    "mouth.x_scale": 0.56,
    "mouth.y_scale": 4.15,
    "mouth.morph": 0.5,
  }),
};

// Backward compatibility - maintain the same API
export const visemeMapper: {
  [key in Viseme]: {
    x_scale: number;
    y_scale: number;
    morph: number;
  };
} = Object.fromEntries(
  Object.entries(visemePoses).map(([key, pose]) => [
    key,
    {
      x_scale: Pose.getValue(pose, "mouth.x_scale") ?? 0,
      y_scale: Pose.getValue(pose, "mouth.y_scale") ?? 0,
      morph: Pose.getValue(pose, "mouth.morph") ?? 0,
    },
  ]),
) as any;
