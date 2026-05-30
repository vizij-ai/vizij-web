export { VizijRuntimeProvider } from "./VizijRuntimeProvider";
export { VizijRuntimeFace } from "./VizijRuntimeFace";
export { useVizijRuntime } from "./hooks/useVizijRuntime";
export { useOptionalVizijRuntime } from "./hooks/useOptionalVizijRuntime";
export { useVizijOutputs } from "./hooks/useVizijOutputs";
export { useRigInput } from "./hooks/useRigInput";
export { resolveRuntimeUpdatePlan } from "@vizij/studio-support";
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
} from "@vizij/studio-support";
export {
  resolveFaceControls,
  mapNormalizedControlValue,
  mapUnitControlValue,
} from "@vizij/studio-support";
export type { FaceScalarControl } from "@vizij/studio-support";
export {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
  resolveTrackInputPath,
  sampleClipAtTime,
  sampleTrackAtTime,
} from "@vizij/studio-support";
export type {
  AdvanceClipTimeInput,
  AdvanceClipTimeResult,
  TrackSample,
} from "@vizij/studio-support";

export type {
  VizijAssetBundle,
  VizijGlbAsset,
  VizijGraphAsset,
  VizijAnimationAsset,
  VizijProgramAsset,
  PoseRigConfig,
  PoseDefinition,
  PoseBlendMode,
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
  AnimationTransportMode,
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
  OrchestratorBackend,
} from "./types";
