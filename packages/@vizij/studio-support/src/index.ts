import { compileIrGraph, type IrGraph } from "@vizij/node-graph-authoring";
import type { AnimatableValue } from "@vizij/utils";
import type {
  AnimationRegistrationConfig,
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationTrackLike,
  GraphRegistrationConfig,
  GraphSubscriptions,
  GraphRegistrationSupportResult,
  InputConstraint,
  PoseRigConfig,
  RuntimeAnimationRegistrationSupportResult,
  RuntimeProgramRegistrationSupportResult,
  RuntimeRegistrationDiagnostic,
  RuntimeRegistrationPlan,
  ShapeJSON,
  ValueJSON,
  World,
  VizijBundleAnimationEntry,
  VizijBundleExtension,
  VizijBundleGraphEntry,
  VizijAnimationAsset,
  VizijAssetBundle,
  VizijGraphAsset,
  VizijInputMetadata,
  VizijProgramAsset,
} from "./types";
import {
  collectInputPathMap,
  collectInputPaths,
  collectOutputPaths,
} from "./utils/graph";
import { resolveClipDurationSeconds } from "./utils/clipPlayback";
import { collectAnimationClipOutputPaths } from "./utils/animationBridge";
import {
  namespaceControllerId,
  namespaceTypedPath,
  stripNamespace,
} from "./utils/namespacing";

export type {
  AnimationClipIR,
  AnimationInterpolation,
  AnimationKeyframeIR,
  AnimationTrackIR,
} from "./types/animationClipIr";
export {
  ANIMATION_CLIP_IR_SCHEMA_VERSION,
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_CLIP_NAME,
  AUTHORED_TIMELINE_METADATA_MARKERS,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  AUTHORED_TIMELINE_METADATA_SCHEMA_VERSION,
  LEGACY_AUTHORED_TIMELINE_CLIP_ID,
} from "./types/animationClipIr";
export {
  bundleAnimationEntryToClipIr,
  clipIrToBundleAnimationEntry,
  compileAnimationClipIr,
  evaluateAnimationTrackAtTime,
  findAuthoredTimelineBundleAnimation,
  findCanonicalAuthoredTimelineConflict,
  isAuthoredTimelineBundleAnimationEntry,
  isAuthoredTimelineOriginMetadata,
  type BundleAnimationToClipOptions,
  type CompileAnimationClipIrOptions,
} from "./utils/animationClipCompiler";
export {
  POSE_IR_SYNTHETIC_BOUNDARY_CONTRACT,
  POSE_IR_TARGETING_CONTRACT,
  POSE_RIG_CONFIG_VERSION,
  POSE_RIG_IR_VERSION,
} from "./types/poseRig";
export type {
  LowLevelBinding,
  LowLevelRigSummary,
  PoseCrossGroupChannelOverride,
  PoseCrossGroupChannelOverrideMap,
  PoseCrossGroupOverrideMode,
  PoseDiagnostic,
  PoseDiagnosticLocation,
  PoseDiagnosticSeverity,
  PoseGraphContribution,
  PoseGraphInputSummary,
  PoseInputComposeMode,
  PoseInputComposeModeMap,
  PoseIrBlendMode,
  PoseIrBlendStageDefinition,
  PoseIrCompileResult,
  PoseIrContracts,
  PoseIrCrossGroupChannelOverride,
  PoseIrCrossGroupChannelOverrideMap,
  PoseIrCrossGroupOverrideMode,
  PoseIrCrossGroupPolicy,
  PoseIrGroupDefinition,
  PoseIrNeutralDefinition,
  PoseIrPoseDefinition,
  PoseIrStageSource,
  PoseNeutralMode,
  PosePriorityTieBreak,
  PoseRigAuthoringState,
  PoseRigConfigFile,
  PoseRigGraphSummary,
  PoseRigIrFile,
  PoseScopedNeutralDefinition,
  PoseScopedNeutralDirectValuesDefinition,
  PoseScopedNeutralInheritDefinition,
  PoseScopedNeutralPoseReferenceDefinition,
  PoseScopedNeutralSourceType,
  PoseWeightMap,
  StandardInputId,
  PoseBlendMode as PoseRigBlendMode,
  PoseDefinition as PoseRigPoseDefinition,
  PoseGroupDefinition as PoseRigGroupDefinition,
} from "./types/poseRig";
export type {
  AnimationRegistrationConfig,
  AnimationClipLike,
  AnimationKeyframeLike,
  AnimationSetup,
  AnimationTrackLike,
  GraphRegistrationConfig,
  GraphSubscriptions,
  GraphRegistrationSupportResult,
  InputConstraint,
  PoseDefinition,
  PoseBlendMode,
  PoseGroupDefinition,
  PoseRigConfig,
  RuntimeAnimationRegistrationSupportResult,
  RuntimeGraphBundleApplicationPlan,
  RuntimeGraphBundle,
  RuntimeGraphBundlePendingUpdate,
  RuntimeGraphBundleUpdateSource,
  RuntimeProgramRegistrationSupportResult,
  RuntimeRegistrationDiagnostic,
  RuntimeRegistrationPlan,
  RuntimeUpdatePlan,
  RuntimeUpdateTier,
  OrchestratorBackend,
  RootBounds,
  ShapeJSON,
  ValueJSON,
  VizijBundleAnimationClip,
  VizijBundleAnimationEntry,
  VizijBundleAnimationKeyframe,
  VizijBundleAnimationTrack,
  VizijBundleExtension,
  VizijBundleGraphEntry,
  VizijBundleGraphKind,
  VizijBundleGraphMetadata,
  VizijBundlePoseSection,
  VizijBundleVersion,
  VizijAnimationId,
  VizijAnimationAsset,
  VizijGraphId,
  VizijAssetBundle,
  VizijPoseDefinition,
  VizijPoseId,
  VizijPoseRigConfig,
  VizijSpeechConfig,
  Feature,
  VizijGlbAsset,
  VizijGraphAsset,
  VizijInputMetadata,
  VizijProgramAsset,
  World,
} from "./types";
export {
  collectInputPathMap,
  collectInputPaths,
  collectOutputPaths,
} from "./utils/graph";
export {
  namespaceControllerId,
  namespaceTypedPath,
  stripNamespace,
} from "./utils/namespacing";
export { normalizeGraphPath } from "./utils/graphPaths";
export {
  canonicalizeGraphComparable,
  diffGraphSpecs,
  filterBenignGeneratedNodeIdDiffs,
  isBenignGeneratedNodeIdDiff,
  rewriteGraphFaceNamespace,
  type GraphDiffCategory,
  type GraphDiffConnectionContext,
  type GraphDiffConnectionEndpoint,
  type GraphDiffContext,
  type GraphDiffEntry,
  type GraphDiffEntityType,
  type GraphDiffKind,
  type GraphDiffResult,
} from "./utils/graphDiff";
export {
  auditBundleGraphs,
  resolveBundleContractViolationMessage,
  type BundleGraphAuditEntry,
  type BundleGraphAuditStatus,
  type BundleGraphOutputAudit,
} from "./utils/bundleAudit";
export {
  buildAuthoringRigGraphArtifacts,
  buildAuthoringVizijBundle,
  hasAuthoringPoseConstantNodes,
  mergeMotionGraphsIntoBundle,
  normalizeMotionGraphResetValues,
  prepareAuthoringVizijBundleForExport,
  type AuthoringPoseBundleState,
  type AuthoringPoseConfig,
  type AuthoringRigGraphArtifacts,
  type BuildAuthoringRigGraphArtifactsOptions,
  type AuthoringPoseDiagnostic,
  type BuildAuthoringVizijBundleOptions,
  type MotionGraphBundleEntry,
  type PrepareAuthoringVizijBundleForExportDiagnostics,
  type PrepareAuthoringVizijBundleForExportError,
  type PrepareAuthoringVizijBundleForExportOptions,
  type PrepareAuthoringVizijBundleForExportResult,
} from "./utils/bundleAssembly";
export {
  buildBindingIssuesMap,
  buildGraphMachineReport,
  buildRigGraphCompile,
  createGraphInsightSnapshot,
  type AuthoringGraphInsightSnapshot,
  type RigGraphCompileInputs,
  type RigGraphInputMetadata,
} from "./utils/rigGraphCompiler";
export {
  assessLegacyBindingMigration,
  buildCompiledPipelineEquation,
  buildDefaultParentContributionFormula,
  buildDefaultParentVariableFormula,
  buildLegacyMigrationLinkUpserts,
  computePipelineDiagnostics,
  computePoseContribution,
  isAutoParentBlendExpression,
  mergePipelineMetadata,
  planLegacyBindingPipelineMigration,
  resolveEffectiveParentExpressionVariable,
  resolveParentBlendExpressionUpdate,
  resolvePipelineStageSettings,
  type LegacyBindingMigrationAssessment,
  type PipelineDiagnosticsRow,
  type PipelineStageSettings,
  type PoseContributionSample,
} from "./utils/pipelineStages";
export {
  resolveControllableInputId,
  resolveEffectiveBindingInputId,
  resolveEffectiveBindingStandardInput,
  resolveEffectiveControllableBindingStandardInput,
  type BindingResolutionBlockedCode,
} from "./utils/bindingSlotResolution";
export {
  resolveFaceInspectorCurrentValue,
  type FaceInspectorCurrentValueResolution,
  type FaceInspectorCurrentValueSourceKind,
} from "./utils/faceInspectorSemantics";
export {
  computePoseContributionSemantics,
  type PoseContributionSemantics,
} from "./utils/poseContributionSemantics";
export {
  deriveAliasFromInputDescriptor,
  resolveAuthoringParentExpressionVariable,
  resolveBindingSlotAlias,
  syncBindingParentAliasReferences,
} from "./utils/rigPipelineAliases";
export {
  buildPoseGroupLookup,
  humanizePoseGroupName,
  normalizePoseGroupPath,
  orderPoseMembershipIds,
  resolvePoseMembership as resolvePoseRigMembership,
  sanitizePoseGroupId,
  type PoseGroupLookup,
} from "./utils/poseRigGroupMembership";
export {
  buildPoseGraphSpec,
  buildPoseGraphSpecFromIr,
} from "./utils/poseRigGraphBuilder";
export { parsePoseGraphSpec } from "./utils/poseRigGraphParser";
export { PoseConfigService } from "./utils/poseRigConfigService";
export { PoseGraphService } from "./utils/poseRigGraphService";
export { PoseIrService } from "./utils/poseRigIrService";
export { PoseSnapshotService } from "./utils/poseRigSnapshotService";
export {
  extractGraphFaceId,
  extractVizijPipelineConfigMap,
  extractVizijPipelineConfigMapFromMetadata,
  extractVizijPipelineLinksMapFromMetadata,
  extractVizijPipelineMetadataV1,
  normalizeVizijPipelineConfigMap,
  normalizeVizijPipelineLinkMap,
  normalizeRuntimeGraphSpec,
  planBundleGraphSpecReplacement,
  prepareBundleGraphSpecForImport,
  prepareSpecForImport,
  remapGraphSpecFace,
  renameBundleGraphOutputPath,
  withVizijPipelineMetadataV1,
  type BundleGraphSpecReplacementAuditEntry,
  type BundleGraphSpecReplacementErrorKind,
  type PlanBundleGraphSpecReplacementOptions,
  type PlanBundleGraphSpecReplacementResult,
  type RenameBundleGraphOutputPathErrorKind,
  type RenameBundleGraphOutputPathResult,
} from "./utils/graphImport";
export {
  rehydrateRigDataFromGraph,
  type ImportNormalizationDiagnostics,
  type RehydratedRigData,
} from "./utils/rigGraphImport";
export {
  prepareRigGraphImportPlan,
  type PrepareRigGraphImportPlanOptions,
  type RigGraphImportAutoInputState,
  type RigGraphImportPlan,
} from "./utils/rigGraphImportPlan";
export {
  buildPoseGraphRemapApplyPlan,
  collectPoseGraphDeltaInputs,
  listPoseGraphOutputs,
  remapPoseGraphInputIds,
  remapPoseGraphInputs,
  resolvePoseGraphSourceInputId,
  updatePoseGraphOutputPath,
  type PoseGraphInputIdRemap,
  type PoseGraphOutputEntry,
  type PoseGraphRemapApplyPlan,
  type PoseGraphRemapApplyRow,
} from "./utils/poseGraphImport";
export {
  buildMotionGraphProgramAsset,
  buildGraphSpec,
  buildGraphSpecForExport,
  type BuildMotionGraphProgramAssetOptions,
  MOTION_GRAPH_INPUT_SOURCE_PORT_ID,
  MOTION_GRAPH_INPUT_SOURCE_TYPE,
  MOTION_GRAPH_OUTPUT_TARGET_PORT_ID,
  MOTION_GRAPH_OUTPUT_TARGET_TYPE,
  type BuiltGraphSpec,
  type MotionGraphEditorEdge,
  type MotionGraphEditorNode,
  type MotionGraphSpecEdge,
  type MotionGraphSpecNode,
} from "./utils/motionGraphSpec";
export {
  buildAuthoringDriverGraph,
  type BuildAuthoringDriverGraphOptions,
} from "./utils/driverGraph";
export {
  buildFeatureEntries,
  type FeatureEntry,
  type NumberFeatureEntry,
  type RenderableLike,
  type SupportedKind,
  type VectorComponent,
  type VectorFeatureEntry,
} from "./utils/featureEntries";
export {
  buildAutoRigInputBlueprints,
  type AutoRigInputBlueprint,
  type AutoRigInputBlueprintMetadata,
  type AutoRigInputBlueprintResult,
} from "./utils/autoRigInputs";
export {
  buildInitialInputDefaultsForPorts,
  defaultInputValueForPortType,
  defaultVariadicCount,
  formatVariadicPortId,
  type MotionGraphDefaultPortSpec,
  type MotionGraphDefaultVariadicSpec,
} from "./utils/motionGraphInputDefaults";
export {
  specToEditorState,
  type SpecToEditorResult,
} from "./utils/motionGraphEditor";
export {
  BUNDLE_ANIMATION_TARGET_PREFIX,
  BUNDLE_PROCEDURAL_TARGET_PREFIX,
  buildImportedBundleAnimationTargets,
  buildImportedBundleProgramTargets,
  bundleTargetValue,
  filterImportedBundleProgramEntries,
  isImportedBundleAnimationTargetId,
  isImportedBundleProgramTargetId,
  parseImportedBundleAnimationTargetIndex,
  parseImportedBundleProgramTargetIndex,
  resolveImportedBundleAnimationBaseClip,
  resolveImportedBundleAnimationClip,
  resolveImportedBundleAnimationEntry,
  resolveImportedBundleProgramBaseSnapshot,
  resolveImportedBundleProgramEntry,
  resolveImportedBundleProgramSnapshot,
  type BuildImportedBundleAnimationTargetsOptions,
  type BuildImportedBundleProgramTargetsOptions,
  type ImportedBundleProgramSnapshot,
  type ImportedBundleTargetOption,
  type ResolveImportedBundleAnimationBaseClipOptions,
  type ResolveImportedBundleAnimationClipOptions,
  type ResolveImportedBundleAnimationEntryOptions,
  type ResolveImportedBundleProgramBaseSnapshotOptions,
  type ResolveImportedBundleProgramEntryOptions,
  type ResolveImportedBundleProgramSnapshotOptions,
} from "./utils/importedBundleTargets";
export {
  buildRuntimeBaseBundle,
  buildRuntimeGraphBundle,
} from "./utils/runtimeBundle";
export {
  DEFAULT_RUNTIME_GRAPH_SPEC_RESULT,
  resolveRuntimeGraphSpec,
  type ResolveRuntimeGraphSpecResult,
  type RuntimeGraphSpec,
} from "./utils/runtimeGraphSpec";
export {
  planRuntimeProgramControllerSync,
  type PlanRuntimeProgramControllerSyncOptions,
  type RuntimeProgramControllerPlaybackEntry,
  type RuntimeProgramControllerPlaybackState,
  type RuntimeProgramControllerRegistration,
  type RuntimeProgramControllerRemoval,
  type RuntimeProgramControllerRemovalReason,
  type RuntimeProgramControllerSyncPlan,
} from "./utils/programControllerSync";
export {
  planRuntimeControllerRemoval,
  summarizeRuntimeControllerRegistration,
  type RuntimeControllerList,
  type RuntimeControllerRegistrationSummary,
  type RuntimeControllerRegistrationSummaryOptions,
  type RuntimeControllerRemovalPlan,
  type RuntimeControllerRemovalPlanOptions,
} from "./utils/runtimeControllerApplication";
export {
  buildAnimationPreviewBundle,
  buildMotionGraphPreviewBundle,
  buildMotionGraphResetValuesForOutputs,
  buildRuntimeGraphPreviewBundle,
  mergeManagedProgramAsset,
  planAnimationPreviewTransaction,
  planMotionGraphPreviewTransaction,
  planRuntimeGraphPreviewTransaction,
  parseAuthoringPreviewTarget,
  resolveAuthoringCompileTargetState,
  resolveAuthoringRuntimeErrorStates,
  toDeterministicSignature,
  type AnimationPreviewBundleOptions,
  type AnimationPreviewBundleResult,
  type AuthoringCompileTargetStateLike,
  type AuthoringRuntimeErrorSourceLike,
  type AuthoringPreviewCompileState,
  type AuthoringPreviewCompileStatus,
  type AuthoringPreviewTarget,
  type AuthoringPreviewUpdateSource,
  type AnimationPreviewTransactionOptions,
  type AnimationPreviewTransactionPlan,
  type MotionGraphPreviewTransactionOptions,
  type MotionGraphPreviewTransactionPlan,
  type MotionGraphPreviewBundleOptions,
  type MotionGraphPreviewBundleResult,
  type MotionGraphRuntimeResetEntry,
  type RuntimeGraphPreviewBundleResult,
  type RuntimeGraphPreviewTransactionOptions,
  type RuntimeGraphPreviewTransactionPlan,
} from "./utils/authoringPreview";
export {
  buildPoseComposeModeByInputId,
  canonicalizeImportedPipelineMetadataV1,
  derivePipelineConfigFromInputBindings,
  deriveLockedInspectorTargetsFromPipeline,
  mergeImportedAndLocalPipelineConfigByInputId,
  mergeImportedAndLocalPipelineLinksById,
  readPipelineLinkPatch,
  resolvePipelineMetadataForExport,
  sanitizePipelineConfigAndLinksForAvailableInputs,
  withPipelineConfigBuildOptions,
  type DerivedPipelineEdits,
  type PipelineConfigByInputId,
  type PoseConfigSnapshot,
} from "./utils/pipelineMetadata";
export {
  applyRuntimeOverridesToAnimatables,
  compareImportedRigGraph,
  countGraphDiffsByCategory,
  normalizeRehydratedInputMetadata,
  runRigRoundtripAudit,
  summarizeGraphEdgeDiffRisk,
  type ImportedRigGraphComparison,
  type ImportedRigGraphComparisonOptions,
  type NormalizedInputMetadata,
  type RigRoundtripAuditOptions,
  type RigRoundtripAuditResult,
  type RigRoundtripManagedStandardInput,
} from "./utils/rigRoundtripDiagnostics";
export {
  buildStandardInputIdRemap,
  remapPipelineMetadataInputIds,
  remapPoseConfigInputIds,
  remapPoseIrInputIds,
  type RemappablePoseConfig,
  type RemappablePoseIr,
  type VizijPipelineConfigMap,
  type VizijPipelineLinkMap,
  type VizijPipelineMetadataV1,
} from "./utils/standardInputRemap";
export {
  appendStandardInputPathSuffix,
  remapAnimatableBindings,
  remapBindingDefinition,
  remapBindingDefinitionCache,
  remapBindingDefinitionRecord,
  remapBindingInputIds,
  remapBindingMetadataInputIds,
  remapInputBindings,
  remapInputIdList,
  remapInputIdSet,
  remapStandardInputValues,
} from "./utils/standardInputRemapApplication";
export {
  planShapeInputRename,
  type PersistedAutoStandardInputLike,
  type ShapeInputRenameAutoInputState,
  type ShapeInputRenamePlan,
  type ShapeInputRenamePlanOptions,
} from "./utils/shapeInputRename";
export {
  ensureStandardPathInput,
  inferStandardSuggestion,
} from "./utils/standardInputPaths";
export {
  planStandardInputCreation,
  planStandardInputUpdate,
  resolveUniqueStandardInputId,
  resolveUpdatedStandardInputId,
  type StandardInputCreationPlanOptions,
  type StandardInputMutationIssue,
  type StandardInputMutationIssueCode,
  type StandardInputMutationPlan,
  type StandardInputUpdatePatch,
  type StandardInputUpdatePlanOptions,
  type StandardInputUpdatePlanResult,
} from "./utils/standardInputMutation";
export {
  getStandardInputResolutionIndex,
  resolveUniqueAliasIdFromStandardInputs,
  type StandardInputResolutionIndex,
  type StandardInputResolutionMetrics,
} from "./utils/standardInputResolutionIndex";
export {
  analyzeStandardInputBindings,
  extractBindingsFromBundle,
  getInputIdsWithBindings,
  type StandardInputBindingInfo,
} from "./utils/standardInputBindings";
export {
  buildStandardInputCollectionIndex,
  type StandardInputCollectionEntry,
  type StandardInputCollectionIndex,
  type StandardInputCollectionMetadata,
} from "./utils/standardInputCollections";
export { extractStandardInputSubgroups } from "./utils/standardInputs";
export {
  buildPoseWeightInputPathSegment,
  buildPoseWeightPathMap,
  buildPoseWeightRelativePath,
  buildRigInputPath,
  buildSemanticPoseWeightPathMap,
  EMOTION_POSE_KEYS,
  EXPRESSIVE_EMOTION_POSE_KEYS,
  filterPosesBySemanticKind,
  getPoseSemanticKey,
  normalizePoseSemanticKey,
  POSE_WEIGHT_INPUT_PATH_PREFIX,
  resolvePoseMembership,
  resolvePoseSemantics,
  VISEME_POSE_KEYS,
  type PoseSemanticKind,
} from "./utils/posePaths";
export {
  buildLegacyPoseWeightFallbackMap,
  planPoseControlBridgeWrite,
  resolvePoseControlInputPath,
  resolveLegacyPoseWeightControlWrites,
  shouldUseLegacyPoseWeightFallback,
  type LegacyPoseWeightControlWrite,
  type LegacyPoseWeightFallbackMap,
  type PoseControlBridgeState,
  type PoseControlBridgeWrite,
} from "./utils/poseRuntime";
export {
  mapNormalizedControlValue,
  mapUnitControlValue,
  resolveFaceControls,
  type FaceScalarControl,
  type ResolvedFaceControls,
} from "./utils/faceControls";
export {
  buildRuntimeInputCatalogFromConstraints,
  buildRuntimeInputWritePathMap,
  resolveRuntimeInputWritePath,
  stripRuntimeNamespacePrefix,
  type BuildRuntimeInputCatalogOptions,
  type RuntimeInputCatalog,
  type RuntimeInputConstraint,
  type RuntimeInputWritePathMapOptions,
} from "./utils/runtimeInputs";
export {
  buildFallbackGraphPath,
  buildRuntimeInputRouteSnapshot,
  createEmptyRuntimeInputRouteSnapshot,
  type BuildRuntimeInputRouteSnapshotArgs,
  type RuntimeInputRoute,
  type RuntimeInputRouteGraphSummary,
  type RuntimeInputRouteManagedInput,
  type RuntimeInputRouteSnapshot,
} from "./utils/runtimeInputRoutes";
export {
  flushQueuedRuntimeInputs,
  queueRuntimeInputWrite,
  queueRuntimeInputsFromState,
  type FlushQueuedRuntimeInputsArgs,
  type QueueRuntimeInputsFromStateArgs,
} from "./utils/runtimeInputStaging";
export {
  collectAnimationClipOutputPaths,
  diffAnimationAggregateValues,
  resolveAnimationBridgeOutputPaths,
  sampleAnimationClipOutputValues,
  type AnimationAggregateOperation,
} from "./utils/animationBridge";
export {
  buildAnimationControllerCommandPath,
  buildAnimationControllerInstancePath,
  buildAnimationControllerPlayInputs,
  prepareAnimationRegistrationForTransport,
  resolveAnimationTransportMode,
  type AnimationControllerInput,
  type AnimationTransportPreference,
  type ResolvedAnimationTransportMode,
} from "./utils/animationTransport";
export {
  advanceClipTime,
  clampAnimationTime,
  resolveClipDurationSeconds,
  resolveTrackInputPath,
  sampleClipAtTime,
  sampleTrackAtTime,
  type AdvanceClipTimeInput,
  type AdvanceClipTimeResult,
  type TrackSample,
} from "./utils/clipPlayback";
export {
  applyRuntimeGraphBundle,
  hasRuntimeGraphBundlePendingRevision,
  planRuntimeProgramRegistrationAcknowledgementQueue,
  planRuntimeGraphBundleApplication,
  queueRuntimeGraphBundlePendingUpdate,
  removeRuntimeGraphBundlePendingUpdates,
  resolveRuntimeGraphBundleAppliedUpdates,
  resolveRuntimeGraphBundleErrorSources,
  resolveRuntimeUpdatePlan,
  shouldAcknowledgeRuntimeGraphBundleImmediately,
  shouldDeferRuntimeGraphBundleAcknowledgement,
} from "./updatePolicy";

type GraphSubscriptionsLike = Partial<GraphSubscriptions>;

type GraphNodeSpec = NonNullable<
  GraphRegistrationConfig["spec"]["nodes"]
>[number];
type GraphEdgeSpec = NonNullable<
  GraphRegistrationConfig["spec"]["edges"]
>[number];

export function normalisePath(path: string): string {
  if (!path) {
    return path;
  }
  return path.startsWith("debug/") ? path.slice("debug/".length) : path;
}

function normaliseBundleKind(kind: unknown): string {
  return typeof kind === "string" ? kind.toLowerCase() : "";
}

function addConstraintVariant(
  map: Record<string, InputConstraint>,
  key: string,
  constraint: InputConstraint,
) {
  if (!key) return;
  if (!map[key]) {
    map[key] = constraint;
  }
}

function stripRigFacePrefix(path: string): string {
  const trimmed = path.startsWith("/") ? path.slice(1) : path;
  const match = /^rig\/[^/]+\/(.+)$/.exec(trimmed);
  if (match && match[1]) {
    return match[1];
  }
  if (trimmed.startsWith("rig/")) {
    return trimmed.slice("rig/".length);
  }
  return trimmed;
}

export function extractInputConstraints(
  spec: GraphRegistrationConfig["spec"],
  extraInputs: VizijInputMetadata[] | undefined,
  namespace: string,
): Record<string, InputConstraint> {
  if (!spec || typeof spec !== "object") {
    return {};
  }
  const inputs: VizijInputMetadata[] = [];
  if (Array.isArray(extraInputs)) {
    inputs.push(...extraInputs);
  }
  const entries = (spec as { metadata?: { vizij?: { inputs?: unknown } } })
    .metadata?.vizij?.inputs;
  if (Array.isArray(entries)) {
    entries.forEach((entry) => {
      if (entry && typeof entry === "object") {
        inputs.push(entry as VizijInputMetadata);
      }
    });
  }
  if (inputs.length === 0) {
    return {};
  }
  const map: Record<string, InputConstraint> = {};
  inputs.forEach((entry) => {
    const path = entry.path;
    if (typeof path !== "string") return;
    const namespaced = namespaceTypedPath(path, namespace);
    const stripped = stripRigFacePrefix(path);
    const strippedNamespaced = stripped
      ? namespaceTypedPath(stripped, namespace)
      : stripped;
    const min = entry.range?.min;
    const max = entry.range?.max;
    const defaultValue = entry.defaultValue;
    const constraint: InputConstraint = {
      ...(Number.isFinite(Number(min)) ? { min: Number(min) } : {}),
      ...(Number.isFinite(Number(max)) ? { max: Number(max) } : {}),
      ...(Number.isFinite(Number(defaultValue))
        ? { defaultValue: Number(defaultValue) }
        : {}),
    };
    addConstraintVariant(map, namespaced, constraint);
    addConstraintVariant(map, path, constraint);
    if (stripped) {
      addConstraintVariant(map, stripped, constraint);
    }
    if (strippedNamespaced) {
      addConstraintVariant(map, strippedNamespaced, constraint);
    }
  });
  return map;
}

function namespaceSubscriptions(
  subs: GraphSubscriptionsLike | undefined,
  namespace: string,
): GraphSubscriptions | undefined {
  if (!subs) {
    return undefined;
  }
  const inputs = Array.isArray(subs.inputs)
    ? subs.inputs.map((path) => namespaceTypedPath(path, namespace))
    : undefined;
  const outputs = Array.isArray(subs.outputs)
    ? subs.outputs.map((path) => namespaceTypedPath(path, namespace))
    : undefined;

  if (!inputs && !outputs) {
    return subs as GraphSubscriptions;
  }

  return {
    ...subs,
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
  } as GraphSubscriptions;
}

function namespaceGraphSpec(
  spec: GraphRegistrationConfig["spec"],
  namespace: string,
): GraphRegistrationConfig["spec"] {
  if (!spec || typeof spec !== "object") {
    return spec;
  }
  const nodes = (spec as Record<string, unknown>).nodes;
  if (!Array.isArray(nodes)) {
    return spec;
  }
  let changed = false;
  const nextNodes = nodes.map((node) => {
    if (!node || typeof node !== "object") {
      return node;
    }
    const path = (node as { params?: { path?: string } }).params?.path;
    if (typeof path !== "string") {
      return node;
    }
    const namespacedPath = namespaceTypedPath(path, namespace);
    if (namespacedPath === path) {
      return node;
    }
    changed = true;
    return {
      ...(node as Record<string, unknown>),
      params: {
        ...(((node as { params?: Record<string, unknown> }).params ?? {}) as
          | Record<string, unknown>
          | undefined),
        path: namespacedPath,
      },
    } as GraphNodeSpec;
  });

  if (!changed) {
    return spec;
  }

  return {
    ...(spec as Record<string, unknown>),
    nodes: nextNodes,
  } as GraphRegistrationConfig["spec"];
}

function stripNulls<T>(value: T): T {
  if (value === null) {
    return undefined as T;
  }
  if (Array.isArray(value)) {
    const next = value
      .map((entry) => stripNulls(entry))
      .filter((entry) => entry !== undefined && entry !== null);
    return next as unknown as T;
  }
  if (typeof value !== "object" || value === undefined) {
    return value;
  }
  const next: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    if (entry === null) {
      return;
    }
    const cleaned = stripNulls(entry);
    if (cleaned === undefined) {
      return;
    }
    next[key] = cleaned;
  });
  return next as T;
}

function pickBundleGraph(
  bundle: VizijBundleExtension | null,
  preferredKinds: string[],
): VizijBundleGraphEntry | null {
  if (!bundle?.graphs || bundle.graphs.length === 0) {
    return null;
  }
  const preferred = preferredKinds.map((kind) => kind.toLowerCase());
  for (const entry of bundle.graphs) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const kind = normaliseBundleKind(entry.kind);
    if (preferred.includes(kind)) {
      return entry;
    }
  }
  if (bundle.graphs.length === 1) {
    return bundle.graphs[0] ?? null;
  }
  return null;
}

function extractIrGraph(payload: unknown): IrGraph | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  return payload as IrGraph;
}

function convertBundleGraph(
  entry: VizijBundleGraphEntry | null,
): VizijGraphAsset | null {
  if (!entry || !entry.id) {
    return null;
  }
  const rawSpec = entry.spec as GraphRegistrationConfig["spec"] | undefined;
  const inputMetadata = extractVizijInputMetadata(
    rawSpec as GraphRegistrationConfig["spec"],
  );
  const spec = rawSpec ? stripVizijMetadata(rawSpec) : undefined;
  const ir = extractIrGraph(entry.ir);
  if (!spec && !ir) {
    return null;
  }
  return {
    id: entry.id,
    spec,
    ir: ir ?? null,
    inputMetadata,
  };
}

export function resolveGraphSpec(
  asset: VizijGraphAsset,
  context: string,
): GraphRegistrationConfig["spec"] | null {
  if (asset.spec) {
    return stripVizijMetadata(asset.spec);
  }
  if (asset.ir) {
    try {
      const compiled = compileIrGraph(asset.ir, { preferLegacySpec: false });
      if (compiled.issues && compiled.issues.length > 0) {
        console.warn(
          `[vizij-runtime] IR compile for graph "${context}" reported issues`,
          compiled.issues,
        );
      }
      return stripVizijMetadata(compiled.spec);
    } catch (error) {
      console.warn(
        `[vizij-runtime] Failed to compile IR graph "${context}"`,
        error,
      );
    }
  }
  return null;
}

function stripVizijMetadata(
  spec: GraphRegistrationConfig["spec"],
): GraphRegistrationConfig["spec"] {
  if (!spec || typeof spec !== "object") {
    return spec;
  }
  const cloned: GraphRegistrationConfig["spec"] = {
    ...spec,
    nodes: spec.nodes
      ? spec.nodes.map((node: GraphNodeSpec) => ({ ...node }))
      : spec.nodes,
    edges: spec.edges
      ? spec.edges.map((edge: GraphEdgeSpec) => ({ ...edge }))
      : spec.edges,
  } as GraphRegistrationConfig["spec"];
  if (cloned.metadata && typeof cloned.metadata === "object") {
    const metadata = { ...(cloned.metadata as Record<string, unknown>) };
    if ("vizij" in metadata) {
      delete metadata.vizij;
    }
    if (Object.keys(metadata).length === 0) {
      delete cloned.metadata;
    } else {
      cloned.metadata = metadata;
    }
  }
  return cloned;
}

function extractVizijInputMetadata(
  spec: GraphRegistrationConfig["spec"],
): VizijInputMetadata[] {
  if (!spec || typeof spec !== "object") {
    return [];
  }
  const inputs = (spec as { metadata?: { vizij?: { inputs?: unknown } } })
    .metadata?.vizij?.inputs;
  if (!Array.isArray(inputs)) {
    return [];
  }
  return inputs
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      return entry as VizijInputMetadata;
    })
    .filter(Boolean) as VizijInputMetadata[];
}

function convertBundleAnimations(
  entries: VizijBundleAnimationEntry[] | undefined | null,
): VizijAnimationAsset[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  return entries
    .filter((entry): entry is VizijBundleAnimationEntry =>
      Boolean(entry && typeof entry.id === "string" && entry.clip),
    )
    .map((entry) => ({
      id: entry.id,
      clip: entry.clip as AnimationClipLike,
    }));
}

type ExtractedAnimationTrack = {
  componentId?: string;
  component?: string;
  componentIndex?: number | string;
  valueSize?: number | string;
  interpolation?: unknown;
  times?: unknown;
  values?: unknown;
};

type ExtractedAnimationClip = {
  id?: string;
  name?: string;
  duration?: number | string;
  metadata?: unknown;
  tracks?: ExtractedAnimationTrack[];
};

function resolveChannelId(track: ExtractedAnimationTrack): string | null {
  if (typeof track.componentId !== "string" || track.componentId.length === 0) {
    return null;
  }
  if (typeof track.component === "string" && track.component.length > 0) {
    return `${track.componentId}:${track.component}`;
  }
  const rawIndex =
    track.componentIndex != null ? Number(track.componentIndex) : undefined;
  const valueSize =
    track.valueSize != null ? Number(track.valueSize) : undefined;
  if (
    Number.isInteger(rawIndex) &&
    Number.isFinite(rawIndex) &&
    rawIndex! >= 0 &&
    Number.isFinite(valueSize) &&
    valueSize! > 1
  ) {
    return `${track.componentId}:${rawIndex}`;
  }
  return track.componentId;
}

export function convertExtractedAnimations(
  clips: ExtractedAnimationClip[] | undefined,
): VizijAnimationAsset[] {
  if (!Array.isArray(clips) || clips.length === 0) {
    return [];
  }

  const assets: VizijAnimationAsset[] = [];

  clips.forEach((clip) => {
    const clipTracks = Array.isArray(clip.tracks) ? clip.tracks : [];
    if (clipTracks.length === 0) {
      return;
    }

    const convertedTracks: AnimationTrackLike[] = [];

    clipTracks.forEach((track) => {
      const channelId = resolveChannelId(track);
      if (!channelId) {
        return;
      }

      const rawTimes = Array.isArray(track.times) ? track.times : [];
      const rawValues = Array.isArray(track.values) ? track.values : [];
      if (rawTimes.length === 0 || rawValues.length === 0) {
        return;
      }

      const times: number[] = [];
      for (const entry of rawTimes) {
        const time = Number(entry);
        if (!Number.isFinite(time)) {
          return;
        }
        times.push(time);
      }

      const values: number[] = [];
      for (const entry of rawValues) {
        const value = Number(entry);
        if (!Number.isFinite(value)) {
          return;
        }
        values.push(value);
      }

      const parsedValueSize =
        track.valueSize != null ? Number(track.valueSize) : NaN;
      const valueSize =
        Number.isFinite(parsedValueSize) && parsedValueSize > 0
          ? parsedValueSize
          : 1;
      const interpolationRaw =
        typeof track.interpolation === "string"
          ? track.interpolation.trim().toLowerCase()
          : "linear";
      const interpolation: AnimationTrackLike["interpolation"] =
        interpolationRaw === "step"
          ? "step"
          : interpolationRaw === "cubic" || interpolationRaw === "cubicspline"
            ? "cubic"
            : "linear";
      const isCubic = interpolation === "cubic";

      const hasTripletTangents =
        isCubic && values.length === times.length * valueSize * 3;
      const hasFlatValues = values.length === times.length * valueSize;
      if (!hasTripletTangents && !hasFlatValues) {
        return;
      }

      const rawIndex =
        track.componentIndex != null ? Number(track.componentIndex) : 0;
      const componentIndex =
        Number.isInteger(rawIndex) && rawIndex >= 0
          ? Math.min(rawIndex, valueSize - 1)
          : 0;

      const keyframes: AnimationKeyframeLike[] = [];
      times.forEach((time, index) => {
        const flatBase = index * valueSize + componentIndex;
        const valueBase = hasTripletTangents
          ? index * valueSize * 3 + valueSize + componentIndex
          : flatBase;
        const value = values[valueBase];
        if (!Number.isFinite(value)) {
          return;
        }
        const keyframe: AnimationKeyframeLike = {
          time,
          value,
        };
        if (hasTripletTangents) {
          const inBase = index * valueSize * 3 + componentIndex;
          const outBase =
            index * valueSize * 3 + valueSize * 2 + componentIndex;
          const inTangent = values[inBase];
          const outTangent = values[outBase];
          if (Number.isFinite(inTangent)) {
            keyframe.inTangent = inTangent;
          }
          if (Number.isFinite(outTangent)) {
            keyframe.outTangent = outTangent;
          }
        }
        keyframes.push(keyframe);
      });

      if (keyframes.length === 0) {
        return;
      }

      convertedTracks.push({
        channel: channelId,
        keyframes,
        interpolation,
      });
    });

    if (convertedTracks.length === 0) {
      return;
    }

    const durationFromTracks = convertedTracks.reduce((maxTime, track) => {
      const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
      if (keyframes.length === 0) {
        return maxTime;
      }
      const lastKeyframe = keyframes[keyframes.length - 1];
      const time = Number(lastKeyframe?.time ?? 0);
      if (!Number.isFinite(time)) {
        return maxTime;
      }
      return time > maxTime ? time : maxTime;
    }, 0);

    const duration =
      typeof clip.duration === "number" && Number.isFinite(clip.duration)
        ? clip.duration
        : durationFromTracks;

    const clipId =
      typeof clip.id === "string" && clip.id.length > 0
        ? clip.id
        : typeof clip.name === "string" && clip.name.length > 0
          ? clip.name
          : `gltf-animation-${assets.length}`;

    const metadata =
      clip.metadata &&
      typeof clip.metadata === "object" &&
      !Array.isArray(clip.metadata)
        ? (clip.metadata as Record<string, unknown>)
        : undefined;

    assets.push({
      id: clipId,
      clip: {
        id: clipId,
        name: typeof clip.name === "string" ? clip.name : clipId,
        duration,
        tracks: convertedTracks,
        metadata,
      },
    });
  });

  return assets;
}

export function pickExtractedAnimations(
  asset: unknown,
): ExtractedAnimationClip[] | undefined {
  if (!asset || typeof asset !== "object") {
    return undefined;
  }
  const animations = (asset as { animations?: unknown }).animations;
  if (!Array.isArray(animations)) {
    return undefined;
  }
  return animations as ExtractedAnimationClip[];
}

export type RuntimeLoadedAssetHostResult = {
  world: World | Record<string, unknown>;
  animatables: Record<string, AnimatableValue> | Record<string, unknown>;
  bundle?: VizijBundleExtension | null;
  animations?: unknown;
};

export type RuntimeLoadedAssetPayload = {
  world: World | Record<string, unknown>;
  animatables: Record<string, AnimatableValue> | Record<string, unknown>;
  bundle: VizijBundleExtension | null;
  animations: VizijAnimationAsset[];
};

export function resolveInitialRuntimeExtractedBundle(
  assetBundle: Pick<VizijAssetBundle, "glb" | "bundle">,
): VizijBundleExtension | null {
  if (assetBundle.bundle) {
    return assetBundle.bundle;
  }
  if (assetBundle.glb.kind === "world") {
    return assetBundle.glb.bundle ?? null;
  }
  return null;
}

export function prepareRuntimeLoadedAssetPayload(
  assetBundle: Pick<VizijAssetBundle, "glb" | "bundle">,
  loadedAsset?: RuntimeLoadedAssetHostResult | null,
): RuntimeLoadedAssetPayload {
  const baseBundle = assetBundle.bundle ?? null;
  const source =
    loadedAsset ??
    (assetBundle.glb.kind === "world"
      ? {
          world: assetBundle.glb.world,
          animatables: assetBundle.glb.animatables,
          bundle: assetBundle.glb.bundle ?? null,
        }
      : null);

  if (!source) {
    return {
      world: {},
      animatables: {},
      bundle: baseBundle,
      animations: [],
    };
  }

  return {
    world: source.world,
    animatables: source.animatables,
    bundle: source.bundle ?? baseBundle,
    animations: convertExtractedAnimations(pickExtractedAnimations(source)),
  };
}

function mergeAnimationLists(
  explicit: VizijAnimationAsset[] | undefined,
  hasExplicitOverride: boolean,
  fromBundle: VizijAnimationAsset[],
): VizijAnimationAsset[] | undefined {
  if (!hasExplicitOverride) {
    return fromBundle.length > 0 ? fromBundle : undefined;
  }
  if (!Array.isArray(explicit)) {
    return undefined;
  }
  if (explicit.length === 0) {
    return [];
  }
  if (fromBundle.length === 0) {
    return explicit;
  }
  const seen = new Set(explicit.map((anim) => anim.id));
  let changed = false;
  const merged = [...explicit];
  for (const anim of fromBundle) {
    if (!anim.id || seen.has(anim.id)) {
      continue;
    }
    merged.push(anim);
    seen.add(anim.id);
    changed = true;
  }
  return changed ? merged : explicit;
}

function extractProgramResetValues(
  value: unknown,
): Record<string, number> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(([, rawValue]) =>
    Number.isFinite(Number(rawValue)),
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(
    entries.map(([path, rawValue]) => [path, Number(rawValue)]),
  );
}

export function convertBundlePrograms(
  entries: VizijBundleGraphEntry[] | undefined | null,
): VizijProgramAsset[] {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }
  return entries
    .filter((entry) => normaliseBundleKind(entry?.kind) === "motiongraph")
    .map((entry) => {
      const graph = convertBundleGraph(entry);
      if (!graph) {
        return null;
      }
      const metadata =
        entry.metadata &&
        typeof entry.metadata === "object" &&
        !Array.isArray(entry.metadata)
          ? (entry.metadata as Record<string, unknown>)
          : undefined;
      return {
        id: entry.id,
        label: typeof entry.label === "string" ? entry.label : undefined,
        graph,
        metadata,
        resetValues: extractProgramResetValues(metadata?.resetValues),
      } satisfies VizijProgramAsset;
    })
    .filter(Boolean) as VizijProgramAsset[];
}

export function deriveProgramInputSeedValues(args: {
  program: VizijProgramAsset;
  namespace: string;
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
  getPathSnapshot: (path: string) => ValueJSON | undefined;
  stagedInputs: Map<string, { value: ValueJSON; shape?: ShapeJSON }>;
}): Array<{ path: string; value: ValueJSON }> {
  const graphSpec = resolveGraphSpec(
    args.program.graph,
    `${args.program.id ?? "program"} graph (seed defaults)`,
  );
  if (!graphSpec) {
    return [];
  }

  return collectInputPaths(graphSpec)
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .flatMap((path) => {
      const namespacedPath = namespaceTypedPath(path, args.namespace);
      if (args.stagedInputs.has(namespacedPath)) {
        return [];
      }
      if (args.getPathSnapshot(namespacedPath) !== undefined) {
        return [];
      }

      const defaultValue = resolveConstraintDefaultForPath({
        path,
        namespace: args.namespace,
        inputConstraints: args.inputConstraints,
      });
      if (!Number.isFinite(defaultValue)) {
        return [];
      }

      return [{ path, value: { float: Number(defaultValue) } }];
    });
}

function resolveConstraintDefaultForPath(args: {
  path: string;
  namespace?: string;
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
}): number | undefined {
  const trimmed = args.path.trim();
  if (!trimmed) {
    return undefined;
  }

  const stripped = stripRigFacePrefix(trimmed);
  const relativePath = stripped ? `/${stripped}` : "";
  const namespaced = args.namespace
    ? namespaceTypedPath(trimmed, args.namespace)
    : undefined;
  const strippedNamespaced =
    args.namespace && stripped
      ? namespaceTypedPath(stripped, args.namespace)
      : undefined;
  const candidates = [
    namespaced,
    trimmed,
    strippedNamespaced,
    stripped || undefined,
    relativePath || undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const defaultValue = args.inputConstraints[candidate]?.defaultValue;
    if (Number.isFinite(defaultValue)) {
      return Number(defaultValue);
    }
  }

  return undefined;
}

export function deriveProgramResetValues(args: {
  program: VizijProgramAsset;
  namespace?: string;
  inputConstraints: Record<
    string,
    { min?: number; max?: number; defaultValue?: number }
  >;
}): Array<{ path: string; value: number }> {
  if (args.program.resetValues) {
    return Object.entries(args.program.resetValues)
      .filter(([, value]) => Number.isFinite(value))
      .map(([path, value]) => ({ path, value }));
  }

  const graphSpec = resolveGraphSpec(
    args.program.graph,
    `${args.program.id ?? "program"} graph (reset)`,
  );
  if (!graphSpec) {
    return [];
  }

  return collectOutputPaths(graphSpec)
    .filter((path) => path.trim().length > 0)
    .map((path) => ({
      path,
      value:
        resolveConstraintDefaultForPath({
          path,
          namespace: args.namespace,
          inputConstraints: args.inputConstraints,
        }) ?? 0,
    }));
}

function mergeProgramLists(
  explicit: VizijProgramAsset[] | undefined,
  hasExplicitOverride: boolean,
  fromBundle: VizijProgramAsset[],
): VizijProgramAsset[] | undefined {
  if (!hasExplicitOverride) {
    return fromBundle.length > 0 ? fromBundle : undefined;
  }
  if (!Array.isArray(explicit)) {
    return undefined;
  }
  if (explicit.length === 0) {
    return [];
  }
  if (fromBundle.length === 0) {
    return explicit;
  }
  const seen = new Set(explicit.map((program) => program.id));
  let changed = false;
  const merged = [...explicit];
  for (const program of fromBundle) {
    if (!program.id || seen.has(program.id)) {
      continue;
    }
    merged.push(program);
    seen.add(program.id);
    changed = true;
  }
  return changed ? merged : explicit;
}

export function mergeAssetBundle(
  base: VizijAssetBundle,
  extracted: VizijBundleExtension | null,
  extractedAnimations: VizijAnimationAsset[] | undefined,
): VizijAssetBundle {
  const resolvedBundle = base.bundle ?? extracted ?? null;
  const hasBaseRigOverride = Object.prototype.hasOwnProperty.call(base, "rig");
  const hasBasePoseOverride = Object.prototype.hasOwnProperty.call(
    base,
    "pose",
  );
  const hasBaseAnimationsOverride = Object.prototype.hasOwnProperty.call(
    base,
    "animations",
  );
  const hasBaseProgramsOverride = Object.prototype.hasOwnProperty.call(
    base,
    "programs",
  );

  const rigFromBundle = convertBundleGraph(
    pickBundleGraph(resolvedBundle, ["rig"]),
  );
  const resolvedRig = hasBaseRigOverride
    ? base.rig
    : (base.rig ?? rigFromBundle ?? undefined);

  const basePose = base.pose;
  const hasBasePoseGraphOverride = Boolean(
    basePose && Object.prototype.hasOwnProperty.call(basePose, "graph"),
  );
  const hasBasePoseConfigOverride = Boolean(
    basePose && Object.prototype.hasOwnProperty.call(basePose, "config"),
  );
  const poseStageFilter = basePose?.stageNeutralFilter;
  const poseGraphFromBundle =
    hasBasePoseOverride && !basePose
      ? null
      : hasBasePoseGraphOverride
        ? null
        : convertBundleGraph(
            pickBundleGraph(resolvedBundle, ["pose-driver", "pose"]),
          );
  const resolvedPoseGraph = hasBasePoseGraphOverride
    ? basePose?.graph
    : (basePose?.graph ?? poseGraphFromBundle ?? undefined);
  const resolvedPoseConfig = hasBasePoseConfigOverride
    ? basePose?.config
    : (basePose?.config ??
      (resolvedBundle?.poses?.config as PoseRigConfig | undefined) ??
      undefined);

  let resolvedPose = basePose;
  if (hasBasePoseOverride && !basePose) {
    resolvedPose = undefined;
  } else if (basePose) {
    const nextPose: typeof basePose = { ...basePose };
    let changed = false;
    if (resolvedPoseGraph && basePose.graph !== resolvedPoseGraph) {
      nextPose.graph = resolvedPoseGraph;
      changed = true;
    }
    if (resolvedPoseConfig && basePose.config !== resolvedPoseConfig) {
      nextPose.config = resolvedPoseConfig;
      changed = true;
    }
    if (!resolvedPoseGraph && !basePose.graph) {
      // keep as is
    }
    if (!resolvedPoseConfig && !basePose.config) {
      // keep as is
    }
    resolvedPose = changed ? nextPose : basePose;
  } else if (
    resolvedPoseGraph ||
    resolvedPoseConfig ||
    typeof poseStageFilter === "function"
  ) {
    resolvedPose = {
      ...(resolvedPoseGraph ? { graph: resolvedPoseGraph } : {}),
      ...(resolvedPoseConfig ? { config: resolvedPoseConfig } : {}),
      ...(typeof poseStageFilter === "function"
        ? { stageNeutralFilter: poseStageFilter }
        : {}),
    };
  }

  const animationsFromBundle = convertBundleAnimations(
    resolvedBundle?.animations,
  );
  let resolvedAnimations = mergeAnimationLists(
    base.animations,
    hasBaseAnimationsOverride,
    animationsFromBundle,
  );
  const animationsFromAsset =
    extractedAnimations && extractedAnimations.length > 0
      ? extractedAnimations
      : [];
  if (animationsFromAsset.length > 0) {
    resolvedAnimations = mergeAnimationLists(
      resolvedAnimations,
      true,
      animationsFromAsset,
    );
  }
  const programsFromBundle = mergeProgramLists(
    base.programs,
    hasBaseProgramsOverride,
    convertBundlePrograms(resolvedBundle?.graphs),
  );

  const merged: VizijAssetBundle = {
    ...base,
  };

  if (resolvedRig) {
    merged.rig = resolvedRig;
  } else {
    merged.rig = undefined;
  }

  merged.pose = resolvedPose;
  merged.animations = resolvedAnimations;
  merged.programs = programsFromBundle;
  merged.bundle = resolvedBundle;

  return merged;
}

export function prepareRuntimeAssetBundle(
  base: VizijAssetBundle,
  extracted: VizijBundleExtension | null,
  extractedAnimations: VizijAnimationAsset[] | undefined,
): VizijAssetBundle {
  return mergeAssetBundle(base, extracted, extractedAnimations);
}

export type RuntimeAssetView = {
  assetBundle: VizijAssetBundle;
  programs: VizijProgramAsset[];
};

export function prepareRuntimeAssetView(
  base: VizijAssetBundle,
  extracted: VizijBundleExtension | null,
  extractedAnimations: VizijAnimationAsset[] | undefined,
): RuntimeAssetView {
  const assetBundle = prepareRuntimeAssetBundle(
    base,
    extracted,
    extractedAnimations,
  );
  return {
    assetBundle,
    programs: assetBundle.programs ?? [],
  };
}

export function buildGraphRegistrationConfig(args: {
  asset: VizijGraphAsset;
  namespace: string;
  context: string;
  kind?: "graph" | "merged";
  subscriptions?: GraphSubscriptionsLike;
}): GraphRegistrationSupportResult | null {
  const graphSpec = resolveGraphSpec(args.asset, args.context);
  if (!graphSpec) {
    return null;
  }
  const outputs = collectOutputPaths(graphSpec);
  const inputs = collectInputPaths(graphSpec);
  const subs = args.subscriptions ??
    args.asset.subscriptions ?? {
      inputs,
      outputs,
    };

  return {
    spec: graphSpec,
    inputs,
    outputs,
    config: {
      id: namespaceControllerId(args.asset.id, args.namespace, args.kind),
      spec: stripNulls(namespaceGraphSpec(graphSpec, args.namespace)),
      subs: namespaceSubscriptions(subs, args.namespace),
    },
  };
}

export function buildProgramRegistrationConfig(args: {
  program: VizijProgramAsset;
  namespace: string;
}): RuntimeProgramRegistrationSupportResult | null {
  const registration = buildGraphRegistrationConfig({
    asset: args.program.graph,
    namespace: args.namespace,
    context: `${args.program.id ?? "program"} graph`,
  });
  if (!registration) {
    return null;
  }
  return {
    assetId: args.program.id,
    config: registration.config,
    spec: registration.spec,
    inputs: registration.inputs,
    outputs: registration.outputs,
  };
}

export function prepareRuntimeRegistrationPlan(args: {
  assetBundle: VizijAssetBundle;
  namespace: string;
  faceId?: string;
  programs?: VizijProgramAsset[];
}): RuntimeRegistrationPlan {
  const graphRegistrations: GraphRegistrationSupportResult[] = [];
  const animationRegistrations: RuntimeAnimationRegistrationSupportResult[] =
    [];
  const programRegistrations: RuntimeProgramRegistrationSupportResult[] = [];
  const diagnostics: RuntimeRegistrationDiagnostic[] = [];
  const baseOutputPaths = new Set<string>();
  const namespacedOutputPaths = new Set<string>();
  let inputConstraints: Record<string, InputConstraint> = {};

  const recordOutputs = (paths: string[]) => {
    paths.forEach((path) => {
      const trimmed = path.trim();
      if (!trimmed) {
        return;
      }
      const basePath = stripNamespace(trimmed, args.namespace);
      baseOutputPaths.add(basePath);
      namespacedOutputPaths.add(namespaceTypedPath(trimmed, args.namespace));
    });
  };

  let rigInputMap: Record<string, string> = {};
  const rigPoseControlInputIds = new Set<string>();

  const rigAsset = args.assetBundle.rig;
  if (rigAsset) {
    const rigRegistration = buildGraphRegistrationConfig({
      asset: rigAsset,
      namespace: args.namespace,
      context: `${rigAsset.id ?? "rig"} graph`,
    });
    if (!rigRegistration) {
      diagnostics.push({
        level: "error",
        target: "rig",
        id: rigAsset.id,
        message: "Rig graph is missing a usable spec or IR payload.",
      });
    } else {
      rigInputMap = collectInputPathMap(rigRegistration.spec);
      inputConstraints = extractInputConstraints(
        rigRegistration.spec,
        rigAsset.inputMetadata,
        args.namespace,
      );
      rigRegistration.inputs.forEach((path) => {
        const poseControlMatch = /^rig\/[^/]+\/pose\/control\/(.+)$/.exec(
          path.trim(),
        );
        const inputId = (poseControlMatch?.[1] ?? "").trim();
        if (inputId.length > 0) {
          rigPoseControlInputIds.add(inputId);
        }
      });
      recordOutputs(rigRegistration.outputs);
      graphRegistrations.push(rigRegistration);
    }
  }

  const poseGraphAsset = args.assetBundle.pose?.graph;
  if (poseGraphAsset) {
    const poseRegistration = buildGraphRegistrationConfig({
      asset: poseGraphAsset,
      namespace: args.namespace,
      context: `${poseGraphAsset.id ?? "pose"} graph`,
    });
    if (!poseRegistration) {
      diagnostics.push({
        level: "warn",
        target: "pose",
        id: poseGraphAsset.id,
        message:
          "Pose graph is missing a usable spec or IR payload; skipping registration.",
      });
    } else {
      recordOutputs(poseRegistration.outputs);
      graphRegistrations.push(poseRegistration);
    }
  }

  for (const animation of args.assetBundle.animations ?? []) {
    const outputPaths = collectAnimationClipOutputPaths(
      animation.clip as AnimationClipLike,
      args.faceId,
      rigInputMap,
    );
    recordOutputs(outputPaths);

    const controllerId =
      namespaceControllerId(animation.id, args.namespace, "animation") ??
      animation.id;
    const animationPayload =
      animation.setup?.animation ??
      toStoredAnimationClip(animation.id, animation.clip as AnimationClipLike);
    animationRegistrations.push({
      assetId: animation.id,
      outputPaths,
      config: {
        id: controllerId,
        setup: {
          ...(animation.setup ?? {}),
          animation: animationPayload,
        } as AnimationRegistrationConfig["setup"],
      },
    });
  }

  const programs = args.programs ?? args.assetBundle.programs ?? [];
  for (const program of programs) {
    const programRegistration = buildProgramRegistrationConfig({
      program,
      namespace: args.namespace,
    });
    if (!programRegistration) {
      diagnostics.push({
        level: "warn",
        target: "program",
        id: program.id,
        message: `Program ${program.id} is missing a usable graph payload.`,
      });
      continue;
    }
    recordOutputs(programRegistration.outputs);
    programRegistrations.push(programRegistration);
  }

  const graphConfigs = graphRegistrations.map(
    (registration) => registration.config,
  );
  return {
    graphRegistrations,
    graphConfigs,
    animationRegistrations,
    programRegistrations,
    baseOutputPaths: Array.from(baseOutputPaths),
    namespacedOutputPaths: Array.from(namespacedOutputPaths),
    outputPaths: Array.from(namespacedOutputPaths),
    inputConstraints,
    rigInputMap,
    rigPoseControlInputIds: Array.from(rigPoseControlInputIds),
    diagnostics,
  };
}

function normalizeStoredAnimationInterpolation(
  interpolation: unknown,
): "linear" | "step" | "cubic" {
  const mode =
    typeof interpolation === "string"
      ? interpolation.trim().toLowerCase()
      : "linear";
  if (mode === "step") {
    return "step";
  }
  if (mode === "cubic" || mode === "cubicspline") {
    return "cubic";
  }
  return "linear";
}

function buildStoredAnimationTransitions(mode: "linear" | "step" | "cubic") {
  if (mode === "cubic") {
    return undefined;
  }
  if (mode === "step") {
    return {
      in: "linear",
      out: { x: 0, y: 0 },
    };
  }
  return {
    in: "linear",
    out: "linear",
  };
}

export function toStoredAnimationClip(
  fallbackId: string,
  clip: AnimationClipLike,
): Record<string, unknown> {
  const clipId =
    typeof clip.id === "string" && clip.id.trim().length > 0
      ? clip.id.trim()
      : fallbackId;
  const clipName =
    typeof clip.name === "string" && clip.name.trim().length > 0
      ? clip.name.trim()
      : clipId;
  const durationSeconds = resolveClipDurationSeconds(clip, 0);
  const durationMs = Math.max(1, Math.round(durationSeconds * 1000));

  const tracks = (Array.isArray(clip.tracks) ? clip.tracks : [])
    .map((rawTrack, trackIndex) => {
      const channel =
        typeof rawTrack.channel === "string" ? rawTrack.channel.trim() : "";
      if (!channel) {
        return null;
      }
      const keyframes = (
        Array.isArray(rawTrack.keyframes) ? rawTrack.keyframes : []
      )
        .map((keyframe) => {
          const time = Number(keyframe.time);
          const value = Number(keyframe.value);
          const keyframeId = keyframe["id"];
          const keyframeInterpolation = keyframe["interpolation"];
          if (!Number.isFinite(time) || !Number.isFinite(value)) {
            return null;
          }
          return {
            id:
              typeof keyframeId === "string" && keyframeId.trim().length > 0
                ? keyframeId.trim()
                : `${clipId}:track-${trackIndex.toString().padStart(4, "0")}:point-${time.toFixed(6)}`,
            time,
            value,
            mode: normalizeStoredAnimationInterpolation(
              keyframeInterpolation ?? rawTrack.interpolation,
            ),
          };
        })
        .filter(Boolean) as Array<{
        id: string;
        time: number;
        value: number;
        mode: "linear" | "step" | "cubic";
      }>;

      if (keyframes.length === 0) {
        return null;
      }

      keyframes.sort((left, right) => {
        if (left.time !== right.time) {
          return left.time - right.time;
        }
        return left.id.localeCompare(right.id);
      });

      const rawTrackId = rawTrack["id"];
      const rawTrackName = rawTrack["name"];
      const trackId =
        typeof rawTrackId === "string" && rawTrackId.trim().length > 0
          ? rawTrackId.trim()
          : `${clipId}:track-${trackIndex.toString().padStart(4, "0")}`;
      const trackName =
        typeof rawTrackName === "string" && rawTrackName.trim().length > 0
          ? rawTrackName.trim()
          : channel.replace(/^\/+/, "") || trackId;
      return {
        id: trackId,
        name: trackName,
        animatableId: channel,
        points: keyframes.map((keyframe) => {
          const stamp = Math.max(0, Math.round(keyframe.time * 1000));
          const transitions = buildStoredAnimationTransitions(keyframe.mode);
          return {
            id: keyframe.id,
            stamp,
            value: keyframe.value,
            ...(transitions ? { transitions } : {}),
          };
        }),
      };
    })
    .filter(Boolean);

  return {
    id: clipId,
    name: clipName,
    formatVersion: 2,
    defaultViewportExtent: durationMs,
    groups: {},
    tracks,
  };
}
