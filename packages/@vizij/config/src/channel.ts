import { TrackSet } from "./track";

// ChannelSet: collection of channel name -> TrackSet mappings (structure definition)
export type ChannelSet = {
  [channelName: string]: TrackSet;
};

// TrackArchetype: defines specific track sets for different cases (quori, hugo, etc.)
export interface ChannelArchetype {
  name: string;
  tracks: TrackSet;
}

export const Archetype = {
  MOUTH: {
    name: "mouth",
    tracks: ["x_pos", "y_pos", "x_scale", "y_scale", "morph"] as TrackSet,
  },
  TXY: {
    name: "translate_xy",
    tracks: ["x_pos", "y_pos"] as TrackSet,
  },
  SXY: {
    name: "scale_xy",
    tracks: ["x_scale", "y_scale"] as TrackSet,
  },
  TY_RZ: {
    name: "ty_rz",
    tracks: ["y_pos", "z_rot"] as TrackSet,
  },
  SY: {
    name: "scale_y",
    tracks: ["y_scale"] as TrackSet,
  },
  TY_RZ_SX: {
    name: "ty_rz_sx",
    tracks: ["y_pos", "z_rot", "x_scale"] as TrackSet,
  },
} satisfies Record<string, ChannelArchetype>;
