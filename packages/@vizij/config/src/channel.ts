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

export namespace Archetype {
  // Predefined archetypes
  export const MOUTH: ChannelArchetype = {
    name: "mouth",
    tracks: ["x_pos", "y_pos", "x_scale", "y_scale", "morph"] as const,
  };

  export const TXY: ChannelArchetype = {
    name: "translate_xy",
    tracks: ["x_pos", "y_pos"] as const,
  };

  export const SXY: ChannelArchetype = {
    name: "scale_xy",
    tracks: ["x_scale", "y_scale"] as const,
  };

  export const TY_RZ: ChannelArchetype = {
    name: "ty_rz",
    tracks: ["y_pos", "z_rot"] as const,
  };

  export const SY: ChannelArchetype = {
    name: "scale_y",
    tracks: ["y_scale"] as const,
  };

  export const TY_RZ_SX: ChannelArchetype = {
    name: "ty_rz_sx",
    tracks: ["y_pos", "z_rot", "x_scale"] as const,
  };
}
