export { VizijRuntimeProvider } from "./VizijRuntimeProvider";
export { VizijRuntimeFace } from "./VizijRuntimeFace";
export { useVizijRuntime } from "./hooks/useVizijRuntime";
export { useOptionalVizijRuntime } from "./hooks/useOptionalVizijRuntime";
export { useVizijOutputs } from "./hooks/useVizijOutputs";
export { useRigInput } from "./hooks/useRigInput";
export { resolveRuntimeUpdatePlan } from "./updatePolicy";
export {
  POSE_WEIGHT_INPUT_PATH_PREFIX,
  VISEME_POSE_KEYS,
  EXPRESSIVE_EMOTION_POSE_KEYS,
  EMOTION_POSE_KEYS,
  buildRigInputPath,
  buildPoseWeightInputPathSegment,
  buildPoseWeightRelativePath,
  buildPoseWeightPathMap,
  normalizePoseSemanticKey,
  getPoseSemanticKey,
  resolvePoseMembership,
  resolvePoseSemantics,
  filterPosesBySemanticKind,
  buildSemanticPoseWeightPathMap,
} from "./utils/posePaths";
export {
  resolveFaceControls,
  mapNormalizedControlValue,
  mapUnitControlValue,
} from "./utils/faceControls";
export type { FaceScalarControl } from "./utils/faceControls";

export type {
  VizijAssetBundle,
  VizijGlbAsset,
  VizijGraphAsset,
  VizijAnimationAsset,
  VizijProgramAsset,
  PoseRigConfig,
  PoseDefinition,
  PoseGroupDefinition,
  RootBounds,
  AnimationClipLike,
  AnimationTrackLike,
  AnimationKeyframeLike,
  VizijRuntimeProviderProps,
  VizijRuntimeStatus,
  AnimateValueOptions,
  PlayAnimationOptions,
  AnimationPlaybackState,
  StopProgramOptions,
  ProgramPlaybackState,
  InputDriverFactory,
  InputDriverLifecycle,
  InputDriverContext,
  VizijRuntimeFaceProps,
  RuntimeUpdateTier,
  RuntimeUpdatePlan,
  RuntimeGraphBundle,
  RuntimeOutputWrite,
} from "./types";

/**
 * Graph composition, exported so a host can compose the same way the provider
 * does — notably when baking authored clips, where a second composition
 * implementation would be free to drift from the one that actually plays.
 */
export { composeGraphSpecs } from "./utils/composeGraph";
export type { GraphSource, ComposableSpec } from "./utils/composeGraph";

/**
 * The graph's input-path map, exported for the same reason as
 * `composeGraphSpecs`: baking has to drive the rig through the paths its input
 * nodes actually declare, and deriving that a second way is how a channel ends
 * up staged at a path nothing reads.
 */
export { collectInputPathMap } from "./utils/graph";

/**
 * The clip-channel to graph-path resolver, exported so baking resolves
 * channels exactly as playback does. Three independent implementations of
 * this mapping is how a clip ends up driving a path nothing reads.
 */
export { resolveAnimationBridgeOutputPaths } from "./utils/animationBridge";
