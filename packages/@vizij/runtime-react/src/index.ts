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
