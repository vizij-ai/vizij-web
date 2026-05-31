export { VizijRuntimeProvider } from "./VizijRuntimeProvider";
export { VizijRuntimeFace } from "./VizijRuntimeFace";
export { useVizijRuntime } from "./hooks/useVizijRuntime";
export { useOptionalVizijRuntime } from "./hooks/useOptionalVizijRuntime";
export { useVizijOutputs } from "./hooks/useVizijOutputs";
export { useRigInput } from "./hooks/useRigInput";
export {
  mapNormalizedControlValue,
  mapUnitControlValue,
  resolveFaceControls,
  resolveRuntimeUpdatePlan,
} from "@vizij/studio-support";

export type {
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
  RuntimeGraphBundleAppliedEvent,
  RuntimeOutputWrite,
  OrchestratorBackend,
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
  PoseDefinition,
  PoseBlendMode,
  PoseGroupDefinition,
  PoseRigConfig,
  RuntimeGraphBundle,
  RuntimeGraphBundleUpdateSource,
  RuntimeUpdatePlan,
  RuntimeUpdateTier,
  RootBounds,
  VizijAnimationAsset,
  VizijAssetBundle,
  VizijGlbAsset,
  VizijGraphAsset,
  VizijInputMetadata,
  VizijProgramAsset,
} from "./types";

export type {
  FaceScalarControl,
  ResolvedFaceControls,
} from "@vizij/studio-support";
