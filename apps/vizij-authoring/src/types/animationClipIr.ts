export type AnimationInterpolation = "linear" | "step" | "cubic";

export interface AnimationKeyframeIR {
  id: string;
  time: number;
  value: number;
  interpolation?: AnimationInterpolation;
  inTangent?: number | null;
  outTangent?: number | null;
}

export interface AnimationTrackIR {
  id: string;
  variableId: string;
  channel: string;
  label?: string;
  color?: string;
  interpolation: AnimationInterpolation;
  keyframes: AnimationKeyframeIR[];
  metadata?: Record<string, unknown>;
  /**
   * True when the track's target channel no longer exists on the loaded face —
   * typically because an element or morph target was renamed or removed
   * outside Vizij.
   *
   * Detached tracks are retained in authored state so keyframe work survives a
   * rename: `channel` keeps the stale path so the track can be re-attached.
   * They are excluded from the runtime bundle (see
   * `clipIrToBundleAnimationEntry`) and must not be compiled or played.
   */
  detached?: boolean;
}

export interface AnimationClipIR {
  schemaVersion: 1;
  id: string;
  name?: string;
  duration: number;
  tracks: AnimationTrackIR[];
  metadata?: Record<string, unknown>;
}

export const ANIMATION_CLIP_IR_SCHEMA_VERSION = 1 as const;

export const AUTHORED_TIMELINE_CLIP_ID = "authoring.timeline.main";
export const AUTHORED_TIMELINE_CLIP_NAME = "Authoring Timeline";
export const LEGACY_AUTHORED_TIMELINE_CLIP_ID = "timeline-main";
export const AUTHORED_TIMELINE_METADATA_ORIGIN = "authoring.timeline";
export const AUTHORED_TIMELINE_METADATA_SCHEMA_VERSION = 1 as const;
export const AUTHORED_TIMELINE_METADATA_MARKERS = Object.freeze({
  origin: AUTHORED_TIMELINE_METADATA_ORIGIN,
  schemaVersion: AUTHORED_TIMELINE_METADATA_SCHEMA_VERSION,
});
