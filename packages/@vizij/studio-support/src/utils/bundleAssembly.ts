import {
  type VizijBundleAnimationEntry,
  type VizijBundleExtension,
  type VizijPoseRigConfig,
  type VizijSpeechConfig,
} from "@vizij/render";
import {
  buildRigGraphSpec,
  type BindingMap,
  type InputBindingMap,
} from "@vizij/node-graph-authoring";
import { normalizeGraphSpec, type GraphSpec } from "@vizij/node-graph-wasm";
import type {
  AnimatableComponent,
  AnimatableValue,
  StandardRigInput,
} from "@vizij/utils";
import { cloneDeepSafe } from "@vizij/utils";
import {
  AUTHORED_TIMELINE_CLIP_ID,
  AUTHORED_TIMELINE_METADATA_ORIGIN,
  type AnimationClipIR,
} from "../types/animationClipIr";
import {
  clipIrToBundleAnimationEntry,
  findCanonicalAuthoredTimelineConflict,
} from "./animationClipCompiler";
import {
  buildPoseComposeModeByInputId,
  resolvePipelineMetadataForExport,
  withPipelineConfigBuildOptions,
  type PipelineConfigByInputId,
  type PoseConfigSnapshot,
} from "./pipelineMetadata";
import type { VizijPipelineMetadataV1 } from "./standardInputRemap";
import {
  auditBundleGraphs,
  resolveBundleContractViolationMessage,
  type BundleGraphAuditEntry,
} from "./bundleAudit";

export interface MotionGraphBundleEntry {
  id: string;
  label?: string;
  spec: { nodes: unknown[]; edges: unknown[] };
  resetValues?: Record<string, number>;
}

export interface AuthoringPoseBundleState {
  poseGraphSpec?: GraphSpec | null;
  poseGraphFileName?: string | null;
  poseConfig?: AuthoringPoseConfig | null;
  poseIr?: unknown | null;
  poseDiagnostics?: AuthoringPoseDiagnostic[];
}

export type AuthoringPoseConfig = Omit<PoseConfigSnapshot, "poses"> & {
  version: number;
  faceId?: string | null;
  neutralInputs: Record<string, number>;
  poses: Array<{
    id?: string;
    name?: string;
    description?: string;
    group?: string | null;
    groupId?: string | null;
    groupIds?: string[];
    values: Record<string, number | undefined>;
    composeModes?: Record<string, unknown>;
    createdAt?: string;
    updatedAt?: string;
  }>;
};

export interface AuthoringPoseDiagnostic {
  id?: string;
  severity: "warning" | "error" | "info";
  message?: string;
  code?: string;
  source?: string;
  location?: unknown;
  metadata?: unknown;
}

export interface BuildAuthoringVizijBundleOptions {
  includeVizijBundle: boolean;
  includeImportedAnimations: boolean;
  authoredAnimationClips?: AnimationClipIR[];
  faceId: string | null | undefined;
  sourceName: string | null;
  loadedBundle: VizijBundleExtension | null;
  pose: AuthoringPoseBundleState;
  animatablesForExport: Record<string, AnimatableValue>;
  animatableComponents: AnimatableComponent[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  standardInputsById: Map<string, StandardRigInput>;
  featureLabelOverrides: Record<string, string>;
  inputMetadata?: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  pipelineMetadataV1?: VizijPipelineMetadataV1 | null;
  pipelineConfigByInputId?: PipelineConfigByInputId;
  speechConfig?: VizijSpeechConfig | null;
  motionGraphs?: MotionGraphBundleEntry[];
  fallbackMotionGraph?: MotionGraphBundleEntry | null;
  activeMotionGraphId?: string | null;
}

export interface PrepareAuthoringVizijBundleForExportOptions
  extends Omit<
    BuildAuthoringVizijBundleOptions,
    "pose" | "authoredAnimationClips" | "fallbackMotionGraph"
  > {
  poseGraphFileName?: string | null;
  poseConfigCandidate?: AuthoringPoseConfig | null;
  poseIr?: unknown | null;
  poseDiagnostics?: AuthoringPoseDiagnostic[];
  poseGraphBuildOptions?: {
    defaultGroupBlendMode?: "average" | "additive";
    crossGroupBlendMode?: "average" | "additive";
  };
  buildPoseGraphSpec?: (
    config: AuthoringPoseConfig,
    standardInputs: StandardRigInput[],
    options: {
      defaultGroupBlendMode?: "average" | "additive";
      crossGroupBlendMode?: "average" | "additive";
    },
  ) => { spec: GraphSpec };
  validatePoseGraphSpec?: (
    spec: GraphSpec,
    standardInputs: StandardRigInput[],
  ) => string[];
  authoredAnimationClips?: AnimationClipIR[];
  fallbackAuthoredAnimationClip?: AnimationClipIR | null;
  fallbackMotionGraphSpec?: { nodes: unknown[]; edges: unknown[] } | null;
  fallbackMotionGraphId?: string;
  fallbackMotionGraphLabel?: string;
  validOutputTargets?: Set<string>;
  auditBundleGraphs?: (
    bundle: VizijBundleExtension,
    options?: { validOutputTargets?: Set<string> },
  ) => Promise<BundleGraphAuditEntry[]>;
}

export interface PrepareAuthoringVizijBundleForExportError {
  kind:
    | "bundle-build"
    | "bundle-contract"
    | "pose-graph-build"
    | "pose-graph-validation"
    | "rig-graph-fatal"
    | "rig-graph-validation";
  message: string;
}

export interface PrepareAuthoringVizijBundleForExportDiagnostics {
  poseConfigCandidateCount: number | null;
  hasAuthoredPoseData: boolean;
  poseGraphBuilt: boolean;
  poseGraphNodeCount: number | null;
  poseGraphHasPoseConstants: boolean;
  authoredAnimationClipCount: number;
  fallbackMotionGraphUsed: boolean;
}

export interface PrepareAuthoringVizijBundleForExportResult {
  bundle: VizijBundleExtension | null;
  poseGraphSpec: GraphSpec | null;
  poseConfig: AuthoringPoseConfig | null;
  authoredAnimationClips: AnimationClipIR[];
  fallbackMotionGraph: MotionGraphBundleEntry | null;
  diagnostics: PrepareAuthoringVizijBundleForExportDiagnostics;
  error: PrepareAuthoringVizijBundleForExportError | null;
}

export interface BuildAuthoringRigGraphArtifactsOptions {
  faceId: string | null | undefined;
  animatablesForExport: Record<string, AnimatableValue>;
  animatableComponents: AnimatableComponent[];
  bindings: BindingMap;
  inputBindings: InputBindingMap;
  standardInputsById: Map<string, StandardRigInput>;
  featureLabelOverrides?: Record<string, string>;
  inputMetadata?: Map<
    string,
    { source?: "auto" | "custom" | "preset"; root?: string }
  >;
  pipelineMetadataV1?: VizijPipelineMetadataV1 | null;
  pipelineConfigByInputId?: PipelineConfigByInputId;
  poseConfigForCompose?: PoseConfigSnapshot | null;
}

export interface AuthoringRigGraphArtifacts {
  faceId: string;
  faceSlug: string;
  graphResult: ReturnType<typeof buildRigGraphSpec>;
  spec: Record<string, unknown>;
  irGraph?: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

function cloneSerializable<T>(value: T): T {
  return cloneDeepSafe(value);
}

function faceSlug(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "vizij";
  }
  return trimmed.replace(/\s+/g, "_");
}

function resolveExportFaceId(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : faceSlug(value);
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function hasAuthoredPoseData(config: AuthoringPoseConfig | null): boolean {
  return Boolean(config && Array.isArray(config.poses) && config.poses.length);
}

export function hasAuthoringPoseConstantNodes(
  spec: GraphSpec | null | undefined,
): boolean {
  if (!spec || !Array.isArray(spec.nodes)) {
    return false;
  }
  return spec.nodes.some((node: { id?: unknown } | null | undefined) => {
    if (!node || typeof node.id !== "string") {
      return false;
    }
    return node.id.startsWith("pose_record_");
  });
}

export function buildAuthoringRigGraphArtifacts(
  options: BuildAuthoringRigGraphArtifactsOptions,
): AuthoringRigGraphArtifacts {
  const exportFaceId = resolveExportFaceId(options.faceId);
  const exportFaceSlug = faceSlug(exportFaceId);
  const pipelineMetadataForExport = resolvePipelineMetadataForExport(
    options.pipelineMetadataV1,
    options.pipelineConfigByInputId,
    new Set(options.standardInputsById.keys()),
  );
  const pipelineConfigByInputIdForExport =
    pipelineMetadataForExport &&
    typeof pipelineMetadataForExport.byInputId === "object" &&
    pipelineMetadataForExport.byInputId !== null &&
    !Array.isArray(pipelineMetadataForExport.byInputId)
      ? (pipelineMetadataForExport.byInputId as PipelineConfigByInputId)
      : options.pipelineConfigByInputId;

  const graphResult = buildRigGraphSpec(
    withPipelineConfigBuildOptions(
      {
        faceId: exportFaceId,
        animatables: options.animatablesForExport,
        components: options.animatableComponents,
        bindings: options.bindings,
        inputsById: options.standardInputsById,
        inputBindings: options.inputBindings,
        inputMetadata: options.inputMetadata,
        inputComposeModesById: buildPoseComposeModeByInputId(
          options.poseConfigForCompose ?? null,
        ),
      },
      pipelineConfigByInputIdForExport,
      pipelineMetadataForExport,
    ),
  );
  const irGraph = graphResult.ir?.graph
    ? (cloneSerializable(graphResult.ir.graph) as unknown as Record<
        string,
        unknown
      >)
    : undefined;
  const spec = cloneSerializable(graphResult.spec) as Record<string, unknown>;

  return {
    faceId: exportFaceId,
    faceSlug: exportFaceSlug,
    graphResult,
    spec,
    irGraph,
    metadata: {
      faceId: exportFaceId,
      featureLabelOverrides:
        options.featureLabelOverrides &&
        Object.keys(options.featureLabelOverrides).length > 0
          ? options.featureLabelOverrides
          : undefined,
      issues:
        graphResult.issues.fatal.length > 0 ? graphResult.issues : undefined,
    },
  };
}

function clonePoseIrForBundle(
  value: unknown,
  faceId: string,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const cloned = cloneSerializable(value as Record<string, unknown>) as Record<
    string,
    unknown
  >;
  cloned.faceId = faceId;
  return cloned;
}

function withPoseConfigFaceId<T extends AuthoringPoseConfig>(
  config: T,
  faceId: string,
): T {
  if (config.faceId === faceId) {
    return config;
  }
  return {
    ...config,
    faceId,
  };
}

function normalizeMotionGraphs(
  motionGraphs: MotionGraphBundleEntry[] | null | undefined,
  fallbackMotionGraph?: MotionGraphBundleEntry | null,
): MotionGraphBundleEntry[] {
  const authored = (motionGraphs ?? []).filter(
    (entry) =>
      entry &&
      typeof entry.id === "string" &&
      entry.id.trim().length > 0 &&
      entry.spec &&
      Array.isArray(entry.spec.nodes) &&
      Array.isArray(entry.spec.edges) &&
      entry.spec.nodes.length > 0,
  );
  if (authored.length > 0) {
    return authored;
  }
  if (
    fallbackMotionGraph &&
    fallbackMotionGraph.spec &&
    Array.isArray(fallbackMotionGraph.spec.nodes) &&
    Array.isArray(fallbackMotionGraph.spec.edges) &&
    fallbackMotionGraph.spec.nodes.length > 0
  ) {
    return [fallbackMotionGraph];
  }
  return [];
}

export function normalizeMotionGraphResetValues(
  resetValues: unknown,
): Record<string, number> | undefined {
  if (
    !resetValues ||
    typeof resetValues !== "object" ||
    Array.isArray(resetValues)
  ) {
    return undefined;
  }
  const entries = Object.entries(resetValues).filter(([path, value]) => {
    return path.trim().length > 0 && Number.isFinite(Number(value));
  });
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(
    entries.map(([path, value]) => [path, Number(value)]),
  );
}

export function mergeMotionGraphsIntoBundle(
  bundle: VizijBundleExtension,
  motionGraphs: MotionGraphBundleEntry[],
): VizijBundleExtension {
  const cloned = cloneSerializable(bundle);
  cloned.graphs = (cloned.graphs ?? []).filter(
    (graph) => graph.kind !== "motiongraph",
  );
  motionGraphs.forEach((motionGraph) => {
    const resetValues = normalizeMotionGraphResetValues(
      motionGraph.resetValues,
    );
    cloned.graphs!.push({
      id: motionGraph.id,
      kind: "motiongraph",
      label: motionGraph.label ?? motionGraph.id,
      spec: motionGraph.spec as Record<string, unknown>,
      metadata: {
        exportedAt: new Date().toISOString(),
        source: "vizij-motiongraph",
        nodeCount: motionGraph.spec.nodes.length,
        edgeCount: motionGraph.spec.edges.length,
        ...(resetValues ? { resetValues } : {}),
      },
    });
  });
  return cloned;
}

export function buildAuthoringVizijBundle(
  options: BuildAuthoringVizijBundleOptions,
): VizijBundleExtension | null {
  if (!options.includeVizijBundle) {
    return null;
  }
  const {
    includeImportedAnimations,
    authoredAnimationClips,
    faceId,
    sourceName,
    loadedBundle,
    pose,
    animatablesForExport,
    animatableComponents,
    bindings,
    inputBindings,
    standardInputsById,
    featureLabelOverrides,
    inputMetadata,
    pipelineMetadataV1,
    pipelineConfigByInputId,
  } = options;
  const poseConfigForCompose = pose.poseConfig ?? null;
  const exportTimestamp = new Date().toISOString();
  const rigGraphArtifacts = buildAuthoringRigGraphArtifacts({
    faceId,
    animatablesForExport,
    animatableComponents,
    bindings,
    inputBindings,
    standardInputsById,
    featureLabelOverrides,
    inputMetadata,
    pipelineMetadataV1,
    pipelineConfigByInputId,
    poseConfigForCompose,
  });
  const exportFaceId = rigGraphArtifacts.faceId;
  const exportFaceSlug = rigGraphArtifacts.faceSlug;

  const graphs: NonNullable<VizijBundleExtension["graphs"]> = [
    {
      id: exportFaceId,
      kind: "rig",
      label: `${exportFaceSlug} rig`,
      spec: rigGraphArtifacts.spec,
      ir: rigGraphArtifacts.irGraph ?? null,
      metadata: {
        exportedAt: exportTimestamp,
        ...rigGraphArtifacts.metadata,
      },
    },
  ];

  if (pose.poseGraphSpec) {
    graphs.push({
      id: pose.poseGraphFileName || `${exportFaceSlug}_pose_graph`,
      kind: "pose-driver",
      label: pose.poseGraphFileName || "pose graph",
      spec: cloneSerializable(pose.poseGraphSpec) as unknown as Record<
        string,
        unknown
      >,
      metadata: { exportedAt: exportTimestamp, faceId: exportFaceId },
    });
  }

  const poseConfig: VizijPoseRigConfig | null = pose.poseConfig
    ? (cloneSerializable(
        withPoseConfigFaceId(pose.poseConfig, exportFaceId),
      ) as unknown as VizijPoseRigConfig)
    : null;
  const poseIrForBundle = clonePoseIrForBundle(pose.poseIr, exportFaceId);
  const poseDiagnostics = cloneSerializable(
    pose.poseDiagnostics ?? [],
  ) as AuthoringPoseDiagnostic[];
  const diagnosticSummary = {
    errors: poseDiagnostics.filter((entry) => entry.severity === "error")
      .length,
    warnings: poseDiagnostics.filter((entry) => entry.severity === "warning")
      .length,
    info: poseDiagnostics.filter((entry) => entry.severity === "info").length,
  };

  const inheritedAnimations: VizijBundleAnimationEntry[] =
    includeImportedAnimations && Array.isArray(loadedBundle?.animations)
      ? (cloneSerializable(
          loadedBundle.animations,
        ) as VizijBundleAnimationEntry[])
      : [];
  const authoredAnimationEntries = (authoredAnimationClips ?? [])
    .map((clip) =>
      clipIrToBundleAnimationEntry(clip, {
        standardInputsById,
      }),
    )
    .filter(
      (entry) =>
        Boolean(entry) &&
        Boolean(entry.clip) &&
        Array.isArray(entry.clip.tracks) &&
        entry.clip.tracks.length > 0,
    );

  if (authoredAnimationEntries.length > 0 && includeImportedAnimations) {
    const conflictingCanonicalEntry =
      findCanonicalAuthoredTimelineConflict(inheritedAnimations);
    if (conflictingCanonicalEntry) {
      throw new Error(
        `Export blocked: imported animation "${AUTHORED_TIMELINE_CLIP_ID}" is not marked as authored timeline metadata.origin="${AUTHORED_TIMELINE_METADATA_ORIGIN}". Rename the imported clip or disable imported animation inheritance.`,
      );
    }
  }

  const mergedAnimationsById = new Map<string, VizijBundleAnimationEntry>();
  inheritedAnimations.forEach((entry) => {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      entry.id.trim().length === 0
    ) {
      return;
    }
    mergedAnimationsById.set(entry.id, entry);
  });
  authoredAnimationEntries.forEach((entry) => {
    mergedAnimationsById.set(entry.id, entry);
  });
  const mergedAnimations = Array.from(mergedAnimationsById.values()).sort(
    (left, right) => left.id.localeCompare(right.id),
  );

  const bundleMetadata: Record<string, unknown> = {
    faceId: exportFaceId,
    source: sourceName ?? null,
    exporter: "vizij-authoring",
  };

  if (loadedBundle) {
    bundleMetadata.previousBundleVersion = loadedBundle.version;
    if (loadedBundle.exportedAt) {
      bundleMetadata.previousExportedAt = loadedBundle.exportedAt;
    }
  }

  if (!includeImportedAnimations) {
    bundleMetadata.inheritedAnimations = false;
  }
  bundleMetadata.authoredAnimationClips = authoredAnimationEntries.length;
  bundleMetadata.animationPayloadCount = mergedAnimations.length;

  if (options.speechConfig) {
    bundleMetadata.speechConfig = options.speechConfig;
  }

  let bundle: VizijBundleExtension = {
    version: 1,
    exportedAt: exportTimestamp,
    graphs,
    poses: poseConfig
      ? {
          config: poseConfig,
          metadata: {
            exportedAt: exportTimestamp,
            poseIr: poseIrForBundle,
            diagnostics: poseDiagnostics,
            diagnosticSummary,
          },
        }
      : null,
    animations: mergedAnimations,
    metadata: bundleMetadata,
  };

  const motionGraphs = normalizeMotionGraphs(
    options.motionGraphs,
    options.fallbackMotionGraph,
  );
  if (motionGraphs.length > 0) {
    bundle = mergeMotionGraphsIntoBundle(bundle, motionGraphs);
  }
  if (
    options.activeMotionGraphId &&
    bundle.graphs?.some(
      (graph) =>
        graph.kind === "motiongraph" &&
        graph.id === options.activeMotionGraphId,
    )
  ) {
    bundle = {
      ...bundle,
      metadata: {
        ...bundle.metadata,
        activeMotionGraphId: options.activeMotionGraphId,
      },
    };
  }

  return bundle;
}

function normalizeAuthoredAnimationClips(
  authoredAnimationClips: AnimationClipIR[] | undefined,
  fallbackAuthoredAnimationClip: AnimationClipIR | null | undefined,
): AnimationClipIR[] {
  const authoredClipCandidates =
    Array.isArray(authoredAnimationClips) && authoredAnimationClips.length > 0
      ? authoredAnimationClips
      : fallbackAuthoredAnimationClip
        ? [fallbackAuthoredAnimationClip]
        : [];

  return authoredClipCandidates.filter((clip) =>
    clip.tracks.some(
      (track) => Array.isArray(track.keyframes) && track.keyframes.length > 0,
    ),
  );
}

function resolveFallbackMotionGraph(
  spec: { nodes: unknown[]; edges: unknown[] } | null | undefined,
  id = "motiongraph",
  label = "motiongraph",
): MotionGraphBundleEntry | null {
  if (!spec || !Array.isArray(spec.nodes) || spec.nodes.length === 0) {
    return null;
  }
  return {
    id,
    label,
    spec,
  };
}

export async function prepareAuthoringVizijBundleForExport(
  options: PrepareAuthoringVizijBundleForExportOptions,
): Promise<PrepareAuthoringVizijBundleForExportResult> {
  const standardInputs = Array.from(options.standardInputsById.values());
  const exportFaceId = resolveExportFaceId(options.faceId);
  const poseConfigCandidate = options.poseConfigCandidate
    ? withPoseConfigFaceId(options.poseConfigCandidate, exportFaceId)
    : null;
  let poseConfigForExport = hasAuthoredPoseData(poseConfigCandidate)
    ? poseConfigCandidate
    : null;
  let poseGraphSpecForExport: GraphSpec | null = null;
  let poseGraphBuilt = false;
  let poseGraphNodeCount: number | null = null;
  let poseGraphHasPoseConstants = false;

  if (poseConfigForExport && options.buildPoseGraphSpec) {
    try {
      const { spec } = options.buildPoseGraphSpec(
        poseConfigForExport,
        standardInputs,
        options.poseGraphBuildOptions ?? {},
      );
      poseGraphBuilt = true;
      poseGraphNodeCount = Array.isArray(spec.nodes) ? spec.nodes.length : null;
      poseGraphHasPoseConstants = hasAuthoringPoseConstantNodes(spec);
      if (poseGraphHasPoseConstants) {
        poseGraphSpecForExport = spec;
      } else {
        poseConfigForExport = null;
      }
    } catch (error) {
      return {
        bundle: null,
        poseGraphSpec: null,
        poseConfig: null,
        authoredAnimationClips: [],
        fallbackMotionGraph: null,
        diagnostics: {
          poseConfigCandidateCount: Array.isArray(poseConfigCandidate?.poses)
            ? poseConfigCandidate.poses.length
            : null,
          hasAuthoredPoseData: Boolean(poseConfigForExport),
          poseGraphBuilt,
          poseGraphNodeCount,
          poseGraphHasPoseConstants,
          authoredAnimationClipCount: 0,
          fallbackMotionGraphUsed: false,
        },
        error: {
          kind: "pose-graph-build",
          message: `Failed to build pose graph for export: ${formatUnknownError(
            error,
          )}`,
        },
      };
    }
  }

  const authoredAnimationClips = normalizeAuthoredAnimationClips(
    options.authoredAnimationClips,
    options.fallbackAuthoredAnimationClip,
  );
  const fallbackMotionGraph = resolveFallbackMotionGraph(
    options.fallbackMotionGraphSpec,
    options.fallbackMotionGraphId,
    options.fallbackMotionGraphLabel,
  );

  let bundle: VizijBundleExtension | null;
  try {
    bundle = buildAuthoringVizijBundle({
      ...options,
      faceId: exportFaceId,
      pose: {
        poseGraphSpec: poseGraphSpecForExport,
        poseGraphFileName: options.poseGraphFileName,
        poseConfig: poseConfigForExport,
        poseIr: options.poseIr,
        poseDiagnostics: options.poseDiagnostics,
      },
      authoredAnimationClips,
      fallbackMotionGraph,
    });
  } catch (error) {
    return {
      bundle: null,
      poseGraphSpec: poseGraphSpecForExport,
      poseConfig: poseConfigForExport,
      authoredAnimationClips,
      fallbackMotionGraph,
      diagnostics: {
        poseConfigCandidateCount: Array.isArray(poseConfigCandidate?.poses)
          ? poseConfigCandidate.poses.length
          : null,
        hasAuthoredPoseData: Boolean(poseConfigForExport),
        poseGraphBuilt,
        poseGraphNodeCount,
        poseGraphHasPoseConstants,
        authoredAnimationClipCount: authoredAnimationClips.length,
        fallbackMotionGraphUsed: Boolean(fallbackMotionGraph),
      },
      error: {
        kind: "bundle-build",
        message: formatUnknownError(error),
      },
    };
  }

  const diagnostics: PrepareAuthoringVizijBundleForExportDiagnostics = {
    poseConfigCandidateCount: Array.isArray(poseConfigCandidate?.poses)
      ? poseConfigCandidate.poses.length
      : null,
    hasAuthoredPoseData: Boolean(poseConfigForExport),
    poseGraphBuilt,
    poseGraphNodeCount,
    poseGraphHasPoseConstants,
    authoredAnimationClipCount: authoredAnimationClips.length,
    fallbackMotionGraphUsed: Boolean(fallbackMotionGraph),
  };

  if (!bundle?.graphs?.length) {
    return {
      bundle,
      poseGraphSpec: poseGraphSpecForExport,
      poseConfig: poseConfigForExport,
      authoredAnimationClips,
      fallbackMotionGraph,
      diagnostics,
      error: null,
    };
  }

  const rigGraph = bundle.graphs.find((graph) => graph.kind === "rig");
  const fatalIssues = (
    rigGraph?.metadata as { issues?: { fatal?: unknown[] } } | undefined
  )?.issues?.fatal;
  if (Array.isArray(fatalIssues) && fatalIssues.length > 0) {
    return {
      bundle,
      poseGraphSpec: poseGraphSpecForExport,
      poseConfig: poseConfigForExport,
      authoredAnimationClips,
      fallbackMotionGraph,
      diagnostics,
      error: {
        kind: "rig-graph-fatal",
        message: "Fix rig graph errors before exporting the bundled GLB.",
      },
    };
  }

  if (rigGraph?.spec) {
    try {
      await normalizeGraphSpec(rigGraph.spec as GraphSpec);
    } catch (error) {
      return {
        bundle,
        poseGraphSpec: poseGraphSpecForExport,
        poseConfig: poseConfigForExport,
        authoredAnimationClips,
        fallbackMotionGraph,
        diagnostics,
        error: {
          kind: "rig-graph-validation",
          message: `Rig graph validation failed: ${formatUnknownError(error)}`,
        },
      };
    }
  }

  if (poseGraphSpecForExport && options.validatePoseGraphSpec) {
    const poseWarnings = options.validatePoseGraphSpec(
      poseGraphSpecForExport,
      standardInputs,
    );
    if (poseWarnings.length > 0) {
      return {
        bundle,
        poseGraphSpec: poseGraphSpecForExport,
        poseConfig: poseConfigForExport,
        authoredAnimationClips,
        fallbackMotionGraph,
        diagnostics,
        error: {
          kind: "pose-graph-validation",
          message: `Pose graph is invalid:\n${poseWarnings.join("\n")}`,
        },
      };
    }
  }

  const auditBundleGraphsForExport =
    options.auditBundleGraphs ?? auditBundleGraphs;
  const bundleAudits = await auditBundleGraphsForExport(bundle, {
    validOutputTargets: options.validOutputTargets,
  });
  const contractViolationMessage =
    resolveBundleContractViolationMessage(bundleAudits);
  if (contractViolationMessage) {
    return {
      bundle,
      poseGraphSpec: poseGraphSpecForExport,
      poseConfig: poseConfigForExport,
      authoredAnimationClips,
      fallbackMotionGraph,
      diagnostics,
      error: {
        kind: "bundle-contract",
        message: contractViolationMessage,
      },
    };
  }

  return {
    bundle,
    poseGraphSpec: poseGraphSpecForExport,
    poseConfig: poseConfigForExport,
    authoredAnimationClips,
    fallbackMotionGraph,
    diagnostics,
    error: null,
  };
}
