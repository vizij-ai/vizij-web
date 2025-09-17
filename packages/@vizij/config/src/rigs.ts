import { LowLevelRigDefinition } from "./low_rig";

export const HugoLowLevelRig: LowLevelRigDefinition = {
  bounds: {
    center: {
      x: 0,
      y: 0,
    },
    size: {
      x: 4,
      y: 5,
    },
  },
  initialValues: [
    {
      name: "Black_S",
      value: { r: 0, g: 0, b: 0 },
    },
  ],
  channels: {
    mouth: {
      shapeKey: "Mouth",
      tracks: {
        pos: {
          axis: ["x", "y"],
          mapFunc: (rig, channelName, trackName, channelValues) => {
            return rig.scaleV3fTrackValue(
              channelName,
              trackName,
              channelValues,
              {
                x: 1,
                y: 10,
                z: 1,
              },
            );
          },
        },
        scale: { axis: ["x", "y"] },
        morph: { key: "1" },
      },
    },
    left_eye: {
      shapeKey: "L_Eye",
      tracks: {
        pos: { axis: ["x", "y"] },
      },
    },
    left_eye_highlight: {
      shapeKey: "L_EyeHighlight1",
      tracks: {
        scale: { axis: ["x", "y"] },
      },
    },
    left_eye_bottom_eyelid: {
      shapeKey: "L_Eye009",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
      },
    },
    left_eye_top_eyelid: {
      shapeKey: "Plane005",
      tracks: {
        pos: {
          axis: ["y"],
          mapFunc: (rig, channelName, trackName, channelValues) => {
            return rig.scaleV3fTrackValue(
              channelName,
              trackName,
              channelValues,
              {
                x: 1,
                y: 10,
                z: 1,
              },
            );
          },
        },
        rot: { axis: ["z"] },
      },
    },
    left_eye_brow: {
      shapeKey: "L_Brow",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
        scale: { axis: ["x"] },
      },
    },
    right_eye: {
      shapeKey: "R_Eye",
      tracks: {
        pos: { axis: ["x", "y"] },
      },
    },
    right_eye_highlight: {
      shapeKey: "R_EyeHighlight_1",
      tracks: {
        scale: { axis: ["x", "y"] },
      },
    },
    right_eye_bottom_eyelid: {
      shapeKey: "R_Eye009",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
      },
    },
    right_eye_top_eyelid: {
      shapeKey: "Plane006",
      tracks: {
        pos: {
          axis: ["y"],
          mapFunc: (rig, channelName, trackName, channelValues) => {
            return rig.scaleV3fTrackValue(
              channelName,
              trackName,
              channelValues,
              {
                x: 1,
                y: 10,
                z: 1,
              },
            );
          },
        },
        rot: { axis: ["z"] },
      },
    },
    right_eye_brow: {
      shapeKey: "R_Brow",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
        scale: { axis: ["x"] },
      },
    },
  },
};

export const QuoriLowLevelRig: LowLevelRigDefinition = {
  bounds: {
    center: {
      x: 0.01,
      y: -0.04,
    },
    size: {
      x: 0.6,
      y: 0.4,
    },
  },
  channels: {
    mouth: {
      shapeKey: "Plane",
      tracks: {
        pos: { axis: ["x", "y"] },
        scale: { axis: ["x", "y"] },
        morph: { key: "1" },
      },
    },
    left_eye: {
      shapeKey: "L_Eye",
      tracks: {
        pos: { axis: ["x", "y"] },
      },
    },
    left_eye_highlight: {
      shapeKey: "L_EyeHighlight",
      tracks: {
        scale: { axis: ["x", "y"] },
      },
    },
    left_eye_bottom_eyelid: {
      shapeKey: "LB_Lid",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
      },
    },
    left_eye_bottom_eyelid_curve: {
      shapeKey: "LB_LidCurve",
      tracks: {
        scale: { axis: ["y"] },
      },
    },
    left_eye_top_eyelid: {
      shapeKey: "LT_Lid",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
      },
    },
    right_eye: {
      shapeKey: "R_Eye",
      tracks: {
        pos: { axis: ["x", "y"] },
      },
    },
    right_eye_highlight: {
      shapeKey: "R_EyeHighlight",
      tracks: {
        scale: { axis: ["x", "y"] },
      },
    },
    right_eye_bottom_eyelid: {
      shapeKey: "RB_Lid",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
      },
    },
    right_eye_bottom_eyelid_curve: {
      shapeKey: "RB_LidCurve",
      tracks: {
        scale: { axis: ["y"] },
      },
    },
    right_eye_top_eyelid: {
      shapeKey: "RT_Lid",
      tracks: {
        pos: { axis: ["y"] },
        rot: { axis: ["z"] },
      },
    },
  },
};
