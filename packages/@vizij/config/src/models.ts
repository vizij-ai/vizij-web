import { Archetype as ChannelArchetype } from "./channel";

export const VizijStandardControlVector = {
  mouth: ChannelArchetype.MOUTH.tracks,
  left_eye: ChannelArchetype.TXY.tracks,
  right_eye: ChannelArchetype.TXY.tracks,
  left_eye_highlight: ChannelArchetype.SXY.tracks,
  right_eye_highlight: ChannelArchetype.SXY.tracks,
  left_eye_bottom_eyelid: ChannelArchetype.TY_RZ.tracks,
  right_eye_bottom_eyelid: ChannelArchetype.TY_RZ.tracks,
  left_eye_bottom_eyelid_curve: ChannelArchetype.SY.tracks,
  right_eye_bottom_eyelid_curve: ChannelArchetype.SY.tracks,
  left_eye_top_eyelid: ChannelArchetype.TY_RZ.tracks,
  right_eye_top_eyelid: ChannelArchetype.TY_RZ.tracks,
  left_eye_brow: ChannelArchetype.TY_RZ_SX.tracks,
  right_eye_brow: ChannelArchetype.TY_RZ_SX.tracks,
};

export type VizijMouthRigDeprecated = {
  rootId: string;
  scaleId: string;
  morphId: string;
  loadedAnimatables: Record<string, any>;
};

export type VisemeRigMapping = {
  rootId: string;
  scaleId: string;
  morphId: string;
};

export const QuoriBounds = {
  center: {
    x: 0.01,
    y: -0.04,
  },
  size: {
    x: 0.6,
    y: 0.4,
  },
};

export const HugoBounds = {
  center: {
    x: 0,
    y: 0,
  },
  size: {
    x: 4,
    y: 5,
  },
};

export const quoriSearch = {
  scale: "Plane scale",
  morph: "Plane Key 1",
};

export const hugoSearch = {
  scale: "Mouth scale",
  morph: "Mouth Key 1",
};
