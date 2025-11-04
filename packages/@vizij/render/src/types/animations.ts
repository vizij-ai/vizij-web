export interface VizijAnimationTrackData {
  /** Vizij animatable id extracted from RobotData.features.*.value.id */
  componentId: string;
  /** Feature key (e.g. translation, chin, etc.) */
  feature: string;
  /** Vizij renderable id that owns the feature. */
  renderableId: string;
  /** glTF node index referenced by the channel. */
  nodeIndex: number;
  /** Optional glTF node name for debugging. */
  nodeName?: string;
  /** Original glTF channel path (translation, rotation, etc.). */
  path?: string;
  /** Optional feature component label (e.g. x, y, z) if provided by the glTF channel. */
  component?: string;
  /** Index within the output accessor for multi-component values. */
  componentIndex?: number;
  /** Numeric type reported by the Vizij animatable (number, vector3, etc.). */
  valueType?: string;
  /** Number of numeric entries per keyframe within `values`. */
  valueSize: number;
  /** Interpolation declared on the glTF sampler. */
  interpolation?: string;
  /** Keyframe times extracted from the GLTF animation sampler. */
  times: number[];
  /** Keyframe values (flattened, length === times.length * valueSize). */
  values: number[];
}

export interface VizijAnimationClipData {
  /** Stable identifier derived from glTF animation name or index. */
  id: string;
  /** Human readable name (mirrors glTF animation name when available). */
  name?: string;
  /** Duration in seconds resolved from the THREE.AnimationClip. */
  duration: number;
  /** Raw glTF animation index in the asset. */
  index: number;
  /** Optional metadata copied from glTF animation extras. */
  metadata?: Record<string, unknown>;
  /** Extracted per-channel track data for Vizij animatables. */
  tracks: VizijAnimationTrackData[];
}
