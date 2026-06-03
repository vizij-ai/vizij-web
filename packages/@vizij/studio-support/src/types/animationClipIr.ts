export type AnimationInterpolation = "linear" | "step" | "cubic" | "spline";

export interface AnimationHandleIR {
  /**
   * Time delta, in seconds, relative to the keyframe this handle belongs to.
   * Outgoing handles use positive x values; incoming handles use negative x
   * values.
   */
  x: number;
  /** Value delta relative to the keyframe this handle belongs to. */
  y: number;
}

export interface AnimationKeyframeIR {
  id: string;
  time: number;
  value: number;
  interpolation?: AnimationInterpolation;
  inTangent?: number | null;
  outTangent?: number | null;
  inHandle?: AnimationHandleIR | null;
  outHandle?: AnimationHandleIR | null;
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
