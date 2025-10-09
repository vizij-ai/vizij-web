export type Axis = "x" | "y" | "z";

export type AxisMappingConfig = {
  channel: string;
  track: string;
  axis: Axis;
  from: number;
  to: number;
  primary?: boolean;
};

export type FaceGazeMapping = {
  x: AxisMappingConfig[];
  y: AxisMappingConfig[];
};

export const GAZE_MAPPINGS: Record<string, FaceGazeMapping> = {
  hugo: {
    x: [
      {
        channel: "left_eye",
        track: "pos",
        axis: "x",
        from: 1.33,
        to: 1.63,
        primary: true,
      },
      {
        channel: "right_eye",
        track: "pos",
        axis: "x",
        from: -1.48,
        to: -1.13,
      },
    ],
    y: [
      {
        channel: "left_eye",
        track: "pos",
        axis: "y",
        from: 0.2,
        to: 0.4,
        primary: true,
      },
      {
        channel: "right_eye",
        track: "pos",
        axis: "y",
        from: 0.2,
        to: 0.4,
      },
    ],
  },
  quori: {
    x: [
      {
        channel: "left_eye",
        track: "pos",
        axis: "x",
        from: 0.12,
        to: 0.16,
        primary: true,
      },
      {
        channel: "right_eye",
        track: "pos",
        axis: "x",
        from: -0.14,
        to: -0.09,
      },
    ],
    y: [
      {
        channel: "left_eye",
        track: "pos",
        axis: "y",
        from: -0.06,
        to: -0.02,
        primary: true,
      },
      {
        channel: "left_eye_top_eyelid",
        track: "pos",
        axis: "y",
        from: -0.02,
        to: 0,
      },
      {
        channel: "left_eye_bottom_eyelid",
        track: "pos",
        axis: "y",
        from: -0.1,
        to: -0.08,
      },
      {
        channel: "right_eye",
        track: "pos",
        axis: "y",
        from: -0.06,
        to: -0.02,
      },
      {
        channel: "right_eye_top_eyelid",
        track: "pos",
        axis: "y",
        from: -0.01,
        to: 0.01,
      },
      {
        channel: "right_eye_bottom_eyelid",
        track: "pos",
        axis: "y",
        from: -0.09,
        to: -0.07,
      },
    ],
  },
};

export const SUPPORTED_GAZE_FACE_IDS = Object.keys(GAZE_MAPPINGS);

export function getGazeMapping(faceId?: string | null) {
  if (!faceId) {
    return undefined;
  }
  return GAZE_MAPPINGS[faceId];
}

export function buildGazePath(faceId: string, entry: AxisMappingConfig) {
  return `rig/${faceId}/${entry.channel}/${entry.track}/${entry.axis}`;
}

export function getGazeControlledPaths(faceId?: string | null) {
  const mapping = getGazeMapping(faceId);
  if (!mapping) {
    return [];
  }
  const paths = new Set<string>();
  const addEntries = (entries: AxisMappingConfig[]) => {
    entries.forEach((entry) => {
      paths.add(buildGazePath(faceId!, entry));
    });
  };
  addEntries(mapping.x);
  addEntries(mapping.y);
  return Array.from(paths);
}
