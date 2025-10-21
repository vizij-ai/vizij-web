export type GlbAsset = {
  id: string;
  label: string;
  fileName: string;
  dataUrl: string;
  size: number;
  updatedAt: string;
};

export type GraphAsset = {
  id: string;
  label: string;
  fileName: string;
  spec: Record<string, unknown>;
  updatedAt: string;
};

export type AnimationKeyframe = {
  time: number;
  value: number;
};

export type AnimationTrack = {
  channel: string;
  keyframes: AnimationKeyframe[];
};

export type SimpleAnimationClip = {
  id: string;
  name: string;
  duration: number;
  tracks: AnimationTrack[];
};

export type AnimationAsset = {
  id: string;
  label: string;
  fileName: string;
  clip: SimpleAnimationClip;
  weight: number;
  updatedAt: string;
};

export type RigPreset = {
  id: string;
  name: string;
  values: Record<string, number>;
};

export type AppState = {
  glb: GlbAsset | null;
  lowLevel: GraphAsset | null;
  highLevel: GraphAsset[];
  animations: AnimationAsset[];
  selectedRigIds: string[];
  sliderValues: Record<string, number>;
  rigPresets: Record<string, RigPreset[]>;
  selectedAnimationId: string | null;
};

export const DEFAULT_APP_STATE: AppState = {
  glb: null,
  lowLevel: null,
  highLevel: [],
  animations: [],
  selectedRigIds: [],
  sliderValues: {},
  rigPresets: {},
  selectedAnimationId: null,
};
