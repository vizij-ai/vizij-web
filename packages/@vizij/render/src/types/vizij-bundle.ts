/**
 * Face Package schema re-exports.
 *
 * The schema moved to `@vizij/face-core` (L1 owns the Face Package
 * vocabulary; see docs/redesign/06-track-2-implementation.md §3.4). These
 * re-exports keep `@vizij/render`'s public API unchanged.
 */
export type {
  VizijBundleVersion,
  VizijBundleGraphKind,
  VizijPoseId,
  VizijAnimationId,
  VizijGraphId,
  VizijBundleGraphMetadata,
  VizijBundleGraphEntry,
  VizijPoseDefinition,
  VizijPoseRigConfig,
  VizijBundlePoseSection,
  VizijBundleAnimationKeyframe,
  VizijBundleAnimationTrack,
  VizijBundleAnimationClip,
  VizijBundleAnimationEntry,
  VizijSpeechConfig,
  VizijBundleExtension,
} from "@vizij/face-core";
